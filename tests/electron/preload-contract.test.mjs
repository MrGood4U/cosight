import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)

async function loadPreload() {
  const source = await readFile(new URL('../../electron/preload.cjs', import.meta.url), 'utf8')
  const events = new EventEmitter()
  const calls = []
  let exposed
  const ipcRenderer = {
    invoke: async (...args) => { calls.push(['invoke', ...args]); return { ok: true } },
    send: (...args) => calls.push(['send', ...args]),
    sendSync: (...args) => { calls.push(['sendSync', ...args]); return { id: 'screen:1' } },
    on: (...args) => events.on(...args),
    removeListener: (...args) => events.removeListener(...args),
  }
  const context = vm.createContext({
    require: (name) => name === 'electron' ? {
      contextBridge: { exposeInMainWorld: (_name, api) => { exposed = api } },
      ipcRenderer,
    } : require(name),
    console,
    Promise,
    Boolean,
    Error,
  })
  vm.runInContext(source, context, { filename: 'electron/preload.cjs' })
  assert.ok(exposed, 'preload should expose the Cosight API')
  return { api: exposed, events, calls }
}

test('preload exposes all renderer IPC capabilities with stable method names', async () => {
  const { api } = await loadPreload()
  const expected = [
    'getSettings', 'getUsage', 'pickRoleKnowledgeFiles', 'pickRoleAvatar', 'previewRolePrompt', 'saveRole', 'selectRole', 'deleteRole',
    'saveModel', 'selectModel', 'deleteModel', 'setModelMode', 'saveHarnessModel', 'deleteHarnessModel', 'saveHarnessSettings',
    'listDesktopSources', 'exportSession', 'importSession', 'prepareDesktopSource', 'startSystemAudioCapture', 'stopSystemAudioCapture',
    'setSystemAudioMuted', 'setSystemAudioListeningEnabled', 'startSession', 'stopSession', 'updateSessionCapabilities', 'triggerInitiative',
    'sendAudioChunk', 'sendTextMessage', 'clearConversationContext', 'sendVideoFrame', 'sendToolResult', 'sendHarnessActionResult',
    'showOverlay', 'hideOverlay', 'drawOnOverlay', 'showCaptionOnOverlay', 'reportRendererEvent', 'reportRendererError', 'onQwenEvent',
  ]
  assert.deepEqual(Object.keys(api).sort(), expected.sort())
  for (const key of expected) assert.equal(typeof api[key], 'function', `${key} should be callable`)
})

test('preload routes commands to the intended IPC channel and normalizes boolean inputs', async () => {
  const { api, calls } = await loadPreload()
  await api.getSettings()
  await api.getUsage({ from: 'a' })
  api.prepareDesktopSource('screen:1')
  api.setSystemAudioMuted(1)
  api.setSystemAudioListeningEnabled('')
  api.sendVideoFrame('jpeg', true, 'see', 'request-1')
  api.sendToolResult('call-1', { ok: true })
  api.reportRendererError({ phase: 'test' })
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['invoke', 'settings:get'],
    ['invoke', 'usage:get', { from: 'a' }],
    ['sendSync', 'desktop:prepare-source', 'screen:1'],
    ['send', 'system-audio:mute', true],
    ['send', 'system-audio:listening-enabled', false],
    ['send', 'qwen:video-flush', { data: 'jpeg', mode: 'see', requestId: 'request-1' }],
    ['send', 'qwen:tool-result', { callId: 'call-1', output: { ok: true } }],
    ['send', 'renderer:error', { phase: 'test' }],
  ])
})

test('preload event subscription forwards payloads, reports handler failures, and unsubscribes cleanly', async () => {
  const { api, events, calls } = await loadPreload()
  const received = []
  const unsubscribe = api.onQwenEvent((payload) => received.push(payload))
  events.emit('qwen:event', {}, { type: 'assistant.text.done', text: 'ok' })
  assert.deepEqual(received, [{ type: 'assistant.text.done', text: 'ok' }])
  unsubscribe()
  events.emit('qwen:event', {}, { type: 'assistant.text.done', text: 'ignored' })
  assert.equal(received.length, 1)

  api.onQwenEvent(async () => { throw new Error('handler failed') })
  events.emit('qwen:event', {}, { type: 'bridge.error', callId: 'call-9' })
  await new Promise((resolve) => setImmediate(resolve))
  const errorCall = calls.at(-1)
  assert.equal(errorCall[0], 'send')
  assert.equal(errorCall[1], 'renderer:error')
  assert.equal(errorCall[2].phase, 'qwen-event-handler')
  assert.equal(errorCall[2].eventType, 'bridge.error')
  assert.equal(errorCall[2].callId, 'call-9')
  assert.equal(errorCall[2].error.name, 'Error')
  assert.equal(errorCall[2].error.message, 'handler failed')
  assert.match(errorCall[2].error.stack, /^Error: handler failed/)
})
