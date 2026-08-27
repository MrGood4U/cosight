import { useEffect, useState } from 'react'
import {
  Check,
  Cpu,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'

import {
  DEFAULT_HARNESS_SETTINGS,
  HARNESS_MODULES,
} from '../app/shared.js'

export function ModelsPage({ models, selectedModel, modelMode, harnessModels, harnessSettings, harnessEditorModule, harnessModelDraft, harnessApiKeyVisible, setHarnessApiKeyVisible, setHarnessModelDraft, modelEditorOpen, modelDraft, setModelDraft, modelApiKeyVisible, setModelApiKeyVisible, openNewModel, openEditModel, saveModel, selectModel, deleteModel, closeModelEditor, changeModelMode, openHarnessModelEditor, closeHarnessModelEditor, saveHarnessModel, saveHarnessSettings, deleteHarnessModel, isChatActive, t }) {
  const activeHarnessEditor = harnessEditorModule && harnessModelDraft ? <HarnessModelEditor id={`harness-editor-${harnessEditorModule}`} draft={harnessModelDraft} setDraft={setHarnessModelDraft} apiKeyVisible={harnessApiKeyVisible} setApiKeyVisible={setHarnessApiKeyVisible} onSave={saveHarnessModel} onCancel={closeHarnessModelEditor} t={t} /> : null
  return <section className="models-page" aria-labelledby="models-title">
    <div className="models-header">
      <div>
        <span className="page-kicker">{t('models.kicker')}</span>
        <h1 id="models-title">{t('models.title')}</h1>
        <p>{t('models.description')}</p>
      </div>
      <div className="models-header-actions">
        <ToggleRow label={t('harness.enable')} hint={modelMode === 'harness' ? t('harness.enabledHint') : t('harness.disabledHint')} value={modelMode === 'harness'} onChange={(value) => changeModelMode(value ? 'harness' : 'legacy')} disabled={isChatActive} />
      </div>
    </div>
    {modelMode === 'harness' ? <section className="model-mode-panel">
      <div className="model-mode-copy"><div><span className="page-kicker">{t('harness.kicker')}</span><h2>{t('harness.modeTitle')}</h2><p>{t('harness.modeDescription')}</p></div></div>
      <div className="harness-config-panel">
        <div className="harness-model-grid">{HARNESS_MODULES.map((module) => <HarnessModelCard key={module} module={module} model={harnessModels[module]} isEditing={harnessEditorModule === module} editor={harnessEditorModule === module ? activeHarnessEditor : null} isChatActive={isChatActive} onEdit={openHarnessModelEditor} onDelete={deleteHarnessModel} t={t} />)}</div>
        <div className="harness-local-draw"><Sparkles size={17} /><div><strong>{t('harness.drawTitle')}</strong><p>{t('harness.drawDescription')}</p></div><span className="model-key-state ready">{t('harness.localExecutor')}</span></div>
        <HarnessContextSettings settings={harnessSettings} onSave={saveHarnessSettings} isChatActive={isChatActive} t={t} />
      </div>
    </section> : <section className="legacy-model-section">
      {modelEditorOpen && <div className="model-page-editor"><ModelEditor draft={modelDraft} setDraft={setModelDraft} apiKeyVisible={modelApiKeyVisible} setApiKeyVisible={setModelApiKeyVisible} onSave={saveModel} onCancel={closeModelEditor} t={t} /></div>}
      <div className="section-heading-row"><div><span className="page-kicker">{t('models.legacyKicker')}</span><h2>{t('models.legacyTitle')}</h2></div><div className="legacy-section-actions"><small>{t('models.legacyDescription')}</small><button className="primary-button" type="button" onClick={openNewModel}><Plus size={15} />{t('models.add')}</button></div></div><div className="models-list">
      {models.map((model) => <ModelCard key={model.id} model={model} selected={selectedModel?.id === model.id} isChatActive={isChatActive} onSelect={selectModel} onEdit={openEditModel} onDelete={deleteModel} t={t} />)}
      {!models.length && !modelEditorOpen && <div className="models-empty"><Cpu size={19} /><div><strong>{t('models.emptyTitle')}</strong><p>{t('models.emptyDescription')}</p><button className="text-link" type="button" onClick={openNewModel}><Plus size={13} />{t('models.add')}</button></div></div>}
      </div>
    </section>}
  </section>
}
export function HarnessContextSettings({ settings, onSave, isChatActive, t }) {
  const [draft, setDraft] = useState({ ...DEFAULT_HARNESS_SETTINGS, ...(settings || {}) })
  const [saveState, setSaveState] = useState('saved')

  useEffect(() => {
    setDraft({ ...DEFAULT_HARNESS_SETTINGS, ...(settings || {}) })
    setSaveState('saved')
  }, [settings])

  const normalizeField = (key) => {
    const limits = {
      seeMinIntervalMs: [1000, 60000, DEFAULT_HARNESS_SETTINGS.seeMinIntervalMs],
      recentConversationCount: [1, 100, DEFAULT_HARNESS_SETTINGS.recentConversationCount],
      recentVisionCount: [1, 20, DEFAULT_HARNESS_SETTINGS.recentVisionCount],
    }
    const [min, max, fallback] = limits[key]
    const parsed = Number.parseInt(String(draft[key] ?? ''), 10)
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
  }

  const commit = async (key) => {
    const next = { ...draft, [key]: normalizeField(key) }
    setDraft(next)
    setSaveState('saving')
    try {
      const result = await onSave(next)
      setSaveState(result?.ok ? 'saved' : 'error')
    } catch {
      setSaveState('error')
    }
  }

  const update = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value.replace(/\D/g, '').slice(0, 5) }))
    setSaveState('pending')
  }

  const field = (key, label, hint, unit, inputId) => (
    <label className="harness-context-field" htmlFor={inputId}>
      <span>{label}</span>
      <div className="harness-context-field-input">
        <input
          id={inputId}
          className="text-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft[key] ?? ''}
          onChange={(event) => update(key, event.target.value)}
          onBlur={() => commit(key)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          disabled={isChatActive}
          aria-describedby={`${inputId}-hint`}
        />
        <em>{unit}</em>
      </div>
      <small id={`${inputId}-hint`}>{hint}</small>
    </label>
  )

  return <section className="harness-context-settings" aria-labelledby="harness-context-settings-title">
    <div className="harness-context-settings-header">
      <div>
        <h3 id="harness-context-settings-title">{t('harness.contextTitle')}</h3>
        <p>{t('harness.contextDescription')}</p>
      </div>
      <span className={`harness-autosave-status ${saveState}`} role="status">
        {saveState === 'saving' ? t('harness.saving') : saveState === 'error' ? t('harness.saveError') : saveState === 'pending' ? t('harness.pendingSave') : t('harness.autoSaved')}
      </span>
    </div>
    <div className="harness-context-fields">
      {field('recentConversationCount', t('harness.recentConversation'), t('harness.recentConversationHint'), t('harness.messagesUnit'), 'harness-recent-conversation')}
      {field('recentVisionCount', t('harness.recentVision'), t('harness.recentVisionHint'), t('harness.snapshotsUnit'), 'harness-recent-vision')}
      {field('seeMinIntervalMs', t('harness.seeInterval'), t('harness.seeIntervalHint'), t('harness.milliseconds'), 'harness-see-interval')}
    </div>
    {isChatActive && <small className="harness-context-locked">{t('harness.lockedDuringChat')}</small>}
  </section>
}

export function HarnessModelCard({ module, model, isEditing, editor, isChatActive, onEdit, onDelete, t }) {
  const title = t(`harness.modules.${module}`)
  const displayName = model?.alias || model?.name
  const editorId = `harness-editor-${module}`
  return <article className={`harness-model-card ${model ? '' : 'empty'} ${isEditing ? 'editing' : ''}`}>
    <div className="harness-model-card-header"><div className="model-card-icon"><Cpu size={17} /></div><div><span className="harness-module-label">{title}</span><h3>{displayName || t('harness.notConfigured')}</h3></div><span className={`model-key-state ${model?.hasApiKey ? 'ready' : ''}`}>{model?.hasApiKey ? t('model.keySaved') : t('model.keyRequired')}</span></div>
    {model && <><p className="model-card-real-name">{model.name}</p><p className="model-card-url" title={model.url}>{model.url}</p></>}
    <div className="harness-model-card-actions"><button type="button" className="outline-button" onClick={() => onEdit(module, model)} disabled={isChatActive} aria-expanded={isEditing} aria-controls={isEditing ? editorId : undefined}>{model ? t('model.edit') : t('harness.configure')}</button>{model && <button type="button" className="danger-link" onClick={() => onDelete(module)} disabled={isChatActive}>{t('model.delete')}</button>}</div>
    {editor}
  </article>
}

export function HarnessModelEditor({ id, draft, setDraft, apiKeyVisible, setApiKeyVisible, onSave, onCancel, t }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const moduleTitle = t(`harness.modules.${draft.module}`)
  return <div id={id} className="harness-model-editor"><div className="editor-heading"><div><strong>{moduleTitle}</strong><small>{t('harness.independentForm')}</small></div><button type="button" onClick={onCancel} aria-label={t('common.close')} title={t('common.close')}><X size={15} /></button></div><label className="editor-label">{t('model.alias')}<input className="text-input" value={draft.alias} onChange={(event) => update('alias', event.target.value)} placeholder={t('model.aliasPlaceholder')} maxLength={120} /></label><label className="editor-label">{t('model.name')}<input className="text-input" value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder={t('model.namePlaceholder')} /></label><label className="editor-label">{t('model.url')}<input className="text-input" value={draft.url} onChange={(event) => update('url', event.target.value)} placeholder={t('model.urlPlaceholder')} /></label>{draft.module === 'speak' && <label className="editor-label">{t('model.voice')}<input className="text-input" value={draft.voice} onChange={(event) => update('voice', event.target.value)} placeholder={t('model.voicePlaceholder')} /><small>{t('harness.roleVoiceOverrideHint')}</small></label>}<label className="editor-label">{t('model.apiKey')}<div className="secret-field"><input type={apiKeyVisible ? 'text' : 'password'} value={draft.apiKey} onChange={(event) => update('apiKey', event.target.value)} placeholder={draft.id ? t('model.keepKeyPlaceholder') : t('model.keyPlaceholder')} /><button type="button" onClick={() => setApiKeyVisible((value) => !value)} aria-label={apiKeyVisible ? t('model.hideKey') : t('model.showKey')} title={apiKeyVisible ? t('model.hideKey') : t('model.showKey')}>{apiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><div className="editor-actions"><button type="button" className="outline-button" onClick={onCancel}>{t('model.cancel')}</button><button type="button" className="save-key-button" onClick={onSave}><Check size={14} /> {t('model.save')}</button></div></div>
}

export function ModelCard({ model, selected, isChatActive, onSelect, onEdit, onDelete, t }) {
  const displayName = model.alias || model.name
  return <article className={`model-card ${selected ? 'selected' : ''}`}>
    <div className="model-card-main">
      <div className="model-card-icon"><Cpu size={19} /></div>
      <div className="model-card-content">
        <div className="model-card-title-row"><h2 title={displayName}>{displayName}</h2>{selected && <span className="model-active-badge"><span className="status-dot green" />{t('models.active')}</span>}</div>
        {model.alias && <p className="model-card-real-name">{model.name}</p>}
        <p className="model-card-url" title={model.url}>{model.url}</p>
        <span className={`model-key-state ${model.hasApiKey ? 'ready' : ''}`}>{model.hasApiKey ? t('model.keySaved') : t('model.keyRequired')}</span>
      </div>
    </div>
    <div className="model-card-actions">
      <button type="button" className={`outline-button ${selected ? 'selected' : ''}`} onClick={() => onSelect(model.id)} disabled={isChatActive || selected} title={isChatActive ? t('models.lockedDuringChat') : undefined}>{selected ? <Check size={13} /> : null}{selected ? t('models.active') : t('models.use')}</button>
      <button type="button" className="text-link" onClick={() => onEdit(model)} disabled={isChatActive} title={isChatActive ? t('models.lockedDuringChat') : t('model.edit')}><Pencil size={13} />{t('model.edit')}</button>
      <button type="button" className="danger-link" onClick={() => onDelete(model)} disabled={isChatActive} title={isChatActive ? t('models.lockedDuringChat') : t('model.delete')}><Trash2 size={13} />{t('model.delete')}</button>
    </div>
  </article>
}
