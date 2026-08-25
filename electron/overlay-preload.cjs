const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cosightOverlay', {
  onDraw: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('overlay:draw', listener)
    return () => ipcRenderer.removeListener('overlay:draw', listener)
  },
  onCaption: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('overlay:caption', listener)
    return () => ipcRenderer.removeListener('overlay:caption', listener)
  },
  onClear: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('overlay:clear', listener)
    return () => ipcRenderer.removeListener('overlay:clear', listener)
  },
})
