import {
  Copy,
  Download,
  LoaderCircle,
  Mic,
  MicOff,
  Monitor,
  Play,
  Send,
  Sparkles,
  Square,
  Upload,
  X,
} from 'lucide-react'
import { RoleSelector } from './RolesPage.jsx'
import { formatElapsed } from '../app/shared.js'

export function TranscriptLine({ item, t, live = false }) {
  const speaker = item.speaker === 'You' ? t('transcript.you') : t('transcript.cosight')
  return <div className={`transcript-line ${live ? 'live-line' : ''}`}><time>{item.time}</time><strong className={item.speaker === 'You' ? 'you' : ''}>{speaker}</strong><span>{item.text}</span>{live && <span className="typing-cursor" />}</div>
}

export function ChatPage(props) {
  const {
    screenSharing, screenLoading, stopScreenShare, openSourcePicker, captureLockedDuringConnection, t,
    isConnected, connectionLabel, importLoading,
    roles, selectedRole, selectedRoleId, selectRole, openNewRole, isChatActive, stopChat, startChat,
    isStarting, startChatBlockedReason, setActiveNav, screenVideoRef, micMuted, toggleMicrophoneMute,
    deviceLabel, micActive, micLevel, exportSessionArtifact, importSessionContext, importedContext,
    setImportedContext, transcript, assistantDraft, elapsed, setTranscript, submitTextMessage,
    textInput, setTextInput, textSending,
  } = props

  return (
    <>
          <div className="workspace-header">
            <div><h1>{t('nav.chatSession')}</h1><div className="session-meta"><span className={`status-dot ${isConnected ? 'green' : ''}`} />{connectionLabel}<span className="meta-separator">•</span><span>{formatElapsed(elapsed)}</span></div></div>
            <div className="header-actions">
 <button className={`outline-button ${screenSharing && !screenLoading ? 'selected' : ''}`} onClick={screenSharing ? stopScreenShare : openSourcePicker} disabled={screenLoading || captureLockedDuringConnection} aria-label={screenLoading ? t('screen.loading') : captureLockedDuringConnection ? t('screen.shareDisabledDuringChat') : screenSharing ? t('screen.stopSharing') : t('screen.share')} title={screenLoading ? t('screen.loading') : captureLockedDuringConnection ? t('screen.shareDisabledDuringChat') : screenSharing ? t('screen.stopSharing') : t('screen.share')}>
   {screenLoading ? <LoaderCircle className="spin" size={16} /> : <Monitor size={16} />}
   {screenLoading ? t('screen.loading') : screenSharing ? <><span className="screen-share-default-label">{t('screen.sharing')}</span><span className="screen-share-hover-label">{t('screen.stopSharing')}</span></> : t('screen.share')}
 </button>
 <RoleSelector roles={roles} selectedRole={selectedRole} selectedRoleId={selectedRoleId} onSelect={selectRole} onAdd={() => openNewRole('chatSession')} disabled={isChatActive} t={t} />
 {isChatActive ? <button className="primary-button stop-button" onClick={stopChat}><Square size={15} fill="currentColor" /> {t('chat.stop')}</button> : <button className="primary-button" onClick={startChat} disabled={isStarting || screenLoading || Boolean(startChatBlockedReason)} aria-disabled={isStarting || screenLoading || Boolean(startChatBlockedReason)} title={screenLoading ? t('screen.loading') : startChatBlockedReason || undefined}><Play size={15} fill="currentColor" />{isStarting ? t('chat.starting') : t('chat.start')}</button>}
            </div>
          </div>
          {startChatBlockedReason && !isChatActive && <div className="chat-setup-notice" role="status"><Sparkles size={15} /><span>{startChatBlockedReason}</span><button type="button" className="text-link" onClick={() => setActiveNav('models')}>{t('nav.models')}</button></div>}

          <section className="screen-card">
            <div className="screen-card-header" aria-busy={screenLoading}><span>{screenLoading ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <Monitor size={15} aria-hidden="true" />} {screenLoading ? t('screen.loading') : screenSharing ? t('screen.sharedDesktop') : t('screen.noScreenSelected')}</span></div>
            <div className={`screen-stage ${screenSharing ? 'streaming' : ''}`}>
 <video ref={screenVideoRef} autoPlay muted playsInline className={screenSharing ? 'screen-video visible' : 'screen-video'} />
 {screenSharing && !screenLoading && <div className="screen-live-tag"><span className="status-dot green" />{t('screen.live')}</div>}
            </div>
            <div className="audio-strip">
 <button type="button" className={`mic-status-icon mic-toggle ${micMuted ? 'muted' : ''}`} onClick={toggleMicrophoneMute} aria-label={micMuted ? t('microphone.unmute') : t('microphone.mute')} aria-pressed={micMuted} title={micMuted ? t('microphone.unmute') : t('microphone.mute')}>{micMuted ? <MicOff size={19} /> : <Mic size={19} />}</button>
 <div className="audio-info"><span>{t('microphone.name')}</span><small>{deviceLabel}</small></div>
 <div className={`mic-level-meter ${micActive ? 'active' : ''}`} role="meter" aria-label={t('microphone.level')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(micLevel * 100)}><span style={{ width: `${Math.round(micLevel * 100)}%` }} /></div>
 <span className="mic-level-number">{micActive ? `${Math.round(micLevel * 100)}%` : '—'}</span>
            </div>
          </section>

          <section className="transcript-card">
            <div className="section-heading">
 <span>{t('transcript.title')}</span>
 <div className="transcript-actions">
   <button type="button" className="clear-button" onClick={exportSessionArtifact} title={t('transcript.export')}>
     <Download size={14} /> {t('transcript.export')}
   </button>
   <button type="button" className="clear-button" onClick={importSessionContext} disabled={isChatActive || importLoading} title={isChatActive ? t('notices.sessionImportLocked') : t('transcript.importContext')}>
     {importLoading ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}
     {importLoading ? t('transcript.importing') : t('transcript.importContext')}
   </button>
   <button type="button" className="clear-button" onClick={() => setTranscript([])} title={t('transcript.clear')}>
     <Copy size={14} /> {t('transcript.clear')}
   </button>
 </div>
            </div>
            {importedContext && <div className="imported-context-status" role="status">
 <Upload size={13} />
 <span>{importedContext.consumed ? t('transcript.contextUsed', { name: importedContext.fileName }) : t('transcript.contextLoaded', { name: importedContext.fileName })}</span>
 {!isChatActive && <button type="button" onClick={() => setImportedContext(null)} aria-label={t('transcript.removeContext')} title={t('transcript.removeContext')}><X size={13} /></button>}
            </div>}
            <div className="transcript-list">
 {transcript.map((item, index) => <TranscriptLine key={`${item.time}-${index}`} item={item} t={t} />)}
 {assistantDraft && <TranscriptLine item={{ time: formatElapsed(elapsed), speaker: 'Cosight', text: assistantDraft }} t={t} live />}
 {!transcript.length && !assistantDraft && <div className="empty-transcript">{t('transcript.empty')}</div>}
            </div>
            <form className="text-message-form" onSubmit={submitTextMessage}>
 <textarea
   className="text-message-input"
   value={textInput}
   onChange={(event) => setTextInput(event.target.value)}
   onKeyDown={(event) => {
     if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
       event.preventDefault()
       event.currentTarget.form?.requestSubmit()
     }
   }}
   placeholder={t('transcript.textInputPlaceholder')}
   aria-label={t('transcript.textInput')}
   maxLength={20000}
   rows={2}
   disabled={!isConnected || textSending}
 />
 <div className="text-message-footer">
   <span>{isConnected ? t('transcript.textInputHint') : t('transcript.textInputDisconnected')}</span>
   <button type="submit" className="primary-button text-message-submit" disabled={!isConnected || textSending || !textInput.trim()}>
     {textSending ? <LoaderCircle className="spin" size={14} /> : <Send size={14} />}
     {textSending ? t('transcript.textInputSending') : t('transcript.textInputSend')}
   </button>
 </div>
            </form>
          </section>
    </>
  )
}
