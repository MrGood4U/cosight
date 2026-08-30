const { contextBridge, ipcRenderer } = require('electron')

function serializeError(error) {
  if (!error) return { message: 'Unknown error' }
  return {
    name: error.name,
    message: error.message || String(error),
    stack: error.stack,
  }
}

function reportRendererError(payload) {
  ipcRenderer.send('renderer:error', payload)
}

contextBridge.exposeInMainWorld('cosight', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getUsage: (filters) => ipcRenderer.invoke('usage:get', filters),
  pickRoleKnowledgeFiles: () => ipcRenderer.invoke('roles:pick-files'),
  pickRoleAvatar: () => ipcRenderer.invoke('roles:pick-avatar'),
  previewRolePrompt: (role) => ipcRenderer.invoke('roles:preview-prompt', role),
  saveRole: (role) => ipcRenderer.invoke('roles:save', role),
  reindexRoleKnowledge: (roleId) => ipcRenderer.invoke('roles:reindex-knowledge', roleId),
  selectRole: (roleId) => ipcRenderer.invoke('roles:select', roleId),
  deleteRole: (roleId) => ipcRenderer.invoke('roles:delete', roleId),
  saveModel: (model) => ipcRenderer.invoke('settings:save-model', model),
  selectModel: (modelId) => ipcRenderer.invoke('settings:select-model', modelId),
  deleteModel: (modelId) => ipcRenderer.invoke('settings:delete-model', modelId),
  setModelMode: (mode) => ipcRenderer.invoke('settings:set-model-mode', mode),
  saveHarnessModel: (model) => ipcRenderer.invoke('settings:save-harness-model', model),
  deleteHarnessModel: (module) => ipcRenderer.invoke('settings:delete-harness-model', module),
  saveHarnessSettings: (settings) => ipcRenderer.invoke('settings:save-harness-settings', settings),
  saveEmbeddingModel: (model) => ipcRenderer.invoke('settings:save-embedding-model', model),
  deleteEmbeddingModel: (modelId) => ipcRenderer.invoke('settings:delete-embedding-model', modelId),
  testEmbeddingModel: (model) => ipcRenderer.invoke('settings:test-embedding-model', model),
  listDesktopSources: () => ipcRenderer.invoke('desktop:list-sources'),
  exportSession: (artifact) => ipcRenderer.invoke('session:export', artifact),
  importSession: () => ipcRenderer.invoke('session:import'),
  prepareDesktopSource: (sourceId) => ipcRenderer.sendSync('desktop:prepare-source', sourceId),
  startSystemAudioCapture: () => ipcRenderer.invoke('system-audio:start'),
  stopSystemAudioCapture: () => ipcRenderer.invoke('system-audio:stop'),
  setSystemAudioMuted: (muted) => ipcRenderer.send('system-audio:mute', Boolean(muted)),
  setSystemAudioListeningEnabled: (enabled) => ipcRenderer.send('system-audio:listening-enabled', Boolean(enabled)),
  startSession: (config) => ipcRenderer.invoke('qwen:start', config),
  stopSession: () => ipcRenderer.invoke('qwen:stop'),
  updateSessionCapabilities: (capabilities) => ipcRenderer.send('qwen:capabilities-update', capabilities),
  triggerInitiative: (instructions) => ipcRenderer.invoke('qwen:initiative', instructions),
  sendAudioChunk: (base64) => ipcRenderer.send('qwen:audio', base64),
  sendTextMessage: (text) => ipcRenderer.invoke('qwen:text', text),
  clearConversationContext: () => ipcRenderer.send('qwen:context-clear'),
  sendVideoFrame: (base64, flush = false, mode = 'default', requestId = '') => ipcRenderer.send(
    flush ? 'qwen:video-flush' : 'qwen:video',
    { data: base64, mode, requestId },
  ),
  sendToolResult: (callId, output) => ipcRenderer.send('qwen:tool-result', { callId, output }),
  sendHarnessActionResult: (payload) => ipcRenderer.send('harness:action-result', payload),
  showOverlay: (source) => ipcRenderer.invoke('overlay:show', source),
  hideOverlay: () => ipcRenderer.invoke('overlay:hide'),
  drawOnOverlay: (payload) => ipcRenderer.invoke('overlay:draw', payload),
  showCaptionOnOverlay: (payload) => ipcRenderer.invoke('overlay:caption', payload),
  reportRendererEvent: (payload) => ipcRenderer.send('renderer:event', payload),
  reportRendererError: (payload) => reportRendererError(payload),
  onQwenEvent: (handler) => {
    const listener = (_event, payload) => {
      try {
        Promise.resolve(handler(payload)).catch((error) => {
          reportRendererError({
            phase: 'qwen-event-handler',
            eventType: payload?.type,
            callId: payload?.callId,
            error: serializeError(error),
          })
        })
      } catch (error) {
        reportRendererError({
          phase: 'qwen-event-handler',
          eventType: payload?.type,
          callId: payload?.callId,
          error: serializeError(error),
        })
      }
    }
    ipcRenderer.on('qwen:event', listener)
    return () => ipcRenderer.removeListener('qwen:event', listener)
  },
  onKnowledgeStatus: (handler) => {
    const listener = (_event, payload) => {
      try {
        Promise.resolve(handler(payload)).catch((error) => {
          reportRendererError({ phase: 'knowledge-status-handler', error: serializeError(error) })
        })
      } catch (error) {
        reportRendererError({ phase: 'knowledge-status-handler', error: serializeError(error) })
      }
    }
    ipcRenderer.on('knowledge:status', listener)
    return () => ipcRenderer.removeListener('knowledge:status', listener)
  },
})
