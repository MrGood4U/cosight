import {
  Check,
  Cloud,
  Database,
  Eye,
  EyeOff,
  HardDrive,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

function typeLabel(type, t) {
  return type === 'local' ? t('embeddings.local') : t('embeddings.cloud')
}

export function EmbeddingPage({ models, editorOpen, draft, setDraft, apiKeyVisible, setApiKeyVisible, testState, testResult, openNew, openEdit, save, remove, test, closeEditor, t }) {
  return <section className="embedding-page" aria-labelledby="embedding-title">
    <div className="embedding-header">
      <div>
        <span className="page-kicker">{t('embeddings.kicker')}</span>
        <h1 id="embedding-title">{t('embeddings.title')}</h1>
        <p>{t('embeddings.description')}</p>
      </div>
      <div className="embedding-header-actions">
        <button className="outline-button" type="button" onClick={() => openNew('local')}><HardDrive size={15} />{t('embeddings.addLocal')}</button>
        <button className="primary-button" type="button" onClick={() => openNew('cloud')}><Cloud size={15} />{t('embeddings.addCloud')}</button>
      </div>
    </div>
    {editorOpen && <EmbeddingModelEditor draft={draft} setDraft={setDraft} apiKeyVisible={apiKeyVisible} setApiKeyVisible={setApiKeyVisible} testState={testState} testResult={testResult} onSave={save} onTest={test} onCancel={closeEditor} t={t} />}
    <div className="embedding-list">
      {models.map((model) => <EmbeddingModelCard key={model.id} model={model} onEdit={openEdit} onDelete={remove} t={t} />)}
      {!models.length && !editorOpen && <div className="models-empty embedding-empty"><Database size={19} /><div><strong>{t('embeddings.emptyTitle')}</strong><p>{t('embeddings.emptyDescription')}</p><button className="text-link" type="button" onClick={() => openNew('cloud')}><Plus size={13} />{t('embeddings.addCloud')}</button></div></div>}
    </div>
  </section>
}

export function EmbeddingModelCard({ model, onEdit, onDelete, t }) {
  const Icon = model.type === 'local' ? HardDrive : Cloud
  return <article className="embedding-card">
    <div className="embedding-card-main">
      <div className="model-card-icon"><Icon size={19} /></div>
      <div className="embedding-card-content">
        <div className="embedding-card-title-row"><h2 title={model.alias || model.model}>{model.alias || model.model}</h2><span className="embedding-kind-badge">{typeLabel(model.type, t)}</span></div>
        <p className="model-card-url" title={model.url}>{model.url}</p>
        <div className="embedding-card-meta"><span>{t('embeddings.model')}: {model.model}</span>{model.dimensions ? <span>{t('embeddings.dimensions')}: {model.dimensions}</span> : null}<span className="model-key-state ready">{model.hasApiKey ? t('embeddings.keySaved') : model.type === 'local' ? t('embeddings.keyOptional') : t('model.keyRequired')}</span></div>
      </div>
    </div>
    <div className="embedding-card-actions"><button type="button" className="outline-button" onClick={() => onEdit(model)}><Pencil size={13} />{t('model.edit')}</button><button type="button" className="danger-link" onClick={() => onDelete(model)}><Trash2 size={13} />{t('model.delete')}</button></div>
  </article>
}

export function EmbeddingModelEditor({ draft, setDraft, apiKeyVisible, setApiKeyVisible, testState, testResult, onSave, onTest, onCancel, t }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const isLocal = draft.type === 'local'
  return <section className="embedding-editor" aria-labelledby="embedding-editor-title">
    <div className="embedding-editor-heading"><div><span className="page-kicker">{t('embeddings.kicker')}</span><h2 id="embedding-editor-title">{draft.id ? t('embeddings.editTitle') : t('embeddings.addTitle')}</h2><p>{isLocal ? t('embeddings.localHint') : t('embeddings.cloudHint')}</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label={t('common.close')} title={t('common.close')}><X size={16} /></button></div>
    <div className="embedding-editor-grid">
      <label className="editor-label">{t('embeddings.alias')}<input className="text-input" value={draft.alias} onChange={(event) => update('alias', event.target.value)} placeholder={t('embeddings.aliasPlaceholder')} maxLength={120} /></label>
      <label className="editor-label">{t('embeddings.model')}<input className="text-input" value={draft.model} onChange={(event) => update('model', event.target.value)} placeholder={t('embeddings.modelPlaceholder')} /></label>
      <label className="editor-label">{t('embeddings.dimensions')}<input className="text-input" inputMode="numeric" value={draft.dimensions} onChange={(event) => update('dimensions', event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('embeddings.dimensionsPlaceholder')} /><small>{t('embeddings.dimensionsHint')}</small></label>
      <label className="editor-label embedding-url-field">{t('embeddings.url')}<input className="text-input" type="url" value={draft.url} onChange={(event) => update('url', event.target.value)} placeholder={t('embeddings.urlPlaceholder')} /><small>{t('embeddings.urlHint')}</small></label>
      <label className="editor-label">{t('embeddings.apiKey')}<div className="secret-field"><input type={apiKeyVisible ? 'text' : 'password'} value={draft.apiKey} onChange={(event) => update('apiKey', event.target.value)} placeholder={draft.id ? t('embeddings.keepKeyPlaceholder') : isLocal ? t('embeddings.keyOptionalPlaceholder') : t('model.keyPlaceholder')} /><button type="button" onClick={() => setApiKeyVisible((value) => !value)} aria-label={apiKeyVisible ? t('model.hideKey') : t('model.showKey')} title={apiKeyVisible ? t('model.hideKey') : t('model.showKey')}>{apiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
    </div>
    {testResult && <div className={`embedding-test-result ${testState}`} role="status">{testState === 'success' ? <Check size={14} /> : null}{testState === 'success' ? t('embeddings.testSuccess', { dimensions: testResult.dimensions }) : testResult.error}</div>}
    <div className="editor-actions"><button type="button" className="outline-button" onClick={onCancel}>{t('model.cancel')}</button><button type="button" className="outline-button" onClick={onTest} disabled={testState === 'testing'}>{testState === 'testing' ? t('embeddings.testing') : t('embeddings.test')}</button><button type="button" className="save-key-button" onClick={onSave}><Check size={14} />{t('model.save')}</button></div>
  </section>
}
