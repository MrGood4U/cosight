import { Sparkles } from 'lucide-react'
import { navItems } from './shared.js'
import { useCosightSession } from '../hooks/useCosightSession.js'
import { ChatPage } from '../components/ChatPage.jsx'
import { AbilitiesPage } from '../components/AbilitiesPage.jsx'
import { ModelsPage } from '../components/ModelsPage.jsx'
import { PromptPreview, RolesPage } from '../components/RolesPage.jsx'
import { SettingsPage, SourcePicker } from '../components/SettingsPage.jsx'
import { UsagePage } from '../components/UsagePage.jsx'

export default function App() {
  const {
    activeNav, setActiveNav, language, models, selectedModel, modelMode, harnessModels, harnessSettings,
    harnessEditorModule, harnessModelDraft, harnessApiKeyVisible, setHarnessApiKeyVisible,
    setHarnessModelDraft, modelEditorOpen, setModelEditorOpen, modelDraft, setModelDraft, modelApiKeyVisible,
    setModelApiKeyVisible, openNewModel, openEditModel, saveModel, selectModel, deleteSelectedModel,
    changeModelMode, openHarnessModelEditor, closeHarnessModelEditor, saveHarnessModel,
    saveHarnessSettings, deleteHarnessModel, roles, selectedRoleId, roleEditorOpen, roleDraft,
    openNewRole, openEditRole, closeRoleEditor, previewRolePrompt, saveRole, selectRole, deleteRole,
    isChatActive, t, setNotice, setLanguage, modelReady, micDevices, selectedMic,
    selectMicrophone, micActive, micLevel, outputDevices, selectedOutput, setSelectedOutput,
    changeOutput, outputVolume, setOutputVolume, autoReconnect, setAutoReconnect, pushToTalk,
    setPushToTalk, allowInterruptions, setAllowInterruptions, liveTranscript, setLiveTranscript,
    coreSubtitlesEnabled, setCoreSubtitlesEnabled, sourcePickerOpen, setSourcePickerOpen, sources, sourcesLoading,
    shareSource, rolePromptPreviewOpen, rolePromptPreview, rolePromptPreviewLoading,
    setRolePromptPreviewOpen, notice, exportSessionArtifact, importSessionContext,
    screenSharing, screenLoading, stopScreenShare, openSourcePicker, captureLockedDuringConnection,
    startChat, isStarting, startChatBlockedReason, screenVideoRef, micMuted, toggleMicrophoneMute,
    deviceLabel, transcript, assistantDraft, elapsed, setTranscript, submitTextMessage, textInput,
    setTextInput, textSending, importedContext, setImportedContext,
  } = useCosightSession()

  return (
    <div className="app-shell">
      <header className="window-bar">
        <span>{t('app.name')}</span>
      </header>

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
          {activeNav === 'abilities' ? <AbilitiesPage t={t} /> : activeNav === 'roles' ? <RolesPage {...{ roles, selectedRoleId, roleEditorOpen, roleDraft, openNewRole, openEditRole, closeRoleEditor, previewRolePrompt, saveRole, selectRole, deleteRole, isChatActive, t, setNotice }} /> : activeNav === 'models' ? <ModelsPage {...{ models, selectedModel, modelMode, harnessModels, harnessSettings, harnessEditorModule, harnessModelDraft, harnessApiKeyVisible, setHarnessApiKeyVisible, setHarnessModelDraft, modelEditorOpen, modelDraft, setModelDraft, modelApiKeyVisible, setModelApiKeyVisible, openNewModel, openEditModel, saveModel, selectModel, deleteModel: deleteSelectedModel, closeModelEditor: () => setModelEditorOpen(false), changeModelMode, openHarnessModelEditor, closeHarnessModelEditor, saveHarnessModel, saveHarnessSettings, deleteHarnessModel, isChatActive, t }} /> : activeNav === 'usage' ? <UsagePage t={t} language={language} /> : activeNav === 'settings' ? <SettingsPage {...{ selectedModel, modelReady, micDevices, selectedMic, selectMicrophone, micActive, micLevel, outputDevices, selectedOutput, setSelectedOutput, changeOutput, outputVolume, setOutputVolume, autoReconnect, setAutoReconnect, pushToTalk, setPushToTalk, allowInterruptions, setAllowInterruptions, liveTranscript, setLiveTranscript, coreSubtitlesEnabled, setCoreSubtitlesEnabled, language, setLanguage, t, setNotice }} /> : <ChatPage {...{ screenSharing, screenLoading, stopScreenShare, openSourcePicker, captureLockedDuringConnection, roles, selectedRole, selectedRoleId, selectRole, openNewRole, isChatActive, stopChat, startChat, isStarting, startChatBlockedReason, setActiveNav, t, isConnected, connectionLabel, screenVideoRef, micMuted, toggleMicrophoneMute, deviceLabel, micActive, micLevel, exportSessionArtifact, importSessionContext, importedContext, setImportedContext, importLoading, transcript, assistantDraft, elapsed, setTranscript, submitTextMessage, textInput, setTextInput, textSending }} />}
        </main>

      </div>

      {sourcePickerOpen && <SourcePicker sources={sources} sourcesLoading={sourcesLoading} onSelect={shareSource} onClose={() => setSourcePickerOpen(false)} t={t} />}
      {rolePromptPreviewOpen && <PromptPreview prompt={rolePromptPreview} loading={rolePromptPreviewLoading} onClose={() => setRolePromptPreviewOpen(false)} t={t} />}
      {notice && <div className="toast"><Sparkles size={15} />{notice}</div>}
    </div>
  )

}
