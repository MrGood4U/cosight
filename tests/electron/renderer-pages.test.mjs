import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

import { emptyRoleDraft } from '../../src/app/shared.js'

let viteServer
let ModelsPage
let RoleEditor
let SettingsPage
let ChatPage
let EmbeddingPage

const t = (key) => key
const noop = () => {}

before(async () => {
  viteServer = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  ;({ ModelsPage } = await viteServer.ssrLoadModule('/src/components/ModelsPage.jsx'))
  ;({ RoleEditor } = await viteServer.ssrLoadModule('/src/components/RolesPage.jsx'))
  ;({ SettingsPage } = await viteServer.ssrLoadModule('/src/components/SettingsPage.jsx'))
  ;({ ChatPage } = await viteServer.ssrLoadModule('/src/components/ChatPage.jsx'))
  ;({ EmbeddingPage } = await viteServer.ssrLoadModule('/src/components/EmbeddingPage.jsx'))
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

test('Role editor exposes selectable Prompt and RAG knowledge modes', () => {
  const markup = renderToStaticMarkup(React.createElement(RoleEditor, {
    draft: { ...emptyRoleDraft(), name: 'RAG role', knowledgeMode: 'rag' },
    embeddingModels: [{ id: 'embed-1', alias: 'Cloud embed', name: 'Qwen embed', model: 'text-embedding-v4' }],
    setDraft: noop,
    onSave: noop,
    onCancel: noop,
    onPreview: noop,
    t,
    setNotice: noop,
  }))
  assert.match(markup, /roles\.knowledgeMode/)
  assert.match(markup, /roles\.knowledgeRagMode/)
  assert.match(markup, /embed-1/)
  assert.match(markup, /knowledge-rag-note/)
})

test('Role editor distinguishes partial knowledge indexing and exposes reindex action', () => {
  const markup = renderToStaticMarkup(React.createElement(RoleEditor, {
    draft: {
      ...emptyRoleDraft(),
      id: 'rag-role',
      name: 'RAG role',
      knowledgeMode: 'rag',
      knowledgeStatus: { status: 'ready_with_errors', chunkCount: 4, error: 'manual.pdf：无法解析文件' },
    },
    embeddingModels: [{ id: 'embed-1', alias: 'Cloud embed', name: 'Qwen embed', model: 'text-embedding-v4' }],
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
  assert.match(markup, /roles\.knowledgeReindex/)
})

test('Embedding page renders cloud/local entry points and configured model cards', () => {
  const markup = renderToStaticMarkup(React.createElement(EmbeddingPage, {
    models: [{ id: 'embed-1', type: 'local', alias: 'Local test', name: 'Local service', model: 'qwen-embed', url: 'http://127.0.0.1:8080/v1', dimensions: 1024, hasApiKey: false }],
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
  assert.match(markup, /transcript\.textInputDisconnected/)
  assert.match(markup, /disabled=""/)
  assert.match(markup, /transcript\.textInputSend/)
})
