import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

import { emptyRoleDraft } from '../../src/app/shared.js'

const appShellSource = await readFile(new URL('../../src/app/AppShell.jsx', import.meta.url), 'utf8')

let viteServer
let ModelsPage
let HarnessModelEditor
let AbilitiesPage
let RoleEditor
let RoleCard
let SettingsPage
let ModelEditor
let ChatPage
let EmbeddingPage
let EmbeddingModelEditor

const t = (key) => key
const noop = () => {}

before(async () => {
  viteServer = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  ;({ ModelsPage, HarnessModelEditor } = await viteServer.ssrLoadModule('/src/components/ModelsPage.jsx'))
  ;({ AbilitiesPage } = await viteServer.ssrLoadModule('/src/components/AbilitiesPage.jsx'))
  ;({ RoleEditor, RoleCard } = await viteServer.ssrLoadModule('/src/components/RolesPage.jsx'))
  ;({ SettingsPage, ModelEditor } = await viteServer.ssrLoadModule('/src/components/SettingsPage.jsx'))
  ;({ ChatPage } = await viteServer.ssrLoadModule('/src/components/ChatPage.jsx'))
  ;({ EmbeddingPage, EmbeddingModelEditor } = await viteServer.ssrLoadModule('/src/components/EmbeddingPage.jsx'))
})

after(async () => {
  await viteServer?.close()
})

function modelsPageProps(overrides = {}) {
  const models = []
  const model = null
  return {
    models,
    selectedModel: model,
    modelMode: 'harness',
    harnessModels: { brain: null, listen: null, speak: null, see: null },
    harnessSettings: { seeMinIntervalMs: 5000, recentConversationCount: 20, recentVisionCount: 1 },
    harnessEditorModule: '',
    harnessModelDraft: null,
    harnessApiKeyVisible: false,
    setHarnessApiKeyVisible: noop,
    setHarnessModelDraft: noop,
    modelEditorOpen: false,
    modelDraft: { id: '', alias: '', name: '', url: '', apiKey: '' },
    setModelDraft: noop,
    modelApiKeyVisible: false,
    setModelApiKeyVisible: noop,
    openNewModel: noop,
    openEditModel: noop,
    saveModel: noop,
    selectModel: noop,
    deleteModel: noop,
    closeModelEditor: noop,
    changeModelMode: noop,
    openHarnessModelEditor: noop,
    closeHarnessModelEditor: noop,
    saveHarnessModel: noop,
    saveHarnessSettings: noop,
    deleteHarnessModel: noop,
    isChatActive: false,
    t,
    ...overrides,
  }
}

test('Harness model editor exposes a realtime connection test action', () => {
  const markup = renderToStaticMarkup(React.createElement(HarnessModelEditor, {
    id: 'harness-editor-brain',
    draft: { module: 'brain', alias: '', name: 'model', url: 'https://example.com', voice: '', apiKey: '' },
    setDraft: noop,
    apiKeyVisible: false,
    setApiKeyVisible: noop,
    onSave: noop,
    onTest: noop,
    testState: 'idle',
    testResult: null,
    onCancel: noop,
    t,
  }))
  assert.match(markup, /model\.test/)
})

test('Models page keeps legacy and Harness layouts mutually exclusive', () => {
  const harnessMarkup = renderToStaticMarkup(React.createElement(ModelsPage, modelsPageProps()))
  assert.match(harnessMarkup, /model-mode-panel/)
  assert.match(harnessMarkup, /harness-context-settings/)
  assert.doesNotMatch(harnessMarkup, /legacy-model-section/)
  assert.doesNotMatch(harnessMarkup, /models\.add/)

  const legacyMarkup = renderToStaticMarkup(React.createElement(ModelsPage, modelsPageProps({
    modelMode: 'legacy',
    models: [{ id: 'legacy-1', name: 'Legacy model', alias: '', url: 'ws://mock', hasApiKey: true }],
    selectedModel: { id: 'legacy-1' },
  })))
  assert.match(legacyMarkup, /legacy-model-section/)
  assert.match(legacyMarkup, /models\.add/)
  assert.doesNotMatch(legacyMarkup, /model-mode-panel/)
  assert.doesNotMatch(legacyMarkup, /harness-context-settings/)
})

test('Abilities page exposes the See bounding-box debug toggle', () => {
  const markup = renderToStaticMarkup(React.createElement(AbilitiesPage, {
    seeBboxDebugEnabled: true,
    setSeeBboxDebugEnabled: noop,
    t,
  }))
  assert.match(markup, /abilities\.seeBboxDebug/)
  assert.match(markup, /aria-pressed="true"/)
  assert.match(markup, /ability-card-configurable/)
})

test('Role editor renders independent languages and conditional visual/drawing/initiative fields', () => {
  const draft = {
    ...emptyRoleDraft(),
    name: 'Test role',
    abilities: ['screenVision', 'listening', 'speaking', 'drawing', 'initiative'],
    screenVisionIntervalSec: '5',
    screenVisionChangeThreshold: '8',
    initiativeTimeoutSec: '10',
    knowledgeFiles: [],
  }
  const markup = renderToStaticMarkup(React.createElement(RoleEditor, {
    draft,
    setDraft: noop,
    onSave: noop,
    onCancel: noop,
    onPreview: noop,
    t,
    setNotice: noop,
  }))
  for (const field of [
    'roles.listeningLanguage', 'roles.outputLanguage', 'roles.screenVisionInterval',
    'roles.screenVisionChangeThreshold', 'roles.drawingPolicy', 'roles.initiativeTimeout', 'roles.initiativePrompt',
  ]) assert.match(markup, new RegExp(field.replace('.', '\\.'), 'u'))
  assert.match(markup, /id="screen-vision-interval-hint"/)
  assert.match(markup, /id="screen-vision-threshold-hint"/)
})

test('Official roles expose edit but not delete actions', () => {
  const markup = renderToStaticMarkup(React.createElement(RoleCard, {
    role: { id: 'official-role', name: 'Official role', isBuiltin: true, abilities: [] },
    selected: false,
    isChatActive: false,
    onSelect: noop,
    onEdit: noop,
    onDelete: noop,
    t,
  }))
  assert.match(markup, /model\.edit/)
  assert.doesNotMatch(markup, /model\.delete/)
})

test('Role editor only shows knowledge sources when knowledge is enabled and reports RAG progress', () => {
  const baseProps = {
    setDraft: noop,
    onSave: noop,
    onReindex: noop,
    onCancel: noop,
    onPreview: noop,
    t,
    setNotice: noop,
  }
  const noneMarkup = renderToStaticMarkup(React.createElement(RoleEditor, {
    ...baseProps,
    draft: { ...emptyRoleDraft(), name: 'No knowledge', knowledgeMode: 'none', knowledgeText: 'hidden' },
  }))
  assert.doesNotMatch(noneMarkup, /knowledge-textarea/)
  assert.doesNotMatch(noneMarkup, /roles\.addKnowledgeFiles/)

  const promptMarkup = renderToStaticMarkup(React.createElement(RoleEditor, {
    ...baseProps,
    draft: { ...emptyRoleDraft(), name: 'Prompt role', knowledgeMode: 'prompt' },
  }))
  assert.match(promptMarkup, /knowledge-textarea/)
  assert.match(promptMarkup, /roles\.addKnowledgeFiles/)

  const ragMarkup = renderToStaticMarkup(React.createElement(RoleEditor, {
    ...baseProps,
    draft: {
      ...emptyRoleDraft(),
      name: 'RAG role',
      knowledgeMode: 'rag',
      embeddingModelId: 'embed-1',
      knowledgeText: 'reference material',
      knowledgeStatus: { status: 'indexing', progress: 42, processedChunks: 2, totalChunks: 5 },
    },
    embeddingModels: [{ id: 'embed-1', alias: 'Cloud embed', model: 'text-embedding-v4' }],
  }))
  assert.match(ragMarkup, /roles\.knowledgeBuilding/)
  assert.match(ragMarkup, /role="progressbar"/)
  assert.match(ragMarkup, /roles\.knowledgeBuildProgress/)
})

test('Role editor exposes selectable knowledge modes and RAG retrieval strategies', () => {
  const markup = renderToStaticMarkup(React.createElement(RoleEditor, {
    draft: { ...emptyRoleDraft(), name: 'RAG role', knowledgeMode: 'rag' },
    embeddingModels: [{ id: 'embed-1', alias: 'Cloud embed', model: 'text-embedding-v4' }],
    modelMode: 'harness',
    setDraft: noop,
    onSave: noop,
    onCancel: noop,
    onPreview: noop,
    t,
    setNotice: noop,
  }))
  assert.match(markup, /roles\.knowledgeMode/)
  assert.match(markup, /roles\.knowledgeNoneMode/)
  assert.match(markup, /roles\.knowledgeRagMode/)
  assert.match(markup, /roles\.knowledgeRetrievalMode/)
  assert.match(markup, /roles\.knowledgeFastMode/)
  assert.match(markup, /roles\.knowledgeDeepMode/)
  assert.match(markup, /embed-1/)
  assert.match(markup, /knowledge-rag-note/)
})

test('Role editor makes deep RAG retrieval explicit as Harness-only', () => {
  const markup = renderToStaticMarkup(React.createElement(RoleEditor, {
    draft: { ...emptyRoleDraft(), name: 'Legacy RAG role', knowledgeMode: 'rag', knowledgeRetrievalMode: 'deep' },
    embeddingModels: [{ id: 'embed-1', alias: 'Cloud embed', model: 'text-embedding-v4' }],
    modelMode: 'legacy',
    setDraft: noop,
    onSave: noop,
    onCancel: noop,
    onPreview: noop,
    t,
    setNotice: noop,
  }))
  assert.match(markup, /roles\.knowledgeFastMode/)
  assert.doesNotMatch(markup, /roles\.knowledgeDeepMode/)
  assert.match(markup, /roles\.knowledgeDeepHarnessOnly/)
})

test('Role editor distinguishes partial knowledge indexing and exposes build action', () => {
  const markup = renderToStaticMarkup(React.createElement(RoleEditor, {
    draft: {
      ...emptyRoleDraft(),
      id: 'rag-role',
      name: 'RAG role',
      knowledgeMode: 'rag',
      knowledgeStatus: { status: 'ready_with_errors', chunkCount: 4, error: 'manual.pdf：无法解析文件' },
    },
    embeddingModels: [{ id: 'embed-1', alias: 'Cloud embed', model: 'text-embedding-v4' }],
    onReindex: noop,
    setDraft: noop,
    onSave: noop,
    onCancel: noop,
    onPreview: noop,
    t,
    setNotice: noop,
  }))
  assert.match(markup, /roles\.knowledgePartialReady/)
  assert.doesNotMatch(markup, /roles\.knowledgeReady/)
  assert.match(markup, /manual\.pdf：无法解析文件/)
  assert.match(markup, /roles\.knowledgeBuildAgain/)
})

test('Embedding page renders cloud/local entry points and configured model cards', () => {
  const markup = renderToStaticMarkup(React.createElement(EmbeddingPage, {
    models: [{ id: 'embed-1', type: 'local', alias: 'Local test', model: 'qwen-embed', url: 'http://127.0.0.1:8080/v1', dimensions: 1024, hasApiKey: false }],
    editorOpen: false,
    draft: {},
    setDraft: noop,
    apiKeyVisible: false,
    setApiKeyVisible: noop,
    testState: 'idle',
    testResult: null,
    openNew: noop,
    openEdit: noop,
    save: noop,
    remove: noop,
    test: noop,
    closeEditor: noop,
    t,
  }))
  assert.match(markup, /embeddings\.addCloud/)
  assert.match(markup, /embeddings\.addLocal/)
  assert.match(markup, /Local test/)
  assert.match(markup, /qwen-embed/)
})

test('Embedding editor no longer exposes a configuration name field', () => {
  const markup = renderToStaticMarkup(React.createElement(EmbeddingModelEditor, {
    draft: { id: '', type: 'cloud', alias: '', model: 'text-embedding-v4', url: '', dimensions: '', apiKey: '' },
    setDraft: noop,
    apiKeyVisible: false,
    setApiKeyVisible: noop,
    testState: 'idle',
    testResult: null,
    onSave: noop,
    onTest: noop,
    onCancel: noop,
    t,
  }))
  assert.doesNotMatch(markup, /embeddings\.name/u)
  assert.doesNotMatch(markup, /configuration name/u)
})

test('Model editor exposes a realtime connection test action', () => {
  const markup = renderToStaticMarkup(React.createElement(ModelEditor, {
    draft: { id: '', alias: '', name: 'qwen3.5-omni-flash-realtime', url: 'wss://example.test/realtime', apiKey: '' },
    setDraft: noop,
    apiKeyVisible: false,
    setApiKeyVisible: noop,
    testState: 'idle',
    testResult: null,
    onSave: noop,
    onTest: noop,
    onCancel: noop,
    t,
  }))
  assert.match(markup, /model\.test/)
})
test('Settings page exposes system audio separately from output and connection settings', () => {
  const markup = renderToStaticMarkup(React.createElement(SettingsPage, {
    selectedModel: { name: 'mock' },
    modelReady: true,
    micDevices: [],
    selectedMic: '',
    audioInputMode: 'system',
    selectAudioInputMode: noop,
    selectMicrophone: noop,
    micActive: false,
    micLevel: 0,
    outputDevices: [],
    selectedOutput: '',
    setSelectedOutput: noop,
    changeOutput: noop,
    outputVolume: 35,
    setOutputVolume: noop,
    autoReconnect: false,
    setAutoReconnect: noop,
    pushToTalk: false,
    setPushToTalk: noop,
    allowInterruptions: true,
    setAllowInterruptions: noop,
    liveTranscript: true,
    setLiveTranscript: noop,
    coreSubtitlesEnabled: false,
    setCoreSubtitlesEnabled: noop,
    language: 'zh-CN',
    setLanguage: noop,
    t,
    setNotice: noop,
  }))
  assert.match(markup, /value="system"/)
  assert.match(markup, /microphone\.systemSoundHint/)
  assert.match(markup, /settings\.connectionTitle/)
  assert.match(markup, /settings\.languageTitle/)
  assert.match(markup, /value="35"/)
})

test('Chat page preserves text input as a shared transcript channel and disables it while disconnected', () => {
  const markup = renderToStaticMarkup(React.createElement(ChatPage, {
    screenSharing: false,
    screenLoading: false,
    stopScreenShare: noop,
    openSourcePicker: noop,
    captureLockedDuringConnection: false,
    t,
    isConnected: false,
    connectionLabel: 'Disconnected',
    importLoading: false,
    roles: [],
    selectedRole: null,
    selectedRoleId: '',
    selectRole: noop,
    openNewRole: noop,
    isChatActive: false,
    stopChat: noop,
    startChat: noop,
    clearConversationContext: noop,
    isStarting: false,
    startChatBlockedReason: '',
    setActiveNav: noop,
    screenVideoRef: { current: null },
    micMuted: false,
    toggleMicrophoneMute: noop,
    deviceLabel: 'Default',
    micActive: false,
    micLevel: 0,
    exportSessionArtifact: noop,
    importSessionContext: noop,
    importedContext: null,
    setImportedContext: noop,
    transcript: [],
    assistantDraft: '',
    elapsed: 0,
    setTranscript: noop,
    submitTextMessage: noop,
    textInput: '',
    setTextInput: noop,
    textSending: false,
  }))
  assert.match(markup, /class="text-message-input"/)
  assert.match(markup, /class="text-message-form" role="group"/)
  assert.doesNotMatch(markup, /<form\b/)
  assert.match(markup, /<button type="button" class="primary-button text-message-submit"/)
  assert.match(markup, /transcript\.textInputDisconnected/)
  assert.match(markup, /disabled=""/)
  assert.match(markup, /transcript\.textInputSend/)
})

test('AppShell passes the text submit handler through to ChatPage', () => {
  assert.match(appShellSource, /transcript, assistantDraft, setTranscript, submitTextMessage, textInput/)
  assert.match(appShellSource, /seeBboxDebugEnabled, setSeeBboxDebugEnabled/)
})
