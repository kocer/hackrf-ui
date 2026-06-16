# hackrf-ui

Web-based control panel for the HackRF One software-defined radio.

A React (Vite) frontend talking to a small aiohttp backend that drives the
HackRF — live FFT waterfall over WebSocket, frequency / bandwidth / gain
control, presets, and WAV upload/transmit.

## Stack
- **Frontend:** React 18 + Vite (`src/`)
- **Backend:** Python aiohttp + numpy/scipy (`backend/server.py`), binds `127.0.0.1:8765`

## Run
```bash
pip install -r backend/requirements.txt
npm install
npm run backend        # start the SDR backend (127.0.0.1:8765)
npm run dev            # start the Vite dev server, then open it in a browser
```
Requires the HackRF host tools installed and a HackRF One connected.

## Legal

This project is provided for **education, research, and authorised testing only**.

This tool can transmit (FM/AM test signals, WAV/IQ upload). Transmitting on
regulated frequencies — or at power levels or in modes you are not
licensed/authorised for — is illegal in most jurisdictions, and some signals can
disrupt aviation, emergency, or other safety-of-life and critical systems.
Receiving may also be regulated where you live. You are solely responsible for
legal compliance.

The author(s) accept no liability for any damage, interference, or legal
consequence arising from the use or misuse of this software. Use at your own
risk.

## License
GPL-3.0 — see [`LICENSE`](LICENSE).
