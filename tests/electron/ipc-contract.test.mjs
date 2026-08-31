import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const preloadSource = await readFile(new URL('../../electron/preload.cjs', import.meta.url), 'utf8')
const mainSource = await readFile(new URL('../../electron/main.mjs', import.meta.url), 'utf8')
const sessionSource = await readFile(new URL('../../src/hooks/useCosightSession.js', import.meta.url), 'utf8')
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
  assert.match(preloadSource, /discardRoleKnowledgeBuild/)
  assert.match(mainSource, /roles:discard-knowledge-build/)
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
  assert.match(mainSource, /knowledgeBuildArtifacts = new Map/)
  assert.match(mainSource, /knowledgeStagingRoot/)
  assert.match(mainSource, /publishKnowledgeBuild/)
  assert.match(mainSource, /type: 'knowledge\.context'/)
  assert.match(mainSource, /knowledge\.query\.started/)
  assert.match(mainSource, /knowledge\.query\.forward_failed/)
  assert.match(mainSource, /knowledgeUsed/)
  assert.match(mainSource, /turnId: command\?\.turnId/)
  assert.match(mainSource, /knowledgeMode: normalizeKnowledgeMode\(config\?\.role\?\.knowledgeMode\)/)
  assert.match(mainSource, /knowledgeRetrievalMode: normalizeKnowledgeRetrievalMode\(config\?\.role\?\.knowledgeRetrievalMode\)/)
  assert.match(mainSource, /RAG 深度思考检索仅支持 Harness 模式/)
  assert.match(preloadSource, /testModel: \(model, requestId\) => ipcRenderer\.invoke\('settings:test-model', model, requestId\)/)
  assert.match(preloadSource, /cancelModelTest: \(requestId\) => ipcRenderer\.send\('settings:cancel-model-test', requestId\)/)
  assert.match(mainSource, /ipcMain\.on\('settings:cancel-model-test'/)
  assert.match(mainSource, /activeModelConnectionTests = new Map/)
  assert.match(mainSource, /runPythonModelConnectionTest\(\{ name, url \}, apiKey, requestId\)/)
  assert.match(mainSource, /runHarnessModelConnectionTest\(\{ module, name, url, voice \}, apiKey, requestId\)/)
})

test('model editor cleanup covers Chat/Usage navigation and model mode changes', () => {
  const navStart = sessionSource.indexOf('function toggleNav(key)')
  const navBlock = sessionSource.slice(navStart, navStart + 500)
  assert.match(navBlock, /key === 'chatSession'/)
  assert.match(navBlock, /key === 'usage'/)
  assert.match(navBlock, /closeModelEditor\(\)/)
  assert.match(navBlock, /closeHarnessModelEditor\(\)/)

  const modeStart = sessionSource.indexOf('async function changeModelMode(nextMode)')
  const modeBlock = sessionSource.slice(modeStart, modeStart + 500)
  assert.match(modeBlock, /setModelMode\(nextMode\)/)
  assert.match(modeBlock, /closeModelEditor\(\)/)
  assert.match(modeBlock, /closeHarnessModelEditor\(\)/)
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

test('Harness start resolves the virtual Default role and has a safe screen threshold fallback', () => {
  assert.match(mainSource, /normalizeRoleForRuntime\(storedRole\)/)
  assert.match(mainSource, /const source = role && typeof role === 'object' \? role : defaultRoleForRuntime\(\)/)
  assert.match(mainSource, /DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD/)
  assert.match(mainSource, /seeChangeThreshold: roleScreenVisionEnabled/)
})

test('Official roles can be saved but remain protected from deletion', () => {
  const saveStart = mainSource.indexOf("ipcMain.handle('roles:save'")
  const saveEnd = mainSource.indexOf("ipcMain.handle('roles:reindex-knowledge'", saveStart)
  const saveBlock = mainSource.slice(saveStart, saveEnd)
  assert.doesNotMatch(saveBlock, /官方示例角色不可编辑/)
  assert.match(saveBlock, /knowledgeIndexNeedsRebuild/)
  assert.doesNotMatch(saveBlock, /scheduleKnowledgeRebuild/)
  assert.match(saveBlock, /persistFiles: false/)
  assert.match(saveBlock, /publishKnowledgeBuild/)
  assert.match(saveBlock, /discardKnowledgeBuildArtifact/)

  const deleteStart = mainSource.indexOf("ipcMain.handle('roles:delete'")
  const deleteBlock = mainSource.slice(deleteStart, deleteStart + 800)
  assert.match(deleteBlock, /role\?\.isBuiltin/)

  const editStart = sessionSource.indexOf('function openEditRole(role)')
  const editBlock = sessionSource.slice(editStart, editStart + 180)
  assert.doesNotMatch(editBlock, /role\.isBuiltin/)
})

test('Official RAG roles participate in knowledge indexing lifecycle', () => {
  const rebuildStart = mainSource.indexOf('async function rebuildRoleKnowledge')
  const rebuildBlock = mainSource.slice(rebuildStart, rebuildStart + 8000)
  assert.doesNotMatch(rebuildBlock, /currentRole\.isBuiltin/)
  assert.doesNotMatch(rebuildBlock, /!publishRole\.isBuiltin/)
  assert.doesNotMatch(rebuildBlock, /finalRole\.isBuiltin/)

  const indexStart = mainSource.indexOf('function knowledgeIndexNeedsRebuild')
  const indexBlock = mainSource.slice(indexStart, indexStart + 500)
  assert.doesNotMatch(indexBlock, /role\.isBuiltin/)
  assert.match(mainSource, /knowledgeStatus: role\.isBuiltin && knowledgeMode !== 'rag'/)
  assert.match(mainSource, /只有 RAG 角色可以重建知识库。/)
  assert.match(mainSource, /onProgress: \(\{ progress, processedChunks, totalChunks \}\)/)
  assert.match(mainSource, /roleInput && typeof roleInput === 'object'/)
  assert.match(mainSource, /if \(build\) await build/)
  assert.match(mainSource, /knowledgeBuildId/)
  assert.match(mainSource, /persistRoleFiles\(role\.id, role\.knowledgeFiles, \[\], stagingKnowledgeDirectory\)/)
})
