import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const preloadSource = await readFile(new URL('../../electron/preload.cjs', import.meta.url), 'utf8')
const mainSource = await readFile(new URL('../../electron/main.mjs', import.meta.url), 'utf8')
const owenVisualPolicy = await readFile(new URL('../../data/owen-visual-interview-policy.md', import.meta.url), 'utf8')

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

test('Owen interviewer keeps its visual system-design policy bundled into drawing guidance', () => {
  assert.match(owenVisualPolicy, /system-design exercise/i)
  assert.match(owenVisualPolicy, /share the entire screen/i)
  assert.match(owenVisualPolicy, /draw a rectangle/i)
  assert.match(owenVisualPolicy, /draw an arrow/i)
  assert.match(mainSource, /OWEN_ROLE_ID/)
  assert.match(mainSource, /owenVisualInterviewPolicyPath/)
  assert.match(mainSource, /drawingPolicy: \[drawingPolicy, visualInterviewPolicy\]/)
})
