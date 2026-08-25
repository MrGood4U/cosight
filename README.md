# Cosight

Cosight — AI that sees what you see.

## MVP

The first client is an Electron desktop shell with a Python Qwen Omni Realtime
bridge. Electron owns microphone and screen capture, device selection, audio
playback, and the session UI. The Python process owns the DashScope realtime
WebSocket session and accepts base64 PCM/JPEG frames over stdin.

### Run the client

```powershell
npm install
python -m pip install -r requirements.txt
npm run dev
```

Set `COSIGHT_PYTHON` if the Python executable is not available as `python`.
In Settings, add one or more custom models. Each model stores a realtime URL,
model name, and API Key; API Keys are encrypted using Electron's
Windows-protected local storage. The selected model is used for the next
conversation.

Optional agent abilities are organized under `abilities/`. Each ability owns
its model-facing prompt and tool contract: `abilities/drawing/` contains the
transparent drawing prompt and runtime contract, while `abilities/writing/`
contains the agent-controlled writing prompt and tool contract. Core Subtitles
is a Settings-level feature: it uses each spoken response's realtime audio
transcript and does not require a model tool call. Screen vision, listening,
and speaking remain foundational realtime capabilities in the Python bridge.

For realtime troubleshooting, the bridge writes protocol diagnostics to
`app.getPath('userData')/logs/qwen-bridge.log`, while Electron and Renderer
lifecycle diagnostics are written to `app.getPath('userData')/logs/electron.log`.
The logs include tool-result delivery, bridge process exit codes, stderr,
Renderer exceptions, and Qwen error events; audio and video frame payloads are
recorded only as lengths, not as raw data.

Cosight's core product is a general conversation and screen-vision client,
designed to grow toward screen drawing workflows. Interview is an optional
plugin built on top of the core conversation and screen runtime; it is not part
of the core chat experience.
