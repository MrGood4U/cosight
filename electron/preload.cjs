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
  pickRoleKnowledgeFiles: () => ipcRenderer.invoke('roles:pick-files'),
  pickRoleAvatar: () => ipcRenderer.invoke('roles:pick-avatar'),
  previewRolePrompt: (role) => ipcRenderer.invoke('roles:preview-prompt', role),
  saveRole: (role) => ipcRenderer.invoke('roles:save', role),
  selectRole: (roleId) => ipcRenderer.invoke('roles:select', roleId),
  deleteRole: (roleId) => ipcRenderer.invoke('roles:delete', roleId),
  saveModel: (model) => ipcRenderer.invoke('settings:save-model', model),
  selectModel: (modelId) => ipcRenderer.invoke('settings:select-model', modelId),
  deleteModel: (modelId) => ipcRenderer.invoke('settings:delete-model', modelId),
  listDesktopSources: () => ipcRenderer.invoke('desktop:list-sources'),
  exportSession: (artifact) => ipcRenderer.invoke('session:export', artifact),
  importSession: () => ipcRenderer.invoke('session:import'),
  prepareDesktopSource: (sourceId) => ipcRenderer.sendSync('desktop:prepare-source', sourceId),
  startSession: (config) => ipcRenderer.invoke('qwen:start', config),
  stopSession: () => ipcRenderer.invoke('qwen:stop'),
  updateSessionCapabilities: (capabilities) => ipcRenderer.send('qwen:capabilities-update', capabilities),
  triggerInitiative: (instructions) => ipcRenderer.invoke('qwen:initiative', instructions),
  sendAudioChunk: (base64) => ipcRenderer.send('qwen:audio', base64),
  sendVideoFrame: (base64, flush = false, mode = 'default') => ipcRenderer.send(
    flush ? 'qwen:video-flush' : 'qwen:video',
    { data: base64, mode },
  ),
  sendToolResult: (callId, output) => ipcRenderer.send('qwen:tool-result', { callId, output }),
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
})
