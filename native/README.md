# Windows system audio capture

`system-audio-go/` contains the current pure-Go Windows Process Loopback
helper. It captures audio rendered by all processes except the Cosight process
tree and emits 16-bit, 16 kHz, mono PCM to stdout so Electron can reuse the
existing ASR audio path. It calls the Windows COM/WASAPI interfaces directly,
without CGo or Visual Studio Build Tools.

`system-audio-loopback.cpp` is retained as a reference implementation while
the Go helper is being validated.

The API requires Windows 10 build 20348 or later. The helper is compiled as
part of `npm run build:system-audio` and is bundled into packaged builds under
the `system-audio` resource directory.

Cosight does not open its own microphone in this mode. Process Loopback can
exclude Cosight and its child processes, but it cannot distinguish microphone
monitoring that another application has already rendered through the speakers
from other system audio.
