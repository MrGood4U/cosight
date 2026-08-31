import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Languages,
  LoaderCircle,
  Mic,
  Radio,
  RotateCcw,
  Volume2,
  X,
} from 'lucide-react'

import { LANGUAGE_OPTIONS } from '../i18n.js'


export function SettingsPage({ selectedModel, modelReady, micDevices, selectedMic, audioInputMode, selectAudioInputMode, selectMicrophone, micActive, micLevel, outputDevices, selectedOutput, setSelectedOutput, changeOutput, outputVolume, setOutputVolume, autoReconnect, setAutoReconnect, pushToTalk, setPushToTalk, allowInterruptions, setAllowInterruptions, liveTranscript, setLiveTranscript, coreSubtitlesEnabled, setCoreSubtitlesEnabled, language, setLanguage, t, setNotice }) {
  return <section className="settings-page" aria-labelledby="settings-title">
    <div className="settings-page-header">
      <span className="page-kicker">{t('settings.kicker')}</span>
      <h1 id="settings-title">{t('settings.title')}</h1>
      <p>{t('settings.description')}</p>
    </div>
    <div className="settings-page-content">
      <section className="settings-page-section">
        <h2>{t('settings.devicesTitle')}</h2>
        <div className="settings-page-grid">
          <div className="field-group settings-page-field"><label className="field-label">{t('microphone.inputSource')}</label><label className="select-field"><span className="select-icon"><Radio size={16} /></span><select value={audioInputMode} onChange={(event) => { void selectAudioInputMode(event.target.value) }} aria-label={t('microphone.inputSource')}><option value="microphone">{t('microphone.microphoneInput')}</option><option value="system">{t('microphone.systemSound')}</option></select><span className="select-value">{audioInputMode === 'system' ? t('microphone.systemSound') : t('microphone.microphoneInput')}</span><ChevronDown size={15} /></label>{audioInputMode === 'microphone' ? <DeviceSelect icon={<Mic size={16} />} value={selectedMic} onChange={selectMicrophone} devices={micDevices} fallback={t('microphone.default')} /> : <p className="audio-source-hint">{t('microphone.systemSoundHint')}</p>}<div className="device-meta"><div className={`settings-mic-meter ${micActive ? 'active' : ''}`} role="meter" aria-label={t('microphone.level')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(micLevel * 100)}><span style={{ width: `${Math.round(micLevel * 100)}%` }} /></div></div></div>
          <div className="field-group settings-page-field"><label className="field-label">{t('audio.output')}</label><DeviceSelect icon={<Volume2 size={16} />} value={selectedOutput} onChange={changeOutput} devices={outputDevices} fallback={t('audio.defaultSpeakers')} /><div className="volume-row"><Volume2 size={16} /><input type="range" min="0" max="100" value={outputVolume} onChange={(event) => setOutputVolume(Number(event.target.value))} aria-label={t('audio.output')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={outputVolume} /><output className="volume-value">{outputVolume}%</output></div></div>
        </div>
        <button className="reset-link" onClick={() => { setSelectedMic(''); setSelectedOutput(''); setNotice(t('settings.resetDevicesNotice')) }}><RotateCcw size={15} /> {t('settings.resetDevices')}</button>
      </section>
      <section className="settings-page-section">
        <h2>{t('settings.connectionTitle')}</h2>
        <div className="settings-page-grid settings-page-grid-single">
          <div className="field-group settings-page-field"><label className="field-label">{t('settings.connection')}</label><div className="connection-box"><span><span className={`status-dot ${modelReady ? 'green' : ''}`} />{selectedModel ? (modelReady ? t('settings.readyToConnect') : t('settings.apiKeyRequired')) : t('settings.modelRequired')}</span><button className="small-button" disabled>{t('settings.disconnect')}</button></div></div>
        </div>
      </section>
      <section className="settings-page-section">
        <h2>{t('settings.languageTitle')}</h2>
        <div className="settings-page-grid settings-page-grid-single">
          <div className="field-group settings-page-field"><label className="field-label">{t('settings.language')}</label><label className="select-field"><Languages size={16} /><select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t('settings.language')}>{LANGUAGE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{t(option.key)}</option>)}</select><span className="select-value">{t(LANGUAGE_OPTIONS.find((option) => option.value === language)?.key || 'language.english')}</span><ChevronDown size={15} /></label></div>
        </div>
      </section>
      <section className="settings-page-section">
        <h2>{t('settings.behaviorTitle')}</h2>
        <div className="settings-toggle-list">
          <ToggleRow label={t('settings.autoReconnect')} hint={t('settings.autoReconnectHint')} value={autoReconnect} onChange={setAutoReconnect} />
          <ToggleRow label={t('settings.pushToTalk')} hint={t('settings.pushToTalkHint')} value={pushToTalk} onChange={setPushToTalk} />
          <ToggleRow label={t('settings.allowInterruptions')} hint={t('settings.allowInterruptionsHint')} value={allowInterruptions} onChange={setAllowInterruptions} />
          <ToggleRow label={t('settings.liveTranscripts')} hint={t('settings.liveTranscriptsHint')} value={liveTranscript} onChange={setLiveTranscript} />
          <ToggleRow label={t('settings.subtitles')} hint={t('settings.subtitlesHint')} value={coreSubtitlesEnabled} onChange={setCoreSubtitlesEnabled} />
        </div>
      </section>
    </div>
  </section>
}

export function ModelEditor({ draft, setDraft, apiKeyVisible, setApiKeyVisible, testState, testResult, onSave, onTest, onCancel, t }) {
  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  return <div className="model-editor">
    <div className="editor-heading"><strong>{draft.id ? t('model.editTitle') : t('model.addTitle')}</strong><button onClick={onCancel} aria-label={t('common.close')} title={t('common.close')}><X size={15} /></button></div>
    <label className="editor-label">{t('model.alias')}<input className="text-input" value={draft.alias} onChange={(event) => updateDraft('alias', event.target.value)} placeholder={t('model.aliasPlaceholder')} maxLength={120} /></label>
    <label className="editor-label">{t('model.name')}<input className="text-input" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder={t('model.namePlaceholder')} /></label>
    <label className="editor-label">{t('model.realtimeUrl')}<input className="text-input" value={draft.url} onChange={(event) => updateDraft('url', event.target.value)} placeholder={t('model.urlPlaceholder')} /></label>
    <label className="editor-label">{t('model.apiKey')}<div className="secret-field"><input type={apiKeyVisible ? 'text' : 'password'} value={draft.apiKey} onChange={(event) => updateDraft('apiKey', event.target.value)} placeholder={draft.id ? t('model.keepKeyPlaceholder') : t('model.keyPlaceholder')} /><button onClick={() => setApiKeyVisible((value) => !value)} aria-label={apiKeyVisible ? t('model.hideKey') : t('model.showKey')} title={apiKeyVisible ? t('model.hideKey') : t('model.showKey')}>{apiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
    <>{testResult && <div className={`model-test-result ${testState}`} role="status">{testState === 'success' ? <><Check size={14} />{t('model.testSuccess')}</> : testResult.error}</div>}<div className="editor-actions"><button className="outline-button" onClick={onCancel}>{t('model.cancel')}</button><button className="outline-button" onClick={onTest} disabled={testState === 'testing'}>{testState === 'testing' ? t('model.testing') : t('model.test')}</button><button className="save-key-button" onClick={onSave}><Check size={14} /> {t('model.save')}</button></div></>
  </div>
}

export function DeviceSelect({ icon, value, onChange, devices, fallback }) { const selectedDevice = devices.find((device) => device.deviceId === value); return <label className="select-field"><span className="select-icon">{icon}</span><select value={value} onChange={(event) => onChange(event.target.value)} aria-label={fallback}><option value="">{fallback}</option>{devices.map((device) => <option value={device.deviceId} key={device.deviceId}>{device.label || fallback}</option>)}</select><span className="select-value">{selectedDevice?.label || fallback}</span><ChevronDown size={15} /></label> }

export function ToggleRow({ label, hint, value, onChange, disabled = false }) { return <div className="toggle-row"><div><strong>{label}</strong><small>{hint}</small></div><button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-label={label} aria-pressed={value} disabled={disabled}><span /></button></div> }

export function SourcePicker({ sources, sourcesLoading, onSelect, onClose, t }) { return <div className="modal-backdrop"><div className="source-modal"><div className="modal-header"><div><span className="modal-kicker">{t('screen.captureKicker')}</span><h2>{t('screen.shareScreenOrWindow')}</h2></div><button onClick={onClose} aria-label={t('common.close')} title={t('common.close')}><X size={18} /></button></div><div className="source-grid">{sources.map((source) => <button className="source-option" key={source.id} onClick={() => onSelect(source)}><img src={source.thumbnail} alt="" /><span>{source.name}</span></button>)}</div>{sourcesLoading ? <div className="empty-sources"><LoaderCircle className="spin" size={18} /> {t('sourcePicker.loading')}</div> : !sources.length && <div className="empty-sources"><Radio size={18} /> {t('screen.noScreens')}</div>}</div></div> }
