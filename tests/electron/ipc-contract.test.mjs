import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const preloadSource = await readFile(new URL('../../electron/preload.cjs', import.meta.url), 'utf8')
const mainSource = await readFile(new URL('../../electron/main.mjs', import.meta.url), 'utf8')

function collectRendererChannels(pattern) {
  return [...preloadSource.matchAll(pattern)].map((match) => match[1])
}

function hasMainHandler(channel, type) {
  const escapedChannel = channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`ipcMain\\.${type}\\(\\s*['"]${escapedChannel}['"]`).test(mainSource)
}

test('every preload invoke channel has a main-process handler', () => {
  const channels = collectRendererChannels(/ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g)
  assert.ok(channels.length > 0)

  for (const channel of channels) {
    assert.equal(hasMainHandler(channel, 'handle'), true, `missing ipcMain.handle for ${channel}`)
  }
})

test('every preload send channel has a main-process listener', () => {
  const channels = collectRendererChannels(/ipcRenderer\.(?:send|sendSync)\(\s*['"]([^'"]+)['"]/g)
  assert.ok(channels.length > 0)

  for (const channel of channels) {
    assert.equal(hasMainHandler(channel, 'on'), true, `missing ipcMain.on for ${channel}`)
  }
})

test('main process emits the event consumed by the preload subscription', () => {
  assert.match(preloadSource, /ipcRenderer\.on\(\s*['"]qwen:event['"]/)
  assert.match(mainSource, /webContents\.send\(\s*['"]qwen:event['"]/)
})
