#!/usr/bin/env python3
import asyncio
import contextlib
import math
import os
import re
import tempfile
import time
from pathlib import Path

import numpy as np
from aiohttp import MultipartReader, WSMsgType, web
from scipy import signal as scipy_signal
from scipy.io import wavfile


HOST = "127.0.0.1"
PORT = 8765
FFT_SIZE = 1024
FFT_BYTES = FFT_SIZE * 2
FFT_INTERVAL_SECONDS = 0.05
MAX_UPLOAD_BYTES = 128 * 1024 * 1024
MAX_DIRECT_WAV_SECONDS = 30
SUPPORTED_BANDWIDTHS = [
    1_750_000,
    2_500_000,
    3_500_000,
    5_000_000,
    5_500_000,
    6_000_000,
    7_000_000,
    8_000_000,
    9_000_000,
    10_000_000,
    12_000_000,
    14_000_000,
    15_000_000,
    20_000_000,
    24_000_000,
    28_000_000,
]
FM_DEVIATIONS = {
    "FM": 25_000.0,
    "NFM": 5_000.0,
    "WFM": 75_000.0,
}
ALLOWED_SUFFIXES = {".wav", ".iq", ".cs8", ".cf32", ".cf64", ".sc16"}


class BridgeError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def json_response(payload, status=200):
    return web.json_response(payload, status=status)


def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        return add_cors_headers(web.Response(status=204))

    try:
        response = await handler(request)
    except BridgeError as exc:
        response = json_response({"ok": False, "error": exc.message}, status=exc.status)
    except web.HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - guard rail for runtime errors
        response = json_response({"ok": False, "error": str(exc)}, status=500)

    return add_cors_headers(response)


def nearest_supported_bandwidth(requested_hz):
    return min(SUPPORTED_BANDWIDTHS, key=lambda candidate: abs(candidate - int(requested_hz)))


def normalize_audio_samples(data):
    if np.issubdtype(data.dtype, np.floating):
        audio = np.asarray(data, dtype=np.float32)
    elif data.dtype == np.uint8:
        audio = (np.asarray(data, dtype=np.float32) - 128.0) / 128.0
    else:
        limit = float(max(abs(np.iinfo(data.dtype).min), np.iinfo(data.dtype).max))
        audio = np.asarray(data, dtype=np.float32) / limit

    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    audio = np.nan_to_num(audio, nan=0.0, posinf=0.0, neginf=0.0)
    audio -= float(audio.mean()) if audio.size else 0.0
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 0:
        audio /= peak
    return audio.astype(np.float32, copy=False)


def resample_audio(audio, src_rate, dst_rate):
    src_rate = int(src_rate)
    dst_rate = int(dst_rate)
    if src_rate == dst_rate:
        return audio

    gcd = math.gcd(src_rate, dst_rate)
    up = dst_rate // gcd
    down = src_rate // gcd
    return scipy_signal.resample_poly(audio, up, down).astype(np.float32, copy=False)


def ensure_even_length(arr):
    if arr.size % 2:
        return arr[:-1]
    return arr


def complex_to_cs8_bytes(iq):
    iq = np.nan_to_num(np.asarray(iq, dtype=np.complex64), nan=0.0)
    if iq.size == 0:
        raise BridgeError("Prepared IQ stream is empty")

    peak = max(float(np.max(np.abs(iq.real))), float(np.max(np.abs(iq.imag))), 1e-6)
    i = np.clip(np.round((iq.real / peak) * 127.0), -128, 127).astype(np.int8)
    q = np.clip(np.round((iq.imag / peak) * 127.0), -128, 127).astype(np.int8)

    interleaved = np.empty(i.size * 2, dtype=np.int8)
    interleaved[0::2] = i
    interleaved[1::2] = q
    return interleaved.tobytes()


def prepare_wav_modulation(path, modulation, sample_rate):
    source_rate, raw = wavfile.read(path)
    audio = normalize_audio_samples(raw)
    duration_seconds = audio.size / max(int(source_rate), 1)
    if duration_seconds > MAX_DIRECT_WAV_SECONDS:
        raise BridgeError(
            f"WAV sources longer than {MAX_DIRECT_WAV_SECONDS} seconds should be preconverted to IQ"
        )
    audio = resample_audio(audio, source_rate, sample_rate)

    if audio.size == 0:
        raise BridgeError("WAV source did not contain usable samples")

    if modulation in {"FM", "NFM", "WFM"}:
        deviation = FM_DEVIATIONS[modulation]
        phase = np.cumsum(audio, dtype=np.float64) * (2.0 * math.pi * deviation / sample_rate)
        iq = np.exp(1j * phase).astype(np.complex64)
    elif modulation == "AM":
        envelope = 0.65 + 0.35 * np.clip(audio, -1.0, 1.0)
        iq = envelope.astype(np.complex64)
    elif modulation == "USB":
        iq = scipy_signal.hilbert(audio).astype(np.complex64)
    elif modulation == "LSB":
        iq = np.conjugate(scipy_signal.hilbert(audio)).astype(np.complex64)
    elif modulation == "CW":
        envelope = np.where(np.abs(audio) > 0.025, 1.0, 0.0).astype(np.float32)
        tone = np.exp(1j * (2.0 * math.pi * 800.0 * np.arange(audio.size) / sample_rate)).astype(np.complex64)
        iq = 0.9 * tone * envelope
    else:
        raise BridgeError(f"Unsupported modulation: {modulation}")

    return complex_to_cs8_bytes(iq)


def prepare_raw_iq(path, suffix):
    suffix = suffix.lower()
    if suffix in {".iq", ".cs8"}:
        raw = Path(path).read_bytes()
        if len(raw) < 2:
            raise BridgeError("IQ source file is empty")
        return raw[: len(raw) - (len(raw) % 2)]

    if suffix == ".sc16":
        samples = np.fromfile(path, dtype=np.int16)
        samples = ensure_even_length(samples)
        iq = samples[0::2].astype(np.float32) / 32768.0
        iq = iq + 1j * (samples[1::2].astype(np.float32) / 32768.0)
        return complex_to_cs8_bytes(iq)

    if suffix == ".cf32":
        samples = np.fromfile(path, dtype=np.float32)
        samples = ensure_even_length(samples)
        iq = samples[0::2] + 1j * samples[1::2]
        return complex_to_cs8_bytes(iq)

    if suffix == ".cf64":
        samples = np.fromfile(path, dtype=np.float64)
        samples = ensure_even_length(samples)
        iq = samples[0::2].astype(np.float32) + 1j * samples[1::2].astype(np.float32)
        return complex_to_cs8_bytes(iq)

    raise BridgeError(f"Unsupported file format: {suffix}")


def prepare_tx_payload(path, modulation, sample_rate):
    suffix = Path(path).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise BridgeError(f"Unsupported file type: {suffix}")
    if suffix == ".wav":
        return prepare_wav_modulation(path, modulation, sample_rate), "wav-audio"
    return prepare_raw_iq(path, suffix), "raw-iq"


class HackRFBridge:
    def __init__(self):
        self._lock = asyncio.Lock()
        self.session_connected = False
        self.mode = "idle"
        self.serial = ""
        self.firmware = ""
        self.board = "HackRF One"
        self.hardware_revision = ""
        self.last_error = ""
        self.rx_proc = None
        self.tx_proc = None
        self.rx_reader_task = None
        self.rx_watch_task = None
        self.rx_stderr_task = None
        self.tx_watch_task = None
        self.tx_stderr_task = None
        self.tx_temp_path = None
        self.latest_fft = None
        self.last_fft = None
        self.ws_clients = set()

    async def _run(self, *cmd):
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await proc.communicate()
        return proc.returncode, stdout.decode("utf-8", "replace")

    async def detect_device(self):
        code, output = await self._run("hackrf_info")
        detected = code == 0 and "Found HackRF" in output

        serial = re.search(r"Serial number:\s*(\S+)", output)
        firmware = re.search(r"Firmware Version:\s*(.+)", output)
        board = re.search(r"Board ID Number:\s*\d+\s*\((.+?)\)", output)
        hardware_revision = re.search(r"Hardware Revision:\s*(.+)", output)

        if detected:
            self.serial = serial.group(1) if serial else self.serial
            self.firmware = firmware.group(1).strip() if firmware else self.firmware
            self.board = board.group(1).strip() if board else self.board
            self.hardware_revision = hardware_revision.group(1).strip() if hardware_revision else self.hardware_revision
            self.last_error = ""
        else:
            self.last_error = output.strip().splitlines()[-1] if output.strip() else "HackRF not detected"
            self.session_connected = False

        return {
            "detected": detected,
            "connected": detected and self.session_connected,
            "mode": self.mode,
            "serial": self.serial,
            "firmware": self.firmware,
            "board": self.board,
            "hardwareRevision": self.hardware_revision,
            "lastError": self.last_error,
        }

    async def connect(self):
        async with self._lock:
            info = await self.detect_device()
            if not info["detected"]:
                raise BridgeError("HackRF device not detected", status=404)
            self.session_connected = True
            info["connected"] = True
            return info

    async def disconnect(self):
        async with self._lock:
            await self._stop_rx_locked()
            await self._stop_tx_locked()
            self.session_connected = False
            self.mode = "idle"
            info = await self.detect_device()
            info["connected"] = False
            info["mode"] = "idle"
            return info

    async def status(self):
        async with self._lock:
            if self.rx_proc is not None or self.tx_proc is not None:
                return {
                    "detected": True,
                    "connected": self.session_connected,
                    "mode": self.mode,
                    "serial": self.serial,
                    "firmware": self.firmware,
                    "board": self.board,
                    "hardwareRevision": self.hardware_revision,
                    "lastError": self.last_error,
                }
            return await self.detect_device()

    async def start_rx(self, params):
        async with self._lock:
            info = await self.detect_device()
            if not info["detected"]:
                raise BridgeError("HackRF device not detected", status=404)
            if not self.session_connected:
                raise BridgeError("Connect the device session before starting RX", status=409)
            if self.tx_proc is not None:
                raise BridgeError("Stop TX before starting RX", status=409)

            await self._stop_rx_locked()

            frequency = int(params["frequency"])
            sample_rate = int(params["sampleRate"])
            bandwidth = nearest_supported_bandwidth(params["bandwidth"])
            lna_gain = int(params["lnaGain"])
            vga_gain = int(params["vgaGain"])

            cmd = [
                "hackrf_transfer",
                "-r",
                "-",
                "-f",
                str(frequency),
                "-s",
                str(sample_rate),
                "-b",
                str(bandwidth),
                "-l",
                str(lna_gain),
                "-g",
                str(vga_gain),
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.sleep(0.2)
            if proc.returncode is not None:
                stderr = await proc.stderr.read()
                raise BridgeError(stderr.decode("utf-8", "replace").strip() or "Failed to start RX", status=500)

            self.rx_proc = proc
            self.mode = "rx"
            self.last_fft = None
            self.latest_fft = None
            self.rx_reader_task = asyncio.create_task(self._rx_reader(proc))
            self.rx_watch_task = asyncio.create_task(self._watch_process("rx", proc))
            self.rx_stderr_task = asyncio.create_task(self._drain_stderr("RX", proc.stderr))
            return {
                "ok": True,
                "mode": "rx",
                "effectiveBandwidth": bandwidth,
                "fftSize": FFT_SIZE,
            }

    async def stop_rx(self):
        async with self._lock:
            await self._stop_rx_locked()
            return {"ok": True, "mode": self.mode}

    async def start_tx(self, fields, uploaded_file):
        async with self._lock:
            info = await self.detect_device()
            if not info["detected"]:
                raise BridgeError("HackRF device not detected", status=404)
            if not self.session_connected:
                raise BridgeError("Connect the device session before starting TX", status=409)
            if self.rx_proc is not None:
                raise BridgeError("Stop RX before starting TX", status=409)

            await self._stop_tx_locked()

            frequency = int(fields["frequency"])
            sample_rate = int(fields["sampleRate"])
            bandwidth = nearest_supported_bandwidth(fields["bandwidth"])
            tx_gain = int(fields["txGain"])
            modulation = fields["modulation"]

            payload_bytes, source_kind = await asyncio.to_thread(
                prepare_tx_payload,
                uploaded_file,
                modulation,
                sample_rate,
            )
            temp_fd, temp_path = tempfile.mkstemp(prefix="hackrf-tx-", suffix=".cs8")
            os.close(temp_fd)
            Path(temp_path).write_bytes(payload_bytes)

            cmd = [
                "hackrf_transfer",
                "-t",
                temp_path,
                "-f",
                str(frequency),
                "-s",
                str(sample_rate),
                "-b",
                str(bandwidth),
                "-x",
                str(tx_gain),
                "-R",
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.sleep(0.2)
            if proc.returncode is not None:
                stderr = await proc.stderr.read()
                with contextlib.suppress(FileNotFoundError):
                    os.unlink(temp_path)
                raise BridgeError(stderr.decode("utf-8", "replace").strip() or "Failed to start TX", status=500)

            self.tx_proc = proc
            self.tx_temp_path = temp_path
            self.mode = "tx"
            self.tx_watch_task = asyncio.create_task(self._watch_process("tx", proc))
            self.tx_stderr_task = asyncio.create_task(self._drain_stderr("TX", proc.stderr))
            return {
                "ok": True,
                "mode": "tx",
                "effectiveBandwidth": bandwidth,
                "sourceKind": source_kind,
            }

    async def stop_tx(self):
        async with self._lock:
            await self._stop_tx_locked()
            return {"ok": True, "mode": self.mode}

    async def add_ws_client(self, ws):
        self.ws_clients.add(ws)
        if self.latest_fft is not None:
            with contextlib.suppress(Exception):
                await ws.send_bytes(self.latest_fft.tobytes())

    async def remove_ws_client(self, ws):
        self.ws_clients.discard(ws)

    async def close(self):
        async with self._lock:
            await self._stop_rx_locked()
            await self._stop_tx_locked()
            self.session_connected = False
            self.mode = "idle"

    async def _broadcast_fft(self, bins):
        self.latest_fft = bins.astype(np.float32, copy=False)
        dead = []
        payload = self.latest_fft.tobytes()
        for ws in list(self.ws_clients):
            try:
                await ws.send_bytes(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.ws_clients.discard(ws)

    async def _rx_reader(self, proc):
        pending = bytearray()
        last_emit = 0.0
        try:
            while True:
                chunk = await proc.stdout.read(32768)
                if not chunk:
                    break

                pending.extend(chunk)
                now = time.monotonic()
                if len(pending) < FFT_BYTES or now - last_emit < FFT_INTERVAL_SECONDS:
                    if len(pending) > FFT_BYTES * 32:
                        pending = pending[-(FFT_BYTES * 8):]
                    continue

                frame = bytes(pending[-FFT_BYTES:])
                pending.clear()
                bins = self._compute_fft(frame)
                await self._broadcast_fft(bins)
                last_emit = now
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self.last_error = f"RX processing error: {exc}"

    def _compute_fft(self, frame_bytes):
        samples = np.frombuffer(frame_bytes, dtype=np.int8).astype(np.float32).reshape(-1, 2) / 128.0
        iq = samples[:, 0] + 1j * samples[:, 1]
        iq -= np.mean(iq)
        window = np.hanning(iq.size)
        spectrum = np.fft.fftshift(np.fft.fft(iq * window))
        magnitude = np.maximum(np.abs(spectrum) / max(iq.size, 1), 1e-12)
        bins = 20.0 * np.log10(magnitude)
        bins = bins.astype(np.float32, copy=False)
        if self.last_fft is not None and self.last_fft.shape == bins.shape:
            bins = (self.last_fft * 0.7) + (bins * 0.3)
        self.last_fft = bins
        return bins

    async def _watch_process(self, mode_name, proc):
        try:
            await proc.wait()
        finally:
            async with self._lock:
                if mode_name == "rx" and self.rx_proc is proc:
                    await self._stop_rx_locked(update_mode=False)
                if mode_name == "tx" and self.tx_proc is proc:
                    await self._stop_tx_locked(update_mode=False)
                if self.rx_proc is None and self.tx_proc is None:
                    self.mode = "idle"

    async def _drain_stderr(self, label, stream):
        try:
            while True:
                line = await stream.readline()
                if not line:
                    break
                self.last_error = f"{label}: {line.decode('utf-8', 'replace').strip()}"
        except asyncio.CancelledError:
            raise

    async def _stop_process(self, proc):
        if proc is None:
            return
        if proc.returncode is None:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()

    async def _cancel_task(self, task):
        if task is None or task is asyncio.current_task():
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    async def _stop_rx_locked(self, update_mode=True):
        proc = self.rx_proc
        self.rx_proc = None
        await self._stop_process(proc)
        await self._cancel_task(self.rx_reader_task)
        await self._cancel_task(self.rx_watch_task)
        await self._cancel_task(self.rx_stderr_task)
        self.rx_reader_task = None
        self.rx_watch_task = None
        self.rx_stderr_task = None
        self.last_fft = None
        self.latest_fft = None
        if update_mode and self.tx_proc is None:
            self.mode = "idle"

    async def _stop_tx_locked(self, update_mode=True):
        proc = self.tx_proc
        self.tx_proc = None
        await self._stop_process(proc)
        await self._cancel_task(self.tx_watch_task)
        await self._cancel_task(self.tx_stderr_task)
        self.tx_watch_task = None
        self.tx_stderr_task = None
        if self.tx_temp_path:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(self.tx_temp_path)
        self.tx_temp_path = None
        if update_mode and self.rx_proc is None:
            self.mode = "idle"


bridge = HackRFBridge()


def parse_int(value, field_name, minimum=None, maximum=None):
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        raise BridgeError(f"Invalid {field_name}")
    if minimum is not None and parsed < minimum:
        raise BridgeError(f"{field_name} must be >= {minimum}")
    if maximum is not None and parsed > maximum:
        raise BridgeError(f"{field_name} must be <= {maximum}")
    return parsed


async def options_handler(_request):
    return web.Response(status=204)


async def device_status(_request):
    return json_response(await bridge.status())


async def device_connect(_request):
    return json_response(await bridge.connect())


async def device_disconnect(_request):
    return json_response(await bridge.disconnect())


async def rx_start(request):
    body = await request.json()
    params = {
        "frequency": parse_int(body.get("frequency"), "frequency", minimum=1_000_000, maximum=6_000_000_000),
        "sampleRate": parse_int(body.get("sampleRate"), "sampleRate", minimum=2_000_000, maximum=20_000_000),
        "bandwidth": parse_int(body.get("bandwidth"), "bandwidth", minimum=200_000, maximum=28_000_000),
        "lnaGain": parse_int(body.get("lnaGain"), "lnaGain", minimum=0, maximum=40),
        "vgaGain": parse_int(body.get("vgaGain"), "vgaGain", minimum=0, maximum=62),
    }
    return json_response(await bridge.start_rx(params))


async def rx_stop(_request):
    return json_response(await bridge.stop_rx())


async def save_uploaded_file(multipart):
    file_part = None
    fields = {}

    async for part in multipart:
        if part.name == "file":
            file_part = part
        else:
            fields[part.name] = await part.text()

    if file_part is None or not file_part.filename:
        raise BridgeError("TX start requires a source file")

    suffix = Path(file_part.filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise BridgeError(f"Unsupported upload type: {suffix}")

    temp_fd, temp_path = tempfile.mkstemp(prefix="hackrf-upload-", suffix=suffix)
    os.close(temp_fd)

    size = 0
    try:
        with open(temp_path, "wb") as handle:
            while True:
                chunk = await file_part.read_chunk()
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise BridgeError("Uploaded file is too large", status=413)
                handle.write(chunk)
    except Exception:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temp_path)
        raise

    return fields, temp_path


async def tx_start(request):
    multipart = await request.multipart()
    if not isinstance(multipart, MultipartReader):
        raise BridgeError("Expected multipart form data")

    fields, uploaded_path = await save_uploaded_file(multipart)
    try:
        parsed_fields = {
            "frequency": parse_int(fields.get("frequency"), "frequency", minimum=1_000_000, maximum=6_000_000_000),
            "sampleRate": parse_int(fields.get("sampleRate"), "sampleRate", minimum=2_000_000, maximum=20_000_000),
            "bandwidth": parse_int(fields.get("bandwidth"), "bandwidth", minimum=200_000, maximum=28_000_000),
            "txGain": parse_int(fields.get("txGain"), "txGain", minimum=0, maximum=47),
            "modulation": (fields.get("modulation") or "").strip().upper(),
        }
        if parsed_fields["modulation"] not in {"AM", "FM", "NFM", "WFM", "USB", "LSB", "CW"}:
            raise BridgeError("Unsupported modulation")
        response = await bridge.start_tx(parsed_fields, uploaded_path)
        return json_response(response)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(uploaded_path)


async def tx_stop(_request):
    return json_response(await bridge.stop_tx())


async def rx_fft_ws(request):
    ws = web.WebSocketResponse(heartbeat=20)
    await ws.prepare(request)
    await bridge.add_ws_client(ws)
    try:
        async for msg in ws:
            if msg.type == WSMsgType.ERROR:
                break
    finally:
        await bridge.remove_ws_client(ws)
    return ws


async def health(_request):
    return json_response({"ok": True, "service": "hackrf-bridge"})


async def on_cleanup(_app):
    await bridge.close()


def build_app():
    app = web.Application(middlewares=[cors_middleware], client_max_size=MAX_UPLOAD_BYTES)
    app.router.add_route("OPTIONS", "/{tail:.*}", options_handler)
    app.router.add_get("/health", health)
    app.router.add_get("/device", device_status)
    app.router.add_post("/device/connect", device_connect)
    app.router.add_post("/device/disconnect", device_disconnect)
    app.router.add_post("/rx/start", rx_start)
    app.router.add_post("/rx/stop", rx_stop)
    app.router.add_get("/rx/fft", rx_fft_ws)
    app.router.add_post("/tx/start", tx_start)
    app.router.add_post("/tx/stop", tx_stop)
    app.on_cleanup.append(on_cleanup)
    return app


if __name__ == "__main__":
    web.run_app(build_app(), host=HOST, port=PORT)
