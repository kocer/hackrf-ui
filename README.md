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

## License
Dual-licensed: Unlicense (public domain) or GPL-3.0. See `UNLICENSE` / `LICENSE`.
