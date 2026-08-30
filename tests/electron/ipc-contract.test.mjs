import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const preloadSource = await readFile(new URL('../../electron/preload.cjs', import.meta.url), 'utf8')
const mainSource = await readFile(new URL('../../electron/main.mjs', import.meta.url), 'utf8')
const owenVisualPolicy = await readFile(new URL('../../data/owen-visual-interview-policy.md', import.meta.url), 'utf8')
const sampleRoles = JSON.parse(await readFile(new URL('../../data/sample-roles.json', import.meta.url), 'utf8'))

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

test('Embedding knowledge retrieval stays in the main process and reaches Harness by event id', () => {
  assert.match(preloadSource, /saveEmbeddingModel/)
  assert.match(preloadSource, /onKnowledgeStatus/)
  assert.match(mainSource, /settings:save-embedding-model/)
  assert.match(preloadSource, /reindexRoleKnowledge/)
  assert.match(mainSource, /roles:reindex-knowledge/)
  assert.match(mainSource, /knowledgeBuilds = new Map/)
  assert.match(mainSource, /payload\?\.type === 'knowledge\.query'/)
  assert.match(mainSource, /activeRuntime === 'legacy'\) void handleLegacyKnowledgeQuery/)
  assert.match(mainSource, /embeddingModelFingerprint/)
  assert.match(mainSource, /searchKnowledgeDatabaseAsync/)
  assert.match(mainSource, /knowledgeBuildCancels = new Map/)
  assert.match(mainSource, /cancelKnowledgeBuild\(roleId\)/)
  assert.doesNotMatch(mainSource, /await activeBuild/)
  assert.match(mainSource, /removeRoleData/)
  assert.match(mainSource, /canPublish/)
  assert.match(mainSource, /type: 'knowledge\.context'/)
  assert.match(mainSource, /knowledgeMode: normalizeKnowledgeMode\(config\?\.role\?\.knowledgeMode\)/)
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

test('Owen interviewer reads its 100-second initiative timeout from the official role data', () => {
  const owen = sampleRoles.roles.find((role) => role.id === '1cf1ab33-39ca-444a-a90e-c1b013f3620c')
  assert.equal(owen?.initiativeTimeoutSec, 100)
  assert.match(owen?.initiativePrompt || '', /Default idle threshold: 100 seconds\./)
  assert.doesNotMatch(owen?.initiativePrompt || '', /Default idle threshold: 20 seconds\./)
  assert.doesNotMatch(mainSource, /OWEN_INITIATIVE_TIMEOUT_SEC/)
  assert.doesNotMatch(mainSource, /resolveRoleInitiativeTimeout/)
})
