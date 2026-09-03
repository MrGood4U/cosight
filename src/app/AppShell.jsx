import { useLayoutEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { navItems } from './shared.js'
import { useCosightSession } from '../hooks/useCosightSession.js'
import { ChatPage } from '../components/ChatPage.jsx'
import { AbilitiesPage } from '../components/AbilitiesPage.jsx'
import { ModelsPage } from '../components/ModelsPage.jsx'
import { PromptPreview, RolesPage } from '../components/RolesPage.jsx'
import { SettingsPage, SourcePicker } from '../components/SettingsPage.jsx'
import { UsagePage } from '../components/UsagePage.jsx'
import { EmbeddingPage } from '../components/EmbeddingPage.jsx'

export default function App() {
  useLayoutEffect(() => {
    // Every view owns its scroll position through .workspace. Keep the
    // browser document at the origin so focus changes cannot move the shell
    // out of the Electron viewport. The root is intentionally not a scroll
    // container; only .workspace is allowed to own page scrolling.
    const resetDocumentScroll = () => {
      const root = document.getElementById('root')
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0
      if (root?.scrollTop !== 0) root.scrollTop = 0
    }
    resetDocumentScroll()
    window.addEventListener('scroll', resetDocumentScroll, { passive: true })
    return () => window.removeEventListener('scroll', resetDocumentScroll)
  }, [])

  const {
    activeNav, setActiveNav, language, models, selectedModel, modelMode, harnessModels, harnessSettings,
    harnessEditorModule, harnessModelDraft, harnessApiKeyVisible, setHarnessApiKeyVisible, harnessTestState, harnessTestResult, testHarnessModelConfig,
    setHarnessModelDraft, modelEditorOpen, setModelEditorOpen, modelDraft, setModelDraft, modelApiKeyVisible,
    setModelApiKeyVisible, modelTestState, modelTestResult, testModelConfig, openNewModel, openEditModel, saveModel, closeModelEditor, selectModel, deleteSelectedModel,
    changeModelMode, openHarnessModelEditor, closeHarnessModelEditor, saveHarnessModel,
    saveHarnessSettings, deleteHarnessModel, roles, selectedRole, selectedRoleId, roleEditorOpen, roleDraft, setRoleDraft,
    openNewRole, openEditRole, closeRoleEditor, previewRolePrompt, saveRole, reindexRoleKnowledge, selectRole, deleteRole,
    embeddingModels, embeddingEditorOpen, setEmbeddingEditorOpen, embeddingModelDraft, setEmbeddingModelDraft,
    embeddingApiKeyVisible, setEmbeddingApiKeyVisible, embeddingTestState, embeddingTestResult,
    openNewEmbeddingModel, openEditEmbeddingModel, saveEmbeddingModel, deleteEmbeddingModel,
    testEmbeddingModelConfig,
    isChatActive, t, setNotice, setLanguage, modelReady, micDevices, selectedMic, audioInputMode,
    selectMicrophone, selectAudioInputMode, micActive, micLevel, outputDevices, selectedOutput, setSelectedOutput,
    changeOutput, outputVolume, setOutputVolume, autoReconnect, setAutoReconnect, pushToTalk,
    setPushToTalk, allowInterruptions, setAllowInterruptions, liveTranscript, setLiveTranscript,
    coreSubtitlesEnabled, setCoreSubtitlesEnabled, sourcePickerOpen, setSourcePickerOpen, sources, sourcesLoading,
    shareSource, rolePromptPreviewOpen, rolePromptPreview, rolePromptPreviewLoading,
    setRolePromptPreviewOpen, notice, exportSessionArtifact, importSessionContext,
    screenSharing, screenLoading, stopScreenShare, openSourcePicker, captureLockedDuringConnection,
    startChat, stopChat, isStarting, startChatBlockedReason, screenVideoRef, micMuted, toggleMicrophoneMute,
    deviceLabel, transcript, assistantDraft, elapsed, setTranscript, submitTextMessage, textInput,
    setTextInput, textSending, importedContext, setImportedContext, importLoading, clearConversationContext,
    isConnected, connectionLabel, seeBboxDebugEnabled, setSeeBboxDebugEnabled,
    seeMaxObjects, setSeeMaxObjects,
    turnDetectionSilenceDurationMs, setTurnDetectionSilenceDurationMs,
    toggleNav,
  } = useCosightSession()

  return (
    <div className="app-shell">
      <div className="app-body">
        <aside className="sidebar">
          <div className="brand">Cosight</div>
          <nav className="nav-list">
            {navItems.map(({ key, labelKey, icon: Icon }) => (
              <button className={`nav-item ${activeNav === key ? 'active' : ''}`} key={key} onClick={() => toggleNav(key)}>
                <Icon size={17} strokeWidth={1.8} />
                <span>{t(labelKey)}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="workspace">
          {activeNav === 'abilities' ? <AbilitiesPage t={t} seeBboxDebugEnabled={seeBboxDebugEnabled} setSeeBboxDebugEnabled={setSeeBboxDebugEnabled} seeMaxObjects={seeMaxObjects} setSeeMaxObjects={setSeeMaxObjects} turnDetectionSilenceDurationMs={turnDetectionSilenceDurationMs} setTurnDetectionSilenceDurationMs={setTurnDetectionSilenceDurationMs} /> : activeNav === 'roles' ? <RolesPage {...{ roles, selectedRoleId, roleEditorOpen, roleDraft, setRoleDraft, embeddingModels, openNewRole, openEditRole, closeRoleEditor, previewRolePrompt, saveRole, reindexRoleKnowledge, selectRole, deleteRole, isChatActive, modelMode, t, setNotice }} /> : activeNav === 'models' ? <ModelsPage {...{ models, selectedModel, modelMode, harnessModels, harnessSettings, harnessEditorModule, harnessModelDraft, harnessApiKeyVisible, setHarnessApiKeyVisible, harnessTestState, harnessTestResult, testHarnessModelConfig, setHarnessModelDraft, modelEditorOpen, modelDraft, setModelDraft, modelApiKeyVisible, setModelApiKeyVisible, modelTestState, modelTestResult, testModelConfig, openNewModel, openEditModel, saveModel, selectModel, deleteModel: deleteSelectedModel, closeModelEditor, changeModelMode, openHarnessModelEditor, closeHarnessModelEditor, saveHarnessModel, saveHarnessSettings, deleteHarnessModel, isChatActive, t }} /> : activeNav === 'embeddings' ? <EmbeddingPage {...{ models: embeddingModels, editorOpen: embeddingEditorOpen, draft: embeddingModelDraft, setDraft: setEmbeddingModelDraft, apiKeyVisible: embeddingApiKeyVisible, setApiKeyVisible: setEmbeddingApiKeyVisible, testState: embeddingTestState, testResult: embeddingTestResult, openNew: openNewEmbeddingModel, openEdit: openEditEmbeddingModel, save: saveEmbeddingModel, remove: deleteEmbeddingModel, test: testEmbeddingModelConfig, closeEditor: () => setEmbeddingEditorOpen(false), t }} /> : activeNav === 'usage' ? <UsagePage t={t} language={language} /> : activeNav === 'settings' ? <SettingsPage {...{ selectedModel, modelReady, micDevices, selectedMic, audioInputMode, selectAudioInputMode, selectMicrophone, micActive, micLevel, outputDevices, selectedOutput, setSelectedOutput, changeOutput, outputVolume, setOutputVolume, autoReconnect, setAutoReconnect, pushToTalk, setPushToTalk, allowInterruptions, setAllowInterruptions, liveTranscript, setLiveTranscript, coreSubtitlesEnabled, setCoreSubtitlesEnabled, language, setLanguage, t, setNotice }} /> : <ChatPage {...{ screenSharing, screenLoading, stopScreenShare, openSourcePicker, captureLockedDuringConnection, roles, selectedRole, selectedRoleId, selectRole, openNewRole, isChatActive, stopChat, startChat, clearConversationContext, isStarting, startChatBlockedReason, setActiveNav, t, isConnected, connectionLabel, screenVideoRef, micMuted, toggleMicrophoneMute, deviceLabel, micActive, micLevel, elapsed, exportSessionArtifact, importSessionContext, importedContext, setImportedContext, importLoading, transcript, assistantDraft, setTranscript, submitTextMessage, textInput, setTextInput, textSending }} />}
        </main>

      </div>

      {sourcePickerOpen && <SourcePicker sources={sources} sourcesLoading={sourcesLoading} onSelect={shareSource} onClose={() => setSourcePickerOpen(false)} t={t} />}
      {rolePromptPreviewOpen && <PromptPreview prompt={rolePromptPreview} loading={rolePromptPreviewLoading} onClose={() => setRolePromptPreviewOpen(false)} t={t} />}
      {notice && <div className="toast"><Sparkles size={15} />{notice}</div>}
    </div>
  )

}
