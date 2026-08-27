# Cosight Harness

The Harness is the isolated multi-model runtime. It is a standalone Go
process and communicates with Electron over JSON Lines on stdin/stdout.

Legacy single-model sessions continue to use `python/qwen_bridge.py`.

The Harness owns four model adapters:

- `listen`: Qwen ASR Realtime over WebSocket;
- `see`: an OpenAI-compatible visual model returning normalized JSON;
- `brain`: an OpenAI-compatible model returning `brain.action` JSON;
- `speak`: Qwen TTS Realtime over WebSocket.

Draw is not a model. Brain emits semantic draw actions and the renderer maps
them to the existing transparent overlay implementation.

The default visual result TTL is five seconds. Electron passes the configured
value as `seeMinIntervalMs` in the start command. After a successful See
response, the Harness keeps that exact JPEG in memory as the visual baseline. Ordinary
screen frames are compared locally against the baseline using a 64x36 luma
sample grid; only a significant change starts a background See refresh. The
same setting also drives the quiet-screen periodic refresh and guarantees a
minimum gap between model calls. Its default is five seconds. Brain never
waits for that refresh.

## Diagnostics

When `COSIGHT_DEBUG_LOG` is set, the Harness appends timestamped JSONL
diagnostics to that path. Electron sets it to
`%APPDATA%\cosight\logs\cosight-harness.log`. Each stage uses a stable request
ID where applicable, for example `see.request.created`,
`see.frame.received`, `see.model.completed`, `brain.model.completed`, and
`speak.completed`. Frame diagnostics contain only dimensions, byte counts,
comparison metrics, state flags, and request IDs; they do not contain the
image data or API keys.

See prompts follow the Qwen-VL grounding convention: the model is asked to
return `bbox_2d` as `[x_min, y_min, x_max, y_max]` on a 0-1000 normalized grid.
The parser accepts the official top-level item array as well as the Harness
envelope, and converts `bbox_2d` into the internal normalized
`bbox: {x, y, width, height}` form before emitting `see.completed`.

## Fixed signal examples

Every module signal is wrapped in the same envelope. `see.completed` records
the capture timestamp, and Brain always uses the latest successful result.

```json
{"schema":"cosight.harness.signal","version":1,"type":"listen.completed","eventId":"evt_listen_01","sessionId":"session_01","createdAt":"2026-08-27T10:00:01Z","source":{"module":"listen","model":"qwen3-asr-flash-realtime"},"payload":{"utteranceId":"utt_01","text":"请圈出右上角的按钮","isFinal":true,"language":"zh"}}
```

```json
{"schema":"cosight.harness.signal","version":1,"type":"see.completed","eventId":"evt_see_01","sessionId":"session_01","createdAt":"2026-08-27T10:00:01.4Z","source":{"module":"see","model":"qwen3-vl-flash"},"payload":{"frameId":"frame_01","capturedAt":"2026-08-27T10:00:01.2Z","coordinateSpace":"full_screen","frame":{"format":"jpeg"},"scene":"一个深色主题的模型配置页面，中央显示多模型 Harness 配置卡片。","objects":[{"objectId":"obj_01","label":"按钮","bbox":{"x":0.78,"y":0.08,"width":0.12,"height":0.05},"confidence":0.94}],"textBlocks":[],"summary":"右上角有一个按钮"}}
```

Brain must always include at least one `speak` action. Draw actions are
semantic only; the renderer turns them into transparent-canvas strokes.

```json
{"schema":"cosight.harness.action","version":1,"type":"brain.action","eventId":"evt_action_01","sessionId":"session_01","createdAt":"2026-08-27T10:00:02Z","replyTo":{"listenEventId":"evt_listen_01","seeEventId":"evt_see_01"},"actions":[{"actionId":"speak_01","type":"speak","text":"好的，我来圈出右上角的按钮。"},{"actionId":"draw_01","type":"draw","operation":"circle","target":{"bbox":{"x":0.78,"y":0.08,"width":0.12,"height":0.05}},"style":{"color":"#ff4d6d","width":4}}]}
```
