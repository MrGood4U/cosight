import { useEffect, useState } from 'react'
import {
  Check,
  ChevronDown,
  Eye,
  FileText,
  Languages,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  Volume2,
  X,
} from 'lucide-react'

import {
  DEFAULT_ROLE_ABILITY_IDS,
  ROLE_ABILITY_IDS,
  ROLE_ABILITY_LABEL_KEYS,
  ROLE_LANGUAGE_OPTIONS,
  ROLE_VOICE_OPTIONS,
} from '../app/shared.js'

export function RoleSelector({ roles, selectedRole, selectedRoleId, onSelect, onAdd, disabled, t }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const choose = (roleId) => {
    setOpen(false)
    onSelect(roleId)
  }
  return <div className="role-selector" ref={rootRef}>
    <button type="button" className="role-select-trigger" onClick={() => setOpen((value) => !value)} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} title={disabled ? t('roles.lockedDuringChat') : t('roles.select')}>
      <UserRound size={15} />
      <span>{selectedRole?.name || t('roles.default')}</span>
      <ChevronDown size={14} />
    </button>
    {open && !disabled && <div className="role-select-menu" role="listbox" aria-label={t('roles.select')}>
      <button type="button" className={`role-select-option ${!selectedRoleId ? 'selected' : ''}`} onClick={() => choose('')} role="option" aria-selected={!selectedRoleId}>
        <span><UserRound size={14} />{t('roles.default')}</span>{!selectedRoleId && <Check size={14} />}
      </button>
      {roles.map((role) => <button type="button" className={`role-select-option ${selectedRoleId === role.id ? 'selected' : ''}`} key={role.id} onClick={() => choose(role.id)} role="option" aria-selected={selectedRoleId === role.id}>
        <span><UserRound size={14} />{role.name}</span>{selectedRoleId === role.id && <Check size={14} />}
      </button>)}
      <div className="role-select-divider" />
      <button type="button" className="role-select-option role-select-add" onClick={() => { setOpen(false); onAdd() }}><span><Plus size={14} />{t('roles.add')}</span></button>
    </div>}
  </div>
}

export function RolesPage({ roles, selectedRoleId, roleEditorOpen, roleDraft, setRoleDraft, openNewRole, openEditRole, closeRoleEditor, previewRolePrompt, saveRole, selectRole, deleteRole, isChatActive, t, setNotice }) {
  const [roleSearch, setRoleSearch] = useState('')
  if (roleEditorOpen) return <RoleEditor draft={roleDraft} setDraft={setRoleDraft} onSave={saveRole} onCancel={closeRoleEditor} onPreview={previewRolePrompt} t={t} setNotice={setNotice} />
  const normalizedSearch = roleSearch.trim().toLocaleLowerCase()
  const defaultRole = { id: '', name: t('roles.default'), identity: t('roles.defaultIdentity'), language: 'auto', voice: '', abilities: DEFAULT_ROLE_ABILITY_IDS, isDefault: true }
  const visibleRoles = roles.filter((role) => String(role.name || '').toLocaleLowerCase().includes(normalizedSearch))
  const showDefaultRole = defaultRole.name.toLocaleLowerCase().includes(normalizedSearch)
  return <section className="roles-page" aria-labelledby="roles-title">
    <div className="roles-header">
      <div>
        <span className="page-kicker">{t('roles.kicker')}</span>
        <h1 id="roles-title">{t('roles.title')}</h1>
        <p>{t('roles.description')}</p>
      </div>
      <button className="primary-button" type="button" onClick={() => openNewRole('roles')} disabled={isChatActive}><Plus size={15} />{t('roles.add')}</button>
    </div>
    <label className="role-search-field">
      <Search size={16} />
      <input type="search" value={roleSearch} onChange={(event) => setRoleSearch(event.target.value)} placeholder={t('roles.searchPlaceholder')} aria-label={t('roles.searchLabel')} />
      {roleSearch && <button type="button" className="role-search-clear" onClick={() => setRoleSearch('')} aria-label={t('roles.clearSearch')}><X size={14} /></button>}
    </label>
    <div className="roles-list">
      {showDefaultRole && <RoleCard role={defaultRole} selected={!selectedRoleId} isChatActive={isChatActive} onSelect={selectRole} onEdit={openEditRole} onDelete={deleteRole} t={t} />}
      {visibleRoles.map((role) => <RoleCard key={role.id} role={role} selected={selectedRoleId === role.id} isChatActive={isChatActive} onSelect={selectRole} onEdit={openEditRole} onDelete={deleteRole} t={t} />)}
      {!showDefaultRole && visibleRoles.length === 0 && <div className="roles-empty">{t('roles.noSearchResults')}</div>}
    </div>
  </section>
}

export function RoleCard({ role, selected, isChatActive, onSelect, onEdit, onDelete, t }) {
  const language = ROLE_LANGUAGE_OPTIONS.find((item) => item.value === role.language)
  const voice = ROLE_VOICE_OPTIONS.find((item) => item.value === role.voice)
  const voiceLabel = voice?.label || role.voice || t('roles.voiceDefault')
  return <article className={`role-card ${selected ? 'selected' : ''}`}>
    <div className="role-card-header">
      <div className="role-card-title"><div className={`role-icon ${selected ? 'active' : ''}`}>{role.avatar ? <img src={role.avatar} alt="" /> : <UserRound size={19} />}</div><div><h2>{role.name}</h2><div className="role-title-meta">{selected && <span className="role-active-badge"><span className="status-dot green" />{t('roles.active')}</span>}{role.isBuiltin && <span className="role-builtin-badge">{t('roles.builtin')}</span>}</div></div></div>
      <div className="role-card-actions">
        <button type="button" className="text-link" onClick={() => onSelect(role.id)} disabled={isChatActive} title={isChatActive ? t('roles.lockedDuringChat') : t('roles.use')}><Check size={13} />{t('roles.use')}</button>
        {!role.isDefault && !role.isBuiltin && <><button type="button" className="text-link" onClick={() => onEdit(role)} disabled={isChatActive}><Pencil size={12} />{t('model.edit')}</button><button type="button" className="danger-link" onClick={() => onDelete(role)} disabled={isChatActive}><Trash2 size={12} />{t('model.delete')}</button></>}
      </div>
    </div>
    <p className="role-card-identity">{role.identity || t('roles.noIdentity')}</p>
    <div className="role-card-meta"><span className="role-chip">{language ? t(language.labelKey) : t('roles.languageAuto')}</span><span className="role-chip">{voiceLabel}</span>{(role.abilities || []).map((ability) => <span className="role-chip" key={ability}>{t(ROLE_ABILITY_LABEL_KEYS[ability])}</span>)}</div>
  </article>
}

export function RoleEditor({ draft, setDraft, onSave, onCancel, onPreview, t, setNotice }) {
  const roleListeningEnabled = draft.abilities.includes('listening')
  const roleSpeakingEnabled = draft.abilities.includes('speaking')
  const initiativeDependenciesMet = roleListeningEnabled && roleSpeakingEnabled
  useEffect(() => {
    if (initiativeDependenciesMet || !draft.abilities.includes('initiative')) return
    setDraft((current) => ({
      ...current,
      abilities: current.abilities.filter((ability) => ability !== 'initiative'),
      initiativeTimeoutSec: '',
      initiativePrompt: '',
    }))
  }, [initiativeDependenciesMet, draft.abilities, setDraft])
  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const toggleAbility = (ability) => setDraft((current) => {
    const enabled = current.abilities.includes(ability)
    if (ability === 'initiative' && !enabled && !initiativeDependenciesMet) return current
    let abilities = enabled ? current.abilities.filter((item) => item !== ability) : [...current.abilities, ability]
    if (enabled && (ability === 'listening' || ability === 'speaking')) abilities = abilities.filter((item) => item !== 'initiative')
    if (ability === 'drawing') return { ...current, abilities, drawingPolicy: enabled ? '' : current.drawingPolicy }
    if (ability === 'screenVision') return { ...current, abilities, screenVisionIntervalSec: enabled ? '' : (current.screenVisionIntervalSec || '5'), screenVisionChangeThreshold: enabled ? '' : (current.screenVisionChangeThreshold || '8') }
    if (ability !== 'initiative') return { ...current, abilities }
    return {
      ...current,
      abilities,
      initiativeTimeoutSec: enabled ? '' : (current.initiativeTimeoutSec || '10'),
      initiativePrompt: enabled ? '' : current.initiativePrompt,
    }
  })
  const removeFile = (fileId) => setDraft((current) => ({ ...current, knowledgeFiles: current.knowledgeFiles.filter((file) => file.id !== fileId) }))
  const pickFiles = async () => {
    const result = await window.cosight?.pickRoleKnowledgeFiles?.()
    if (!result?.ok) return
    setDraft((current) => ({ ...current, knowledgeFiles: [...current.knowledgeFiles, ...(result.files || []).filter((file) => !current.knowledgeFiles.some((item) => item.id === file.id))] }))
  }
  const pickAvatar = async () => {
    const result = await window.cosight?.pickRoleAvatar?.()
    if (!result?.ok) {
      setNotice(result?.error || t('notices.roleAvatarPickFailed'))
      return
    }
    if (!result.avatar) return
    setDraft((current) => ({ ...current, avatar: result.avatar, avatarName: result.name || '', avatarRemoved: false }))
  }
  const removeAvatar = () => setDraft((current) => ({ ...current, avatar: '', avatarName: '', avatarRemoved: true }))
  return <section className="roles-page role-editor-page" aria-labelledby="role-editor-title">
    <div className="role-editor-header"><div><button type="button" className="back-link" onClick={onCancel}><ChevronDown size={15} className="back-icon" />{t('roles.back')}</button><span className="page-kicker">{t('roles.kicker')}</span><h1 id="role-editor-title">{draft.id ? t('roles.editTitle') : t('roles.addTitle')}</h1><p>{t('roles.editorDescription')}</p></div></div>
    <div className="role-editor-form">
      <div className="role-identity-row">
        <div className="role-avatar-editor"><div className="role-avatar-preview">{draft.avatar ? <img src={draft.avatar} alt={draft.avatarName || t('roles.avatar')} /> : <UserRound size={28} />}</div><div className="role-avatar-copy"><span>{t('roles.avatar')}</span><small>{draft.avatarName || t('roles.avatarHint')}</small><div className="role-avatar-actions"><button type="button" className="outline-button" onClick={pickAvatar}><Plus size={14} />{draft.avatar ? t('roles.changeAvatar') : t('roles.addAvatar')}</button>{draft.avatar && <button type="button" className="danger-link" onClick={removeAvatar}><X size={13} />{t('roles.removeAvatar')}</button>}</div></div></div>
        <label className="role-field role-field-short"><span>{t('roles.name')}</span><input className="text-input" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder={t('roles.namePlaceholder')} maxLength={80} /></label>
      </div>
      <div className="role-editor-grid">
        <RoleTextarea label={t('roles.identity')} value={draft.identity} onChange={(value) => updateDraft('identity', value)} placeholder={t('roles.identityPlaceholder')} />
        <RoleTextarea label={t('roles.goal')} value={draft.goal} onChange={(value) => updateDraft('goal', value)} placeholder={t('roles.goalPlaceholder')} />
        <RoleTextarea label={t('roles.corePrinciples')} value={draft.corePrinciples} onChange={(value) => updateDraft('corePrinciples', value)} placeholder={t('roles.corePrinciplesPlaceholder')} />
        <RoleTextarea label={t('roles.behavior')} value={draft.behavior} onChange={(value) => updateDraft('behavior', value)} placeholder={t('roles.behaviorPlaceholder')} />
        <RoleTextarea label={t('roles.workflow')} value={draft.workflow} onChange={(value) => updateDraft('workflow', value)} placeholder={t('roles.workflowPlaceholder')} />
        <RoleTextarea label={t('roles.constraints')} value={draft.constraints} onChange={(value) => updateDraft('constraints', value)} placeholder={t('roles.constraintsPlaceholder')} full />
      </div>
      <div className="role-editor-grid role-choice-grid">
        <div className="role-field"><span>{t('roles.language')}</span><label className="select-field"><Languages size={15} /><select value={draft.language} onChange={(event) => updateDraft('language', event.target.value)} aria-label={t('roles.language')}>{ROLE_LANGUAGE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{t(option.labelKey)}</option>)}</select><span className="select-value">{t(ROLE_LANGUAGE_OPTIONS.find((option) => option.value === draft.language)?.labelKey || 'roles.languageAuto')}</span><ChevronDown size={14} /></label></div>
        <div className="role-field"><span>{t('roles.voice')}</span><label className="select-field"><Volume2 size={15} /><select value={draft.voice} onChange={(event) => updateDraft('voice', event.target.value)} aria-label={t('roles.voice')}>{draft.voice && !ROLE_VOICE_OPTIONS.some((option) => option.value === draft.voice) && <option value={draft.voice}>{draft.voice}</option>}{ROLE_VOICE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.labelKey ? t(option.labelKey) : option.label}</option>)}</select><span className="select-value">{ROLE_VOICE_OPTIONS.find((option) => option.value === draft.voice)?.label || draft.voice || t('roles.voiceDefault')}</span><ChevronDown size={14} /></label></div>
      </div>
      <label className="role-field role-field-full"><span>{t('roles.speechStyle')}</span><small>{t('roles.speechStyleHint')}</small><textarea className="role-textarea" value={draft.speechStyle} onChange={(event) => updateDraft('speechStyle', event.target.value)} placeholder={t('roles.speechStylePlaceholder')} maxLength={4000} /></label>
      <div className="role-field"><span>{t('roles.abilities')}</span><small>{t('roles.abilitiesHint')}</small><div className="role-ability-grid">{ROLE_ABILITY_IDS.map((ability) => { const selected = draft.abilities.includes(ability); const initiativeBlocked = ability === 'initiative' && !selected && !initiativeDependenciesMet; return <label className={`role-ability-option ${selected ? 'selected' : ''} ${initiativeBlocked ? 'disabled' : ''}`} key={ability} title={initiativeBlocked ? t('roles.initiativeRequiresListeningSpeaking') : undefined}><input type="checkbox" checked={selected} disabled={initiativeBlocked} onChange={() => toggleAbility(ability)} /><span>{t(ROLE_ABILITY_LABEL_KEYS[ability])}</span><Check size={14} /></label> })}</div></div>
      {draft.abilities.includes('screenVision') && <div className="initiative-fields screen-vision-fields"><label className="role-field"><span>{t('roles.screenVisionInterval')}</span><div className="initiative-number-field"><input className="text-input" type="text" inputMode="numeric" pattern="[0-9]*" value={draft.screenVisionIntervalSec} onChange={(event) => updateDraft('screenVisionIntervalSec', event.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={() => { const value = Number.parseInt(draft.screenVisionIntervalSec || '5', 10); updateDraft('screenVisionIntervalSec', String(Math.min(60, Math.max(1, Number.isFinite(value) ? value : 5)))) }} aria-describedby="screen-vision-interval-hint" /><span>s</span></div><small id="screen-vision-interval-hint">{t('roles.screenVisionIntervalHint')}</small></label><label className="role-field"><span>{t('roles.screenVisionChangeThreshold')}</span><div className="initiative-number-field"><input className="text-input" type="text" inputMode="numeric" pattern="[0-9]*" value={draft.screenVisionChangeThreshold} onChange={(event) => updateDraft('screenVisionChangeThreshold', event.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={() => { const value = Number.parseInt(draft.screenVisionChangeThreshold || '8', 10); updateDraft('screenVisionChangeThreshold', String(Math.min(100, Math.max(1, Number.isFinite(value) ? value : 8)))) }} aria-describedby="screen-vision-threshold-hint" /><span>%</span></div><small id="screen-vision-threshold-hint">{t('roles.screenVisionChangeThresholdHint')}</small></label></div>}
      {draft.abilities.includes('drawing') && <label className="role-field ability-policy-field"><span>{t('roles.drawingPolicy')}</span><small>{t('roles.drawingPolicyHint')}</small><textarea className="role-textarea" value={draft.drawingPolicy} onChange={(event) => updateDraft('drawingPolicy', event.target.value)} placeholder={t('roles.drawingPolicyPlaceholder')} maxLength={20000} /></label>}
      {draft.abilities.includes('initiative') && initiativeDependenciesMet && <div className="initiative-fields"><label className="role-field"><span>{t('roles.initiativeTimeout')}</span><div className="initiative-number-field"><input className="text-input" type="text" inputMode="numeric" pattern="[0-9]*" value={draft.initiativeTimeoutSec} onChange={(event) => updateDraft('initiativeTimeoutSec', event.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={() => { const value = Number.parseInt(draft.initiativeTimeoutSec || '10', 10); updateDraft('initiativeTimeoutSec', String(Math.min(300, Math.max(5, Number.isFinite(value) ? value : 10)))) }} aria-describedby="initiative-timeout-hint" /><span>s</span></div><small id="initiative-timeout-hint">{t('roles.initiativeTimeoutHint')}</small></label><label className="role-field"><span>{t('roles.initiativePrompt')}</span><textarea className="role-textarea initiative-prompt-textarea" value={draft.initiativePrompt} onChange={(event) => updateDraft('initiativePrompt', event.target.value)} placeholder={t('roles.initiativePromptPlaceholder')} maxLength={20000} /><small>{t('roles.initiativePromptHint')}</small></label></div>}
      <div className="role-field knowledge-field"><span>{t('roles.knowledge')}</span><small>{t('roles.knowledgeHint')}</small><textarea className="role-textarea knowledge-textarea" value={draft.knowledgeText} onChange={(event) => updateDraft('knowledgeText', event.target.value)} placeholder={t('roles.knowledgePlaceholder')} maxLength={60000} />
        <div className="knowledge-file-toolbar"><button type="button" className="outline-button" onClick={pickFiles}><Plus size={14} />{t('roles.addKnowledgeFiles')}</button><small>{t('roles.knowledgeFileHint')}</small></div>
        {draft.knowledgeFiles.length > 0 && <div className="knowledge-files">{draft.knowledgeFiles.map((file) => <div className="knowledge-file" key={file.id}><FileText size={14} /><span>{file.name}</span><small>{file.size ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : t('roles.fileStored')}</small><button type="button" onClick={() => removeFile(file.id)} aria-label={t('roles.removeKnowledgeFile', { name: file.name })} title={t('roles.removeKnowledgeFile', { name: file.name })}><X size={13} /></button></div>)}</div>}
      </div>
      <div className="role-editor-actions"><button type="button" className="outline-button" onClick={() => onPreview(draft)}><Eye size={14} />{t('roles.preview')}</button><span className="role-editor-actions-spacer" /><button type="button" className="outline-button" onClick={onCancel}>{t('model.cancel')}</button><button type="button" className="save-key-button" onClick={onSave}><Check size={14} />{t('roles.save')}</button></div>
    </div>
  </section>
}

export function PromptPreview({ prompt, loading, onClose, t }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="prompt-preview-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-preview-title">
      <div className="modal-header">
        <div><span className="modal-kicker">{t('roles.previewKicker')}</span><h2 id="prompt-preview-title">{t('roles.previewTitle')}</h2><p className="prompt-preview-description">{t('roles.previewDescription')}</p></div>
        <button type="button" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}><X size={18} /></button>
      </div>
      {loading ? <div className="prompt-preview-loading"><LoaderCircle className="spin" size={18} />{t('roles.previewLoading')}</div> : <pre className="prompt-preview-content">{prompt}</pre>}
      <div className="prompt-preview-footer"><small>{t('roles.previewNote')}</small><button type="button" className="outline-button" onClick={onClose}>{t('common.close')}</button></div>
    </section>
  </div>
}

export function RoleTextarea({ label, value, onChange, placeholder, full = false }) {
  return <label className={`role-field ${full ? 'role-field-full' : ''}`}><span>{label}</span><textarea className="role-textarea" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={20000} /></label>
}
