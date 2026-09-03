import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createTranslator, getInitialLanguage } from '../i18n.js'
import {
  DEFAULT_REALTIME_URL,
  DEFAULT_HARNESS_HTTP_URL,
  HARNESS_MODULES,
  DEFAULT_HARNESS_SETTINGS,
  SEE_BBOX_DEBUG_ENABLED,
  SEE_BBOX_DEBUG_STORAGE_KEY,
  DEFAULT_SEE_MAX_OBJECTS,
  SEE_MAX_OBJECTS_STORAGE_KEY,
  normalizeSeeMaxObjects,
  DEFAULT_OUTPUT_VOLUME,
  OUTPUT_VOLUME_STORAGE_KEY,
  DEFAULT_TURN_DETECTION_SILENCE_DURATION_MS,
  TURN_DETECTION_SILENCE_DURATION_STORAGE_KEY,
  normalizeTurnDetectionSilenceDuration,
  DEFAULT_AUDIO_INPUT_MODE,
  AUDIO_INPUT_MODE_STORAGE_KEY,
  normalizeAudioInputMode,
  ROLE_ABILITY_IDS,
  DEFAULT_ROLE_ABILITY_IDS,
  DEFAULT_SCREEN_VISION_INTERVAL_SECONDS,
  DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD,
  NEW_ROLE_DEFAULT_ABILITY_IDS,
  ROLE_ABILITY_LABEL_KEYS,
  USAGE_CHART_COLORS,
  USAGE_PRESETS,
  USAGE_GRANULARITIES,
  MAX_USAGE_BUCKETS,
  ROLE_VOICE_OPTIONS,
  navItems,
  usageDateTimeInputValue,
  makeUsageRange,
  parseUsageDate,
  usageFilterTimestamp,
  usageGranularity,
  usageBucketDate,
  usageBucketCount,
  usageBucketKey,
  formatUsageNumber,
  formatUsageCompact,
  usageBucketLabel,
  usageRangeLabel,
  buildUsageChart,
  emptyRoleDraft,
  emptyEmbeddingModelDraft,
  toBase64,
  formatElapsed,
  clampNumber,
  isHexColor,
  transcriptText,
  hasVisibleTranscriptText,
  SESSION_ARTIFACT_FORMAT,
  SESSION_ARTIFACT_VERSION,
  MAX_SESSION_MESSAGES,
  MAX_SESSION_EVENTS,
  makeSessionId,
  cloneSessionValue,
  sessionRoleSnapshot,
  normalizeImportedSessionArtifact,
  emptyConversationSummary,
  normalizeConversationSummary,
  normalizeDrawingStroke,
  sourceCaptureKind,
  normalizeSeeDebugBoxes,
  normalizeSourceRect,
  drawStrokesOnCapturedFrame,
} from '../app/shared.js'

export function useCosightSession() {
const [activeNav, setActiveNav] = useState('chatSession')
const [language, setLanguage] = useState(getInitialLanguage)
const [models, setModels] = useState([])
const [selectedModelId, setSelectedModelId] = useState('')
const [modelMode, setModelMode] = useState('legacy')
const [harnessModels, setHarnessModels] = useState({ brain: null, listen: null, speak: null, see: null })
const [harnessSettings, setHarnessSettings] = useState(DEFAULT_HARNESS_SETTINGS)
const [harnessEditorModule, setHarnessEditorModule] = useState('')
const [harnessModelDraft, setHarnessModelDraft] = useState(null)
const [harnessApiKeyVisible, setHarnessApiKeyVisible] = useState(false)
const [harnessTestState, setHarnessTestState] = useState('idle')
const [harnessTestResult, setHarnessTestResult] = useState(null)
const [embeddingModels, setEmbeddingModels] = useState([])
const [embeddingEditorOpen, setEmbeddingEditorOpen] = useState(false)
const [embeddingModelDraft, setEmbeddingModelDraft] = useState(emptyEmbeddingModelDraft())
const [embeddingApiKeyVisible, setEmbeddingApiKeyVisible] = useState(false)
const [embeddingTestState, setEmbeddingTestState] = useState('idle')
const [embeddingTestResult, setEmbeddingTestResult] = useState(null)
const [modelEditorOpen, setModelEditorOpen] = useState(false)
const [modelDraft, setModelDraft] = useState({ id: '', alias: '', name: '', url: DEFAULT_REALTIME_URL, apiKey: '' })
const [modelApiKeyVisible, setModelApiKeyVisible] = useState(false)
const [modelTestState, setModelTestState] = useState('idle')
const [modelTestResult, setModelTestResult] = useState(null)
const [roles, setRoles] = useState([])
const [selectedRoleId, setSelectedRoleId] = useState('')
const [roleEditorOpen, setRoleEditorOpen] = useState(false)
const [roleDraft, setRoleDraft] = useState(emptyRoleDraft)
const [roleEditorReturnNav, setRoleEditorReturnNav] = useState('roles')
const [rolePromptPreviewOpen, setRolePromptPreviewOpen] = useState(false)
const [rolePromptPreviewLoading, setRolePromptPreviewLoading] = useState(false)
const [rolePromptPreview, setRolePromptPreview] = useState('')
const [micDevices, setMicDevices] = useState([])
const [outputDevices, setOutputDevices] = useState([])
const [selectedMic, setSelectedMic] = useState('')
const [audioInputMode, setAudioInputMode] = useState(() => {
  try {
    return normalizeAudioInputMode(window.localStorage.getItem(AUDIO_INPUT_MODE_STORAGE_KEY))
  } catch {
    return DEFAULT_AUDIO_INPUT_MODE
  }
})
const [selectedOutput, setSelectedOutput] = useState('')
const [outputVolume, setOutputVolume] = useState(() => {
  try {
    const value = Number(window.localStorage.getItem(OUTPUT_VOLUME_STORAGE_KEY))
    return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : DEFAULT_OUTPUT_VOLUME
  } catch {
    return DEFAULT_OUTPUT_VOLUME
  }
})
const [connection, setConnection] = useState('Disconnected')
const [screenSharing, setScreenSharing] = useState(false)
const [screenCaptureKind, setScreenCaptureKind] = useState('unknown')
const [screenLoading, setScreenLoading] = useState(false)
const [micActive, setMicActive] = useState(false)
const [micMuted, setMicMuted] = useState(false)
const [micLevel, setMicLevel] = useState(0)
const [autoReconnect, setAutoReconnect] = useState(true)
const [pushToTalk, setPushToTalk] = useState(false)
const [allowInterruptions, setAllowInterruptions] = useState(() => {
  try {
    return window.localStorage.getItem('cosight.allowInterruptions') === 'true'
  } catch {
    return false
  }
})
const [liveTranscript, setLiveTranscript] = useState(true)
const [coreSubtitlesEnabled, setCoreSubtitlesEnabled] = useState(() => {
  try {
    return window.localStorage.getItem('cosight.coreSubtitlesEnabled') !== 'false'
  } catch {
    return true
  }
})
const [seeBboxDebugEnabled, setSeeBboxDebugEnabled] = useState(() => {
  try {
    const stored = window.localStorage.getItem(SEE_BBOX_DEBUG_STORAGE_KEY)
    return stored === null ? SEE_BBOX_DEBUG_ENABLED : stored === 'true'
  } catch {
    return SEE_BBOX_DEBUG_ENABLED
  }
})
const [seeMaxObjects, setSeeMaxObjectsState] = useState(() => {
  try {
    return normalizeSeeMaxObjects(window.localStorage.getItem(SEE_MAX_OBJECTS_STORAGE_KEY))
  } catch {
    return DEFAULT_SEE_MAX_OBJECTS
  }
})
const setSeeMaxObjects = useCallback((value) => {
  setSeeMaxObjectsState(normalizeSeeMaxObjects(value))
}, [])
const [turnDetectionSilenceDurationMs, setTurnDetectionSilenceDurationMsState] = useState(() => {
  try {
    return normalizeTurnDetectionSilenceDuration(window.localStorage.getItem(TURN_DETECTION_SILENCE_DURATION_STORAGE_KEY))
  } catch {
    return DEFAULT_TURN_DETECTION_SILENCE_DURATION_MS
  }
})
const setTurnDetectionSilenceDurationMs = useCallback((value) => {
  setTurnDetectionSilenceDurationMsState(normalizeTurnDetectionSilenceDuration(value))
}, [])
const [elapsed, setElapsed] = useState(0)
const [transcript, setTranscript] = useState([])
const [textInput, setTextInput] = useState('')
const [textSending, setTextSending] = useState(false)
const [importedContext, setImportedContext] = useState(null)
const [conversationSummary, setConversationSummary] = useState(emptyConversationSummary)
const [importLoading, setImportLoading] = useState(false)
const [notice, setNotice] = useState('')
const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
const [sources, setSources] = useState([])
const [sourcesLoading, setSourcesLoading] = useState(false)
const [assistantDraft, setAssistantDraft] = useState('')
const [isStarting, setIsStarting] = useState(false)
const screenStreamRef = useRef(null)
const micStreamRef = useRef(null)
const screenVideoRef = useRef(null)
const screenCanvasRef = useRef(null)
const drawingCanvasRef = useRef(null)
const drawingStrokesRef = useRef([])
const pendingDrawingFocusRef = useRef(null)
const frameTimerRef = useRef(null)
const screenFrameCapturePromiseRef = useRef(null)
const audioContextRef = useRef(null)
const audioWorkletRef = useRef(null)
const micAnalyserRef = useRef(null)
const micMeterFrameRef = useRef(null)
const audioPlaybackRef = useRef(null)
const outputVolumeRef = useRef(outputVolume)
const assistantAudioUntilRef = useRef(0)
const elapsedTimerRef = useRef(null)
const assistantDraftRef = useRef('')
const assistantTurnTextRef = useRef('')
const assistantTurnFlushTimerRef = useRef(null)
const assistantToolResponseRef = useRef(false)
const sessionEventsRef = useRef([])
const currentSessionIdRef = useRef(makeSessionId())
const writingCaptionRef = useRef(null)
const coreCaptionRef = useRef(null)
const writingCaptionTimerRef = useRef(null)
const coreCaptionTimerRef = useRef(null)
const coreSubtitlesRef = useRef(coreSubtitlesEnabled)
const seeBboxDebugEnabledRef = useRef(seeBboxDebugEnabled)
const connectionRef = useRef(connection)
const audioInputModeRef = useRef(audioInputMode)
const lastBridgeErrorRef = useRef('')
const screenSharingRef = useRef(screenSharing)
const screenVisionRef = useRef(false)
const listeningRef = useRef(false)
const speakingRef = useRef(false)
const allowInterruptionsRef = useRef(allowInterruptions)
const transparentCanvasRef = useRef(false)
const writingRef = useRef(false)
const audioFrameSentRef = useRef(false)
const screenSourceRef = useRef(null)
const initiativeSilenceTimerRef = useRef(null)
const lastInitiativeActivityRef = useRef(Date.now())
const initiativeResponsePendingRef = useRef(false)
const modelTestRequestRef = useRef(0)
const modelTestAbortRef = useRef(null)
const modelTestDraftSignatureRef = useRef(null)
const modelTestLatestDraftSignatureRef = useRef('')
const modelTestActiveRequestIdRef = useRef('')
const harnessTestRequestRef = useRef(0)
const harnessTestAbortRef = useRef(null)
const harnessTestDraftSignatureRef = useRef(null)
const harnessTestLatestDraftSignatureRef = useRef('')
const harnessTestActiveRequestIdRef = useRef('')
modelTestLatestDraftSignatureRef.current = JSON.stringify(modelDraft)
harnessTestLatestDraftSignatureRef.current = JSON.stringify(harnessModelDraft)

function cancelRendererModelTest(activeRequestIdRef) {
  const requestId = activeRequestIdRef.current
  activeRequestIdRef.current = ''
  if (!requestId) return
  try {
    window.cosight?.cancelModelTest?.(requestId)
  } catch {
    // Renderer cleanup must still invalidate the local result if IPC is unavailable.
  }
}

useEffect(() => {
  const signature = JSON.stringify(modelDraft)
  if (modelTestDraftSignatureRef.current !== null && modelTestDraftSignatureRef.current !== signature) {
    modelTestRequestRef.current += 1
    modelTestAbortRef.current?.abort()
    modelTestAbortRef.current = null
    cancelRendererModelTest(modelTestActiveRequestIdRef)
    setModelTestState('idle')
    setModelTestResult(null)
  }
  modelTestDraftSignatureRef.current = signature
}, [modelDraft])

useEffect(() => {
  const signature = JSON.stringify(harnessModelDraft)
  if (harnessTestDraftSignatureRef.current !== null && harnessTestDraftSignatureRef.current !== signature) {
    harnessTestRequestRef.current += 1
    harnessTestAbortRef.current?.abort()
    harnessTestAbortRef.current = null
    cancelRendererModelTest(harnessTestActiveRequestIdRef)
    setHarnessTestState('idle')
    setHarnessTestResult(null)
  }
  harnessTestDraftSignatureRef.current = signature
}, [harnessModelDraft])

const selectedModel = useMemo(() => models.find((model) => model.id === selectedModelId) || null, [models, selectedModelId])
const selectedRole = useMemo(() => roles.find((role) => role.id === selectedRoleId) || null, [roles, selectedRoleId])
const selectedRoleAbilities = useMemo(() => new Set(selectedRole?.abilities || DEFAULT_ROLE_ABILITY_IDS), [selectedRole])
const screenVisionEnabled = selectedRoleAbilities.has('screenVision')
const listeningEnabled = selectedRoleAbilities.has('listening')
const speakingEnabled = selectedRoleAbilities.has('speaking')
const useTransparentCanvas = selectedRoleAbilities.has('drawing')
// Drawing is the single visual output capability. It covers both
// geometric annotations and short on-screen text.
const useWritingAbility = useTransparentCanvas
const initiativeEnabled = selectedRoleAbilities.has('initiative')
const initiativeActive = initiativeEnabled && listeningEnabled && speakingEnabled
const t = useMemo(() => createTranslator(language), [language])
const harnessReady = HARNESS_MODULES.every((module) => Boolean(harnessModels[module]?.hasApiKey))
const modelReady = modelMode === 'harness' ? harnessReady : Boolean(selectedModel?.hasApiKey)

function recordSessionEvent(type, payload = {}) {
  const event = {
    id: makeSessionId('event'),
    time: formatElapsed(elapsed),
    timestamp: new Date().toISOString(),
    type,
    payload: cloneSessionValue(payload),
  }
  sessionEventsRef.current = [...sessionEventsRef.current, event].slice(-MAX_SESSION_EVENTS)
}

function buildSessionArtifact() {
  const role = selectedRole || {
    id: '',
    name: t('roles.default'),
    identity: t('roles.defaultIdentity'),
    corePrinciples: '',
    listeningLanguage: 'auto',
    outputLanguage: 'auto',
    voice: '',
    abilities: DEFAULT_ROLE_ABILITY_IDS,
  }
  const messages = transcript
    .filter((item) => hasVisibleTranscriptText(item?.text))
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : makeSessionId('message'),
      time: typeof item.time === 'string' ? item.time : '00:00',
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : '',
      speaker: item.speaker === 'You' ? 'You' : 'Cosight',
      text: transcriptText(item.text).trim(),
      final: item.final !== false,
      sessionId: item.sessionId || currentSessionIdRef.current,
    }))
    .slice(-MAX_SESSION_MESSAGES)
  return {
    format: SESSION_ARTIFACT_FORMAT,
    version: SESSION_ARTIFACT_VERSION,
    exportedAt: new Date().toISOString(),
    session: {
      id: currentSessionIdRef.current,
      active: connectionRef.current === 'Connecting' || connectionRef.current === 'Connected',
      elapsedSeconds: elapsed,
    },
    role: sessionRoleSnapshot(role),
    model: {
      id: selectedModel?.id || '',
      alias: selectedModel?.alias || '',
      name: selectedModel?.name || '',
      url: selectedModel?.url || '',
    },
    capabilities: {
      screenVision: screenVisionEnabled,
      listening: listeningEnabled,
      speaking: speakingEnabled,
      drawing: useTransparentCanvas,
      writing: useWritingAbility,
      subtitles: coreSubtitlesEnabled,
      initiative: initiativeActive,
      captureKind: screenSharing ? screenCaptureKind : 'none',
    },
    messages,
    conversationSummary: normalizeConversationSummary(conversationSummary),
    // Only structured capability metadata is exported. No screenshots,
    // audio, video, data URLs, or other media payloads are stored here.
    capabilityCalls: sessionEventsRef.current.map((event) => cloneSessionValue(event, 12000)).slice(-MAX_SESSION_EVENTS),
  }
}

async function exportSessionArtifact() {
  try {
    const result = await window.cosight?.exportSession?.(buildSessionArtifact())
    if (result?.ok) setNotice(t('notices.sessionExported'))
    else if (!result?.canceled) setNotice(result?.error || t('notices.sessionExportFailed'))
  } catch (error) {
    setNotice(t('notices.sessionExportFailedWithMessage', { message: error.message }))
  }
}

async function importSessionContext() {
  if (connectionRef.current === 'Connecting' || connectionRef.current === 'Connected') {
    setNotice(t('notices.sessionImportLocked'))
    return
  }
  setImportLoading(true)
  try {
    const result = await window.cosight?.importSession?.()
    if (!result?.ok) {
      if (!result?.canceled) setNotice(result?.error || t('notices.sessionImportFailed'))
      return
    }
    const artifact = normalizeImportedSessionArtifact(result.artifact)
    setConversationSummary(normalizeConversationSummary(artifact.conversationSummary))
    setImportedContext({
      fileName: result.fileName || 'session.json',
      artifact,
      consumed: false,
    })
    recordSessionEvent('context.imported', {
      fileName: result.fileName || 'session.json',
      messageCount: artifact.messages.length,
      capabilityEventCount: artifact.capabilityCalls.length,
      conversationSummary: Boolean(artifact.conversationSummary?.topic || artifact.conversationSummary?.lastIntent),
    })
    setNotice(t('notices.sessionContextImported', { count: artifact.messages.length }))
  } catch (error) {
    setNotice(error.message || t('notices.sessionImportFailed'))
  } finally {
    setImportLoading(false)
  }
}

const deviceLabel = useMemo(() => {
  if (audioInputMode === 'system') return t('microphone.systemSound')
  const active = micDevices.find((device) => device.deviceId === selectedMic)
  return active?.label || t('microphone.default')
}, [audioInputMode, micDevices, selectedMic, t])

const loadDevices = useCallback(async () => {
  if (!navigator.mediaDevices?.enumerateDevices) return
  const devices = await navigator.mediaDevices.enumerateDevices()
  setMicDevices(devices.filter((device) => device.kind === 'audioinput'))
  setOutputDevices(devices.filter((device) => device.kind === 'audiooutput'))
}, [])

useEffect(() => {
  let unsubscribe = () => {}
  window.cosight?.getSettings?.().then((settings) => {
    const loadedModels = settings?.models || []
    setModels(loadedModels)
    setSelectedModelId(settings?.selectedModelId || loadedModels[0]?.id || '')
    setModelMode(settings?.modelMode === 'harness' ? 'harness' : 'legacy')
    setHarnessModels({ brain: null, listen: null, speak: null, see: null, ...(settings?.harnessModels || {}) })
    setHarnessSettings({ ...DEFAULT_HARNESS_SETTINGS, ...(settings?.harnessSettings || {}) })
    setEmbeddingModels(settings?.embeddingModels || [])
    setRoles(settings?.roles || [])
    setSelectedRoleId(settings?.selectedRoleId || '')
  })
  navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices)
  loadDevices().catch(() => {}).finally(() => {
    startAudioInput().catch((error) => {
      stopMicrophone()
      void window.cosight?.stopSystemAudioCapture?.()
      if (!['NotAllowedError', 'PermissionDeniedError'].includes(error.name)) {
        setNotice(t('notices.audioInputStartFailed', { message: error.message }))
      }
    })
  })
  if (window.cosight?.onQwenEvent) unsubscribe = window.cosight.onQwenEvent(handleQwenEvent)
  const unsubscribeKnowledge = window.cosight?.onKnowledgeStatus?.((payload) => {
    if (!payload?.roleId) return
    if (!payload.staged) setRoles((current) => current.map((role) => role.id === payload.roleId ? { ...role, knowledgeStatus: payload } : role))
    setRoleDraft((current) => current.id === payload.roleId
      ? { ...current, knowledgeStatus: payload, knowledgeBuildId: payload.knowledgeBuildId || current.knowledgeBuildId || '' }
      : current)
  }) || (() => {})
  return () => {
    unsubscribe()
    unsubscribeKnowledge()
    navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices)
    modelTestRequestRef.current += 1
    modelTestAbortRef.current?.abort()
    modelTestAbortRef.current = null
    cancelRendererModelTest(modelTestActiveRequestIdRef)
    harnessTestRequestRef.current += 1
    harnessTestAbortRef.current?.abort()
    harnessTestAbortRef.current = null
    cancelRendererModelTest(harnessTestActiveRequestIdRef)
    stopAllCapture()
  }
}, [loadDevices])

useEffect(() => {
  connectionRef.current = connection
}, [connection])

useEffect(() => {
  screenSharingRef.current = screenSharing
}, [screenSharing])

useEffect(() => {
  screenVisionRef.current = screenVisionEnabled
  listeningRef.current = listeningEnabled
  audioInputModeRef.current = audioInputMode
  window.cosight?.setSystemAudioListeningEnabled?.(listeningEnabled)
  speakingRef.current = speakingEnabled
  allowInterruptionsRef.current = allowInterruptions
  transparentCanvasRef.current = useTransparentCanvas
  writingRef.current = useWritingAbility
  coreSubtitlesRef.current = coreSubtitlesEnabled
}, [screenVisionEnabled, listeningEnabled, audioInputMode, speakingEnabled, allowInterruptions, useTransparentCanvas, useWritingAbility, coreSubtitlesEnabled])

useEffect(() => {
  if (!connection.includes('Connected')) return undefined
  elapsedTimerRef.current = window.setInterval(() => setElapsed((value) => value + 1), 1000)
  return () => window.clearInterval(elapsedTimerRef.current)
}, [connection])

useEffect(() => {
  if (!notice) return undefined
  const timer = window.setTimeout(() => setNotice(''), 4200)
  return () => window.clearTimeout(timer)
}, [notice])

useEffect(() => {
  try {
    window.localStorage.setItem('cosight.uiLanguage', language)
  } catch {
    // Local persistence is optional in the desktop shell.
  }
}, [language])

useEffect(() => {
  try {
    window.localStorage.setItem('cosight.coreSubtitlesEnabled', String(coreSubtitlesEnabled))
  } catch {
    // Local persistence is optional in the desktop shell.
  }
}, [coreSubtitlesEnabled])

useEffect(() => {
  seeBboxDebugEnabledRef.current = seeBboxDebugEnabled
  try {
    window.localStorage.setItem(SEE_BBOX_DEBUG_STORAGE_KEY, String(seeBboxDebugEnabled))
  } catch {
    // Local persistence is optional in the desktop shell.
  }
}, [seeBboxDebugEnabled])

useEffect(() => {
  const normalizedLimit = normalizeSeeMaxObjects(seeMaxObjects)
  if (normalizedLimit !== seeMaxObjects) {
    setSeeMaxObjectsState(normalizedLimit)
    return
  }
  try {
    window.localStorage.setItem(SEE_MAX_OBJECTS_STORAGE_KEY, String(normalizedLimit))
  } catch {
    // Local persistence is optional in the desktop shell.
  }
}, [seeMaxObjects])

useEffect(() => {
  const normalizedDuration = normalizeTurnDetectionSilenceDuration(turnDetectionSilenceDurationMs)
  if (normalizedDuration !== turnDetectionSilenceDurationMs) {
    setTurnDetectionSilenceDurationMsState(normalizedDuration)
    return
  }
  try {
    window.localStorage.setItem(TURN_DETECTION_SILENCE_DURATION_STORAGE_KEY, String(normalizedDuration))
  } catch {
    // Local persistence is optional in the desktop shell.
  }
}, [turnDetectionSilenceDurationMs])

useEffect(() => {
  try {
    window.localStorage.setItem('cosight.allowInterruptions', String(allowInterruptions))
  } catch {
    // Local persistence is optional in the desktop shell.
  }
}, [allowInterruptions])

useEffect(() => {
  const normalizedVolume = Math.min(100, Math.max(0, Number(outputVolume) || 0))
  outputVolumeRef.current = normalizedVolume
  try {
    window.localStorage.setItem(OUTPUT_VOLUME_STORAGE_KEY, String(normalizedVolume))
  } catch {
    // Local persistence is optional in the desktop shell.
  }
  const playback = audioPlaybackRef.current
  const gain = playback?.outputGain
  const context = playback?.context
  if (!gain || !context) return
  const now = context.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setTargetAtTime(normalizedVolume / 100, now, 0.015)
}, [outputVolume])

useEffect(() => {
  try {
    window.localStorage.setItem(AUDIO_INPUT_MODE_STORAGE_KEY, audioInputMode)
  } catch {
    // Local persistence is optional in the desktop shell.
  }
}, [audioInputMode])

useEffect(() => {
  const onError = (event) => {
    window.cosight?.reportRendererError?.({
      phase: 'window.error',
      error: {
        name: event.error?.name,
        message: event.message,
        stack: event.error?.stack,
      },
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    })
  }
  const onUnhandledRejection = (event) => {
    const reason = event.reason
    window.cosight?.reportRendererError?.({
      phase: 'window.unhandledrejection',
      error: reason instanceof Error
        ? { name: reason.name, message: reason.message, stack: reason.stack }
        : { message: String(reason) },
    })
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}, [])

async function handleAgentDrawing(event) {
  window.cosight?.reportRendererEvent?.({ type: 'agent.draw.received', callId: event.callId })
  recordSessionEvent('ability.call', {
    ability: 'drawing',
    tool: 'draw_on_canvas',
    callId: event.callId,
    arguments: event.arguments,
  })
  try {
    const argumentParseError = event.arguments && typeof event.arguments === 'object'
      ? event.arguments.__parseError
      : null
    const result = argumentParseError
      ? { ok: false, error: `绘画工具参数无法解析：${argumentParseError}` }
      : await applyAgentDrawing(event.arguments)
    window.cosight?.reportRendererEvent?.({ type: 'agent.draw.result', callId: event.callId, ok: result.ok, error: result.error })
    if (!window.cosight?.sendToolResult) throw new Error(t('notices.toolResultUnavailable'))
    const reviewFrame = result.ok
      // Keep the review frame below the realtime image-token/payload ceiling
      // while retaining substantially more detail than the periodic preview.
      // The bridge appends this image before the function result is resumed.
      ? await captureAndSendScreenFrame({ maxWidth: 1280, quality: 0.82, flush: 'review', priority: true })
      : { ok: false, error: 'drawing_failed' }
    window.cosight?.reportRendererEvent?.({
      type: 'agent.draw.review_frame_sent',
      callId: event.callId,
      ok: reviewFrame.ok,
      width: reviewFrame.width,
      height: reviewFrame.height,
    })
    const toolResult = {
      ...result,
      annotationIncludedInNextScreenFrame: Boolean(reviewFrame.ok),
      annotationFrameWidth: reviewFrame.width || null,
      annotationFrameHeight: reviewFrame.height || null,
    }
    recordSessionEvent('ability.result', {
      ability: 'drawing',
      tool: 'draw_on_canvas',
      callId: event.callId,
      result: {
        ok: Boolean(result.ok),
        error: result.error || null,
        cleared: Boolean(result.cleared),
        strokes: result.strokes || 0,
        coordinateSpace: result.coordinateSpace || null,
      },
      reviewFrame: {
        ok: Boolean(reviewFrame.ok),
        width: reviewFrame.width || null,
        height: reviewFrame.height || null,
      },
    })
    // Pass the result as structured IPC data. Electron serializes the
    // complete bridge command once; pre-stringifying here can corrupt
    // nested quotes in error messages at the Python JSON boundary.
    window.cosight.sendToolResult(event.callId, toolResult)
    window.cosight?.reportRendererEvent?.({ type: 'agent.draw.tool_result_sent', callId: event.callId })
  } catch (error) {
    recordSessionEvent('ability.error', {
      ability: 'drawing',
      tool: 'draw_on_canvas',
      callId: event.callId,
      error: { name: error.name, message: error.message },
    })
    window.cosight?.reportRendererError?.({
      phase: 'agent.draw',
      callId: event.callId,
      error: { name: error.name, message: error.message, stack: error.stack },
    })
  }
}

async function handleAgentFocus(event) {
  window.cosight?.reportRendererEvent?.({ type: 'agent.focus.received', callId: event.callId })
  recordSessionEvent('ability.call', {
    ability: 'drawing',
    tool: 'focus_screen_region',
    callId: event.callId,
    arguments: event.arguments,
  })
  try {
    const argumentParseError = event.arguments && typeof event.arguments === 'object'
      ? event.arguments.__parseError
      : null
    const focus = argumentParseError
      ? { ok: false, error: `聚焦工具参数无法解析：${argumentParseError}` }
      : await captureAndSendFocusedScreenFrame(event.arguments)
    window.cosight?.reportRendererEvent?.({
      type: 'agent.focus.result',
      callId: event.callId,
      ok: focus.ok,
      crop: focus.crop || null,
      width: focus.width,
      height: focus.height,
    })
    if (!window.cosight?.sendToolResult) throw new Error(t('notices.toolResultUnavailable'))
    const toolResult = focus.ok
      ? {
          ...focus,
          nextDrawingCoordinateSpace: 'focused_region',
          instruction: 'Use the focused image to locate the target again, then call draw_on_canvas with coordinateSpace="focused_region". The client maps those local coordinates back to the full captured screen.',
        }
      : focus
    recordSessionEvent('ability.result', {
      ability: 'drawing',
      tool: 'focus_screen_region',
      callId: event.callId,
      result: {
        ok: Boolean(focus.ok),
        error: focus.error || null,
        mode: focus.mode || null,
        width: focus.width || null,
        height: focus.height || null,
        crop: focus.crop || null,
      },
    })
    window.cosight.sendToolResult(event.callId, toolResult)
    window.cosight?.reportRendererEvent?.({ type: 'agent.focus.tool_result_sent', callId: event.callId, ok: focus.ok })
  } catch (error) {
    recordSessionEvent('ability.error', {
      ability: 'drawing',
      tool: 'focus_screen_region',
      callId: event.callId,
      error: { name: error.name, message: error.message },
    })
    window.cosight?.reportRendererError?.({
      phase: 'agent.focus',
      callId: event.callId,
      error: { name: error.name, message: error.message, stack: error.stack },
    })
  }
}

async function handleAgentWriting(event) {
  window.cosight?.reportRendererEvent?.({ type: 'agent.writing.received', callId: event.callId })
  recordSessionEvent('ability.call', {
    ability: 'writing',
    tool: 'show_caption',
    callId: event.callId,
    arguments: event.arguments,
  })
  try {
    const argumentParseError = event.arguments && typeof event.arguments === 'object'
      ? event.arguments.__parseError
      : null
    const result = argumentParseError
      ? { ok: false, error: `字幕工具参数无法解析：${argumentParseError}` }
      : await applyAgentWriting(event.arguments)
    window.cosight?.reportRendererEvent?.({ type: 'agent.writing.result', callId: event.callId, ok: result.ok, error: result.error })
    if (!window.cosight?.sendToolResult) throw new Error(t('notices.toolResultUnavailable'))
    recordSessionEvent('ability.result', {
      ability: 'writing',
      tool: 'show_caption',
      callId: event.callId,
      result: {
        ok: Boolean(result.ok),
        error: result.error || null,
        cleared: Boolean(result.cleared),
        displayed: Boolean(result.displayed),
      },
    })
    window.cosight.sendToolResult(event.callId, result)
    window.cosight?.reportRendererEvent?.({ type: 'agent.writing.tool_result_sent', callId: event.callId })
  } catch (error) {
    recordSessionEvent('ability.error', {
      ability: 'writing',
      tool: 'show_caption',
      callId: event.callId,
      error: { name: error.name, message: error.message },
    })
    window.cosight?.reportRendererError?.({
      phase: 'agent.writing',
      callId: event.callId,
      error: { name: error.name, message: error.message, stack: error.stack },
    })
  }
}

function markInitiativeActivity() {
  lastInitiativeActivityRef.current = Date.now()
}

function extendInitiativeActivityUntil(timestamp) {
  if (!Number.isFinite(timestamp)) return
  lastInitiativeActivityRef.current = Math.max(lastInitiativeActivityRef.current, timestamp)
}

function assistantAudioIsPlaying() {
  return Date.now() < assistantAudioUntilRef.current
}

function flushAssistantTurn() {
  if (assistantTurnFlushTimerRef.current) {
    window.clearTimeout(assistantTurnFlushTimerRef.current)
    assistantTurnFlushTimerRef.current = null
  }
  const text = transcriptText(assistantTurnTextRef.current).trim()
  if (text) {
    setTranscript((items) => [...items, {
      id: makeSessionId('message'),
      time: formatElapsed(elapsed),
      timestamp: new Date().toISOString(),
      speaker: 'Cosight',
      text,
      final: true,
      sessionId: currentSessionIdRef.current,
    }])
  }
  assistantTurnTextRef.current = ''
}

function scheduleAssistantTurnFlush() {
  if (assistantTurnFlushTimerRef.current) window.clearTimeout(assistantTurnFlushTimerRef.current)
  // A tool call can be followed by a short assistant continuation. Give that
  // continuation a small window to join the same user turn instead of adding
  // another transcript row.
  assistantTurnFlushTimerRef.current = window.setTimeout(() => {
    assistantTurnFlushTimerRef.current = null
    flushAssistantTurn()
  }, 1200)
}

function handleQwenEvent(event) {
  if (!event) return
  if (event.type === 'conversation.summary.updated') {
    const summary = normalizeConversationSummary(event.summary)
    setConversationSummary(summary)
    recordSessionEvent('conversation.summary.updated', {
      coveredRevision: event.coveredRevision,
      contentChars: JSON.stringify(summary).length,
    })
    return
  }
  if (event.type === 'conversation.context.cleared') {
    setConversationSummary(emptyConversationSummary())
    return
  }
  if (event.type === 'system-audio.started') {
    audioFrameSentRef.current = true
    setMicActive(true)
    return
  }
  if (event.type === 'system-audio.level') {
    setMicLevel(audioInputModeRef.current === 'system' ? Math.min(1, Math.max(0, Number(event.level) || 0)) : 0)
    return
  }
  if (event.type === 'system-audio.stopped') {
    if (audioInputModeRef.current === 'system') {
      audioFrameSentRef.current = false
      setMicActive(false)
      setMicLevel(0)
    }
    return
  }
  if (event.type === 'system-audio.error') {
    audioFrameSentRef.current = false
    setMicActive(false)
    setMicLevel(0)
    setNotice(event.message || t('notices.systemAudioFailed'))
    return
  }
  if (event.type === 'harness.see.capture.requested') {
    const requestId = event.requestId || ''
    recordSessionEvent('harness.see.capture.requested', {
      requestId,
      reason: event.reason,
    })
    const captureStartedAt = performance.now()
    window.cosight?.reportRendererEvent?.({
      type: 'harness.see.capture.started',
      requestId,
      reason: event.reason,
    })
    void captureAndSendScreenFrame({ maxWidth: 1280, quality: 0.82, flush: 'see', priority: true, requestId })
      .then((result) => {
        window.cosight?.reportRendererEvent?.({
          type: 'harness.see.capture.result',
          requestId,
          durationMs: Math.round(performance.now() - captureStartedAt),
          ...result,
        })
      })
      .catch((error) => {
        window.cosight?.reportRendererEvent?.({
          type: 'harness.see.capture.result',
          requestId,
          durationMs: Math.round(performance.now() - captureStartedAt),
          ok: false,
          error: error?.message || String(error),
        })
      })
  }
  if (event.type === 'harness.draw.requested') void handleHarnessDraw(event)
  if (event.type === 'harness.signal') {
    recordSessionEvent('harness.signal', event.signal || {})
    if (seeBboxDebugEnabledRef.current && event.signal?.type === 'see.completed') {
      const debugBoxes = normalizeSeeDebugBoxes(event.signal)
      void window.cosight?.drawOnOverlay?.({ debugBoxes })
    }
  }
  if (event.type === 'harness.action.failed') {
    recordSessionEvent('harness.action.failed', event)
  }
  if (event.type === 'connected') {
    connectionRef.current = 'Connecting'
    audioFrameSentRef.current = false
    setConnection('Connecting')
  }
  if (event.type === 'bridge.ready') {
    connectionRef.current = 'Connected'
    audioFrameSentRef.current = false
    markInitiativeActivity()
    setConnection('Connected')
  }
  if (event.type === 'closed' || event.type === 'bridge.stopped' || event.type === 'bridge.closed') {
    connectionRef.current = 'Disconnected'
    audioFrameSentRef.current = false
    initiativeResponsePendingRef.current = false
    setConnection('Disconnected')
    if (event.type === 'closed') {
      const code = event.code === undefined || event.code === null ? '未知状态' : event.code
      const closeMessage = event.message || '服务端没有返回关闭原因。'
      setNotice(lastBridgeErrorRef.current || t('notices.websocketClosed', { code, message: closeMessage }))
    }
  }
  if (event.type === 'bridge.error') {
    lastBridgeErrorRef.current = event.message || t('notices.pythonBridgeError')
    connectionRef.current = 'Bridge error'
    audioFrameSentRef.current = false
    initiativeResponsePendingRef.current = false
    setConnection('Bridge error')
    setNotice(lastBridgeErrorRef.current)
  }
  if (event.type === 'agent.focus') void handleAgentFocus(event)
  if (event.type === 'agent.draw') void handleAgentDrawing(event)
  if (event.type === 'agent.writing' || event.type === 'agent.caption') void handleAgentWriting(event)
  if (event.type === 'assistant.output.started' && event.outputType === 'function_call') {
    // Tool-chain responses are internal steps. Do not expose a model's
    // function-call payload as a chat message, but keep any real assistant
    // transcript/audio text. Users should be able to see what the model
    // actually said while it is carrying out a drawing operation.
    assistantToolResponseRef.current = true
  }
  if (event.type === 'agent.focus' || event.type === 'agent.draw' || event.type === 'agent.writing' || event.type === 'agent.caption') {
    assistantToolResponseRef.current = true
  }
  if (event.type === 'user.transcript') {
    // A new user turn closes any assistant continuation that was waiting to
    // be merged. This keeps separate turns separate while still combining
    // tool-call follow-ups from the same turn.
    flushAssistantTurn()
    markInitiativeActivity()
  }
  if (event.type === 'user.transcript' && hasVisibleTranscriptText(event.text)) {
    setTranscript((items) => [...items, {
      id: makeSessionId('message'),
      time: formatElapsed(elapsed),
      timestamp: new Date().toISOString(),
      speaker: 'You',
      text: transcriptText(event.text).trim(),
      final: true,
      sessionId: currentSessionIdRef.current,
    }])
  }
  if (event.type === 'assistant.text.delta' && liveTranscript) {
    assistantDraftRef.current += transcriptText(event.text)
    if (hasVisibleTranscriptText(assistantDraftRef.current)) setAssistantDraft(assistantDraftRef.current)
  }
  if (event.type === 'assistant.text.delta' && !liveTranscript) {
    assistantDraftRef.current += transcriptText(event.text)
  }
  if (event.type === 'assistant.text.delta' && speakingRef.current) {
    void showCoreCaption(assistantDraftRef.current)
  }
  if (event.type === 'assistant.text.done' && hasVisibleTranscriptText(event.text)) {
    // Some realtime responses end with a whitespace-only transcript. Do not
    // let that final event erase meaningful text already received in deltas.
    assistantDraftRef.current = transcriptText(event.text)
    if (liveTranscript) setAssistantDraft(assistantDraftRef.current)
    if (speakingRef.current) void showCoreCaption(assistantDraftRef.current)
  }
  if (event.type === 'assistant.response.done') {
    // response.done may arrive while buffered audio is still playing.
    // Never shorten the deadline calculated from the playback queue.
    extendInitiativeActivityUntil(Date.now())
    initiativeResponsePendingRef.current = false
    const outputTypes = Array.isArray(event.outputTypes) ? event.outputTypes : []
    const containsToolCall = assistantToolResponseRef.current || outputTypes.includes('function_call')
    if (containsToolCall) {
      // Keep transcript text emitted alongside a tool call. The tool call
      // itself is not shown as a message, but the model's spoken/text
      // explanation should not disappear from the conversation record.
      const toolStepText = transcriptText(assistantDraftRef.current).trim()
      if (toolStepText) {
        assistantTurnTextRef.current = assistantTurnTextRef.current
          ? `${assistantTurnTextRef.current} ${toolStepText}`
          : toolStepText
        scheduleAssistantTurnFlush()
      }
      assistantDraftRef.current = ''
      if (liveTranscript) setAssistantDraft('')
      assistantToolResponseRef.current = false
      scheduleCoreCaptionClearAtPlaybackEnd()
      return
    }
    const completedText = transcriptText(assistantDraftRef.current).trim()
    if (completedText) {
      assistantTurnTextRef.current = assistantTurnTextRef.current
        ? `${assistantTurnTextRef.current} ${completedText}`
        : completedText
      scheduleAssistantTurnFlush()
    }
    scheduleCoreCaptionClearAtPlaybackEnd()
    assistantDraftRef.current = ''
    setAssistantDraft('')
    assistantToolResponseRef.current = false
  }
  if (event.type === 'assistant.audio.delta') {
    if (event.data && speakingRef.current) {
      // Audio can arrive faster than it is played. Extend the silence
      // deadline through the end of the scheduled playback queue instead
      // of starting the initiative countdown when the packet is received.
      const playbackEndAt = playPcm(event.data)
      assistantAudioUntilRef.current = Math.max(assistantAudioUntilRef.current, playbackEndAt)
      extendInitiativeActivityUntil(playbackEndAt)
      scheduleCoreCaptionClearAtPlaybackEnd(playbackEndAt)
    }
  }
}

async function startAudioInput(mode = audioInputMode, deviceId = selectedMic) {
  const nextMode = normalizeAudioInputMode(mode)
  if (nextMode === 'system') {
    stopMicrophone()
    window.cosight?.setSystemAudioListeningEnabled?.(listeningRef.current)
    const result = await window.cosight?.startSystemAudioCapture?.()
    if (!result?.ok) throw new Error(result?.error || t('notices.systemAudioFailed'))
    audioFrameSentRef.current = true
    setMicActive(true)
    setMicLevel(0)
    return
  }
  await window.cosight?.stopSystemAudioCapture?.()
  await startMicrophone(deviceId)
}

async function startMicrophone(deviceId = selectedMic) {
  if (micStreamRef.current) return
  audioFrameSentRef.current = false
  const audio = deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(audio === true ? {} : audio), echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  micStreamRef.current = stream
  stream.getAudioTracks().forEach((track) => { track.enabled = !micMuted })
  await loadDevices()
  const context = new AudioContext()
  audioContextRef.current = context
  await context.resume()
  // The renderer is served from Vite during development but from a
  // file:// URL inside the packaged Electron app. Resolve the public
  // worklet relative to the current document so both environments use the
  // same dist/pcm-processor.js file.
  const workletUrl = new URL('./pcm-processor.js', window.location.href).toString()
  await context.audioWorklet.addModule(workletUrl)
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.35
  analyser.minDecibels = -90
  analyser.maxDecibels = -10
  const processor = new AudioWorkletNode(context, 'cosight-pcm-processor')
  const outputSilencer = context.createGain()
  outputSilencer.gain.value = 0
  processor.port.onmessage = (event) => {
    if (!connectionRef.current.includes('Connected') || !window.cosight?.sendAudioChunk) return
    // The realtime service uses server VAD. If speaker output leaks back
    // into the microphone, it can be interpreted as a fresh user turn and
    // produce repeated assistant responses. Keep the analyser running for
    // the UI, but pause upstream microphone frames until playback drains.
    if (!allowInterruptionsRef.current && assistantAudioIsPlaying()) return
    const audioData = listeningRef.current ? event.data : new ArrayBuffer(event.data.byteLength)
    window.cosight.sendAudioChunk(toBase64(audioData))
    audioFrameSentRef.current = true
  }
  source.connect(analyser)
  analyser.connect(outputSilencer)
  source.connect(processor).connect(outputSilencer).connect(context.destination)
  micAnalyserRef.current = analyser
  const samples = new Float32Array(analyser.fftSize)
  const updateMeter = () => {
    if (micAnalyserRef.current !== analyser) return
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (const sample of samples) {
      sum += sample * sample
    }
    const rms = Math.sqrt(sum / samples.length)
    const nextLevel = Math.min(1, Math.max(0, (rms - 0.012) * 18))
    if (!micMuted && !assistantAudioIsPlaying() && nextLevel >= 0.04) markInitiativeActivity()
    setMicLevel((current) => current + (nextLevel - current) * 0.35)
    micMeterFrameRef.current = window.requestAnimationFrame(updateMeter)
  }
  micMeterFrameRef.current = window.requestAnimationFrame(updateMeter)
  audioWorkletRef.current = { source, processor, analyser, outputSilencer }
  setMicActive(true)
}

function toggleMicrophoneMute() {
  const nextMuted = !micMuted
  if (audioInputModeRef.current === 'system') {
    window.cosight?.setSystemAudioMuted?.(nextMuted)
    setMicMuted(nextMuted)
    if (nextMuted) setMicLevel(0)
    return
  }
  micStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted })
  setMicMuted(nextMuted)
  if (nextMuted) setMicLevel(0)
}

async function selectAudioInputMode(mode) {
  const nextMode = normalizeAudioInputMode(mode)
  audioInputModeRef.current = nextMode
  setAudioInputMode(nextMode)
  setMicMuted(false)
  stopMicrophone()
  await window.cosight?.stopSystemAudioCapture?.()
  try {
    await startAudioInput(nextMode)
  } catch (error) {
    setMicActive(false)
    setMicLevel(0)
    setNotice(t('notices.audioInputStartFailed', { message: error.message }))
  }
}

async function selectMicrophone(deviceId) {
  audioInputModeRef.current = 'microphone'
  setAudioInputMode('microphone')
  setSelectedMic(deviceId)
  stopMicrophone()
  try {
    await window.cosight?.stopSystemAudioCapture?.()
    await startMicrophone(deviceId)
  } catch (error) {
    stopMicrophone()
    setNotice(t('notices.microphoneSwitchFailed', { message: error.message }))
  }
}

function stopMicrophone() {
  if (micMeterFrameRef.current) window.cancelAnimationFrame(micMeterFrameRef.current)
  micMeterFrameRef.current = null
  micAnalyserRef.current = null
  audioWorkletRef.current?.source?.disconnect()
  audioWorkletRef.current?.processor?.disconnect()
  audioWorkletRef.current?.analyser?.disconnect()
  audioWorkletRef.current?.outputSilencer?.disconnect()
  audioContextRef.current?.close()
  audioWorkletRef.current = null
  audioContextRef.current = null
  micStreamRef.current?.getTracks().forEach((track) => track.stop())
  micStreamRef.current = null
  audioFrameSentRef.current = false
  setMicActive(false)
  setMicMuted(false)
  setMicLevel(0)
}

async function openSourcePicker() {
  if (connectionRef.current === 'Connecting') {
    setNotice(t('notices.captureLockedDuringChat'))
    return
  }
  setSourcePickerOpen(true)
  setSources([])
  setSourcesLoading(true)
  try {
    const available = await window.cosight?.listDesktopSources?.()
    setSources(available || [])
  } catch (error) {
    setSources([])
    setNotice(t('notices.cannotReadSources', { message: error.message }))
  } finally {
    setSourcesLoading(false)
  }
}

async function shareSource(source) {
  if (connectionRef.current === 'Connecting') {
    setNotice(t('notices.captureLockedDuringChat'))
    return
  }
  setSourcePickerOpen(false)
  setSourcesLoading(false)
  setScreenLoading(true)
  let stream
  const captureKind = sourceCaptureKind(source)
  try {
    window.cosight?.prepareDesktopSource?.(source.id)
    // Electron's display-media handler is the single capture path. On
    // Windows, main.mjs disables WGC so Chromium uses its stable legacy
    // desktop capturer underneath this API.
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    screenStreamRef.current = stream
    screenSourceRef.current = { ...source, captureKind }
    setScreenCaptureKind(captureKind)
    if (captureKind === 'screen' && (transparentCanvasRef.current || writingRef.current || coreSubtitlesRef.current)) {
      const overlayResult = await window.cosight?.showOverlay?.(source)
      if (!overlayResult?.ok) throw new Error(overlayResult?.error || '透明画布窗口无法启动。')
    } else {
      // A window source has window-local video coordinates. Keep the
      // full-display overlay hidden rather than placing annotations at a
      // misleading display-global position.
      await window.cosight?.hideOverlay?.()
      if (captureKind === 'window' && (transparentCanvasRef.current || writingRef.current || coreSubtitlesRef.current)) {
        setNotice(t('notices.overlayRequiresScreenSource'))
      }
    }
    if (connectionRef.current === 'Connected') {
      window.cosight?.updateSessionCapabilities?.({
        canvasEnabled: captureKind === 'screen' && transparentCanvasRef.current,
        writingEnabled: captureKind === 'screen' && writingRef.current,
        screenSharing: true,
      })
    }
    screenSharingRef.current = true
    setScreenSharing(true)
    frameTimerRef.current = window.setInterval(() => { void captureAndSendScreenFrame() }, 1000)
    stream.getVideoTracks()[0].addEventListener('ended', stopScreenShare)
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop())
    screenStreamRef.current = null
    screenSourceRef.current = null
    setScreenCaptureKind('unknown')
    if (connectionRef.current === 'Connected') {
      window.cosight?.updateSessionCapabilities?.({ canvasEnabled: false, writingEnabled: false, screenSharing: false })
    }
    await window.cosight?.hideOverlay?.()
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null
    screenSharingRef.current = false
    setScreenSharing(false)
    setScreenLoading(false)
    setNotice(t('notices.captureFailed', { message: error.message }))
  }
}

async function captureAndSendScreenFrame({ maxWidth = 960, quality = 0.68, flush = false, priority = false, requestId = '' } = {}) {
  if (screenFrameCapturePromiseRef.current) {
    if (!priority) return { ok: false, error: 'screen_frame_busy', requestId }
    try {
      await screenFrameCapturePromiseRef.current
    } catch {
      // Retry the priority frame even if a periodic capture failed.
    }
  }
  const operation = (async () => {
    const video = screenVideoRef.current
    const unavailableReasons = []
    if (!screenVisionRef.current) unavailableReasons.push('screen_vision_disabled')
    if (!screenSharingRef.current) unavailableReasons.push('screen_not_sharing')
    if (!video?.videoWidth || !video?.videoHeight) unavailableReasons.push('video_not_ready')
    if (!String(connectionRef.current || '').includes('Connected')) unavailableReasons.push('session_not_connected')
    if (!audioFrameSentRef.current) unavailableReasons.push('audio_not_started')
    if (unavailableReasons.length) {
      return {
        ok: false,
        error: 'screen_frame_unavailable',
        requestId,
        unavailableReasons,
        state: {
          screenVisionEnabled: Boolean(screenVisionRef.current),
          screenSharing: Boolean(screenSharingRef.current),
          videoWidth: video?.videoWidth || 0,
          videoHeight: video?.videoHeight || 0,
          connection: connectionRef.current,
          audioFrameSent: Boolean(audioFrameSentRef.current),
        },
      }
    }
    const canvas = screenCanvasRef.current || document.createElement('canvas')
    screenCanvasRef.current = canvas
    const ratio = Math.min(1, maxWidth / video.videoWidth)
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio))
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio))
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    // getDisplayMedia intentionally does not include the desktop overlay.
    // Composite only the agent's drawing strokes into the outbound frame so
    // the agent can inspect the exact annotation it just created. Captions
    // are deliberately excluded because they are renderer UI, not screen
    // content, and must not be sent to See or Brain.
    drawStrokesOnCapturedFrame(context, canvas, drawingStrokesRef.current, video.videoWidth, video.videoHeight)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return { ok: false, error: 'screen_frame_encode_failed', requestId }
    if (!String(connectionRef.current || '').includes('Connected') || !audioFrameSentRef.current) {
      return {
        ok: false,
        error: 'screen_frame_unavailable_after_capture',
        requestId,
        bytes: blob.size,
        state: {
          connection: connectionRef.current,
          audioFrameSent: Boolean(audioFrameSentRef.current),
        },
      }
    }
    const flushMode = typeof flush === 'string' ? flush : (flush ? 'focus' : 'default')
    window.cosight?.sendVideoFrame?.(
      toBase64(await blob.arrayBuffer()),
      flushMode !== 'default',
      flushMode,
      requestId,
    )
    return { ok: true, requestId, width: canvas.width, height: canvas.height, bytes: blob.size, mode: flushMode }
  })()
  screenFrameCapturePromiseRef.current = operation
  try {
    return await operation
  } finally {
    if (screenFrameCapturePromiseRef.current === operation) screenFrameCapturePromiseRef.current = null
  }
}

async function captureAndSendFocusedScreenFrame(payload = {}) {
  if (screenFrameCapturePromiseRef.current) {
    try {
      await screenFrameCapturePromiseRef.current
    } catch {
      // A failed periodic frame should not prevent an explicit focus request.
    }
  }
  const operation = (async () => {
    const video = screenVideoRef.current
    if (sourceCaptureKind(screenSourceRef.current) !== 'screen') {
      return { ok: false, error: 'screen_focus_requires_full_screen_source' }
    }
    if (!screenVisionRef.current || !screenSharingRef.current || !video?.videoWidth || !video?.videoHeight || !connectionRef.current.includes('Connected') || !audioFrameSentRef.current) {
      return { ok: false, error: 'screen_focus_unavailable' }
    }

    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    const centerX = clampNumber(payload?.x, 0, 1, 0.5) * sourceWidth
    const centerY = clampNumber(payload?.y, 0, 1, 0.5) * sourceHeight
    const estimatedWidth = clampNumber(payload?.estimatedWidth, 0.01, 1, 0)
    const estimatedHeight = clampNumber(payload?.estimatedHeight, 0.01, 1, 0)
    // A half-frame crop gives a 2x linear enlargement. If the rough estimate
    // is larger, expand the crop so the target is not clipped before the
    // model gets a chance to refine it.
    const cropWidth = Math.min(sourceWidth, Math.max(sourceWidth / 2, estimatedWidth * sourceWidth * 1.7))
    const cropHeight = Math.min(sourceHeight, Math.max(sourceHeight / 2, estimatedHeight * sourceHeight * 1.7))
    const left = Math.max(0, Math.min(sourceWidth - cropWidth, centerX - cropWidth / 2))
    const top = Math.max(0, Math.min(sourceHeight - cropHeight, centerY - cropHeight / 2))
    const crop = { left, top, width: cropWidth, height: cropHeight }
    const canvas = document.createElement('canvas')
    // Keep the focused image at roughly 2x the pixel density of the normal
    // full-frame image. The normal realtime frame uses maxWidth=960, so a
    // 1920px source has a 0.5 output scale and its half-width focus crop
    // should use 1.0; a 1280px source uses 1.5 and a 960px source uses 2.0.
    // The 1440px ceiling still protects the realtime payload for unusually
    // large estimated regions.
    const fullFrameOutputScale = Math.min(1, 960 / sourceWidth)
    const ratio = Math.min(fullFrameOutputScale * 2, 1440 / cropWidth, 1440 / cropHeight)
    canvas.width = Math.max(1, Math.round(cropWidth * ratio))
    canvas.height = Math.max(1, Math.round(cropHeight * ratio))
    const context = canvas.getContext('2d')
    if (!context) return { ok: false, error: 'screen_focus_canvas_unavailable' }
    context.drawImage(video, left, top, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)
    // Keep the focused frame truthful to the shared screen: existing agent
    // marks are included, but captions are renderer UI and are deliberately
    // omitted. The crop uses full-frame normalized coordinates and therefore
    // cannot drift at the edges.
    drawStrokesOnCapturedFrame(context, canvas, drawingStrokesRef.current, sourceWidth, sourceHeight, crop)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob || !connectionRef.current.includes('Connected') || !audioFrameSentRef.current) {
      return { ok: false, error: 'screen_focus_unavailable' }
    }
    pendingDrawingFocusRef.current = {
      frameWidth: sourceWidth,
      frameHeight: sourceHeight,
      ...crop,
    }
    window.cosight?.sendVideoFrame?.(toBase64(await blob.arrayBuffer()), true, 'focus')
    return {
      ok: true,
      mode: 'focused_region',
      width: canvas.width,
      height: canvas.height,
      crop: {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(cropWidth),
        height: Math.round(cropHeight),
        frameWidth: sourceWidth,
        frameHeight: sourceHeight,
        scale: Number((sourceWidth / cropWidth).toFixed(3)),
        outputScale: Number(ratio.toFixed(3)),
      },
    }
  })()
  screenFrameCapturePromiseRef.current = operation
  try {
    return await operation
  } finally {
    if (screenFrameCapturePromiseRef.current === operation) screenFrameCapturePromiseRef.current = null
  }
}

async function attachScreenPreview(stream) {
  const video = screenVideoRef.current
  if (!video) return
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()
}

function stopScreenShare() {
  const chatActive = connectionRef.current === 'Connecting' || connectionRef.current === 'Connected'
  if (chatActive) {
    // The realtime session must stop advertising tools that require the
    // transparent overlay as soon as the capture disappears.
    window.cosight?.updateSessionCapabilities?.({ canvasEnabled: false, writingEnabled: false, screenSharing: false })
  }
  window.clearInterval(frameTimerRef.current)
  frameTimerRef.current = null
  screenStreamRef.current?.getTracks().forEach((track) => track.stop())
  screenStreamRef.current = null
  screenSourceRef.current = null
  setScreenCaptureKind('unknown')
  void window.cosight?.hideOverlay?.()
  if (screenVideoRef.current) screenVideoRef.current.srcObject = null
  drawingStrokesRef.current = []
  pendingDrawingFocusRef.current = null
  writingCaptionRef.current = null
  coreCaptionRef.current = null
  if (writingCaptionTimerRef.current) window.clearTimeout(writingCaptionTimerRef.current)
  if (coreCaptionTimerRef.current) window.clearTimeout(coreCaptionTimerRef.current)
  writingCaptionTimerRef.current = null
  coreCaptionTimerRef.current = null
  screenSharingRef.current = false
  setScreenSharing(false)
  setScreenLoading(false)
}

function getDrawingImageRect() {
  const canvas = drawingCanvasRef.current
  const stage = canvas?.parentElement
  if (!canvas || !stage) return null
  const stageRect = stage.getBoundingClientRect()
  const sourceWidth = screenVideoRef.current?.videoWidth || stageRect.width
  const sourceHeight = screenVideoRef.current?.videoHeight || stageRect.height
  const scale = Math.min(stageRect.width / sourceWidth, stageRect.height / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return {
    width: stageRect.width,
    height: stageRect.height,
    left: (stageRect.width - width) / 2,
    top: (stageRect.height - height) / 2,
    imageWidth: width,
    imageHeight: height,
  }
}

function renderDrawingCanvas() {
  const canvas = drawingCanvasRef.current
  const rect = getDrawingImageRect()
  if (!canvas || !rect || !canvas.clientWidth || !canvas.clientHeight) return
  const context = canvas.getContext('2d')
  const scale = canvas.width / canvas.clientWidth
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.clearRect(0, 0, rect.width, rect.height)
  context.save()
  context.beginPath()
  context.rect(rect.left, rect.top, rect.imageWidth, rect.imageHeight)
  context.clip()
  drawingStrokesRef.current.forEach((stroke) => {
    const points = Array.isArray(stroke.points) ? stroke.points : []
    if (points.length < 2) return
    context.beginPath()
    points.forEach((point, index) => {
      const x = rect.left + clampNumber(point.x, 0, 1) * rect.imageWidth
      const y = rect.top + clampNumber(point.y, 0, 1) * rect.imageHeight
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.strokeStyle = isHexColor(stroke.color) ? stroke.color : '#ff4d6d'
    context.lineWidth = clampNumber(stroke.width, 1, 24, 4)
    context.globalAlpha = clampNumber(stroke.opacity, 0.1, 1, 0.95)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.stroke()
  })
  context.restore()
  context.globalAlpha = 1
}

function resizeDrawingCanvas() {
  const canvas = drawingCanvasRef.current
  if (!canvas) return
  const width = Math.max(1, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)))
  const height = Math.max(1, Math.round(canvas.clientHeight * (window.devicePixelRatio || 1)))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  renderDrawingCanvas()
}

async function applyAgentDrawing(payload) {
  if (!transparentCanvasRef.current || !screenSharingRef.current) {
    return { ok: false, error: '透明画布未启用或当前没有分享屏幕。' }
  }
  if (sourceCaptureKind(screenSourceRef.current) !== 'screen') {
    return { ok: false, error: '绘画覆盖层只支持整屏捕获；窗口捕获无法将坐标安全映射到实际屏幕。' }
  }
  const clear = Boolean(payload?.clear)
  const suppliedStrokes = Array.isArray(payload?.strokes) ? payload.strokes : []
  // Also accept a flat list of points as one shorthand stroke. The model's
  // canonical format remains an array of { points } stroke objects.
  const isDrawingPoint = (point) => {
    if (Array.isArray(point)) return point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
    return Boolean(point) && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
  }
  const isFlatPointStroke = suppliedStrokes.length >= 2 && suppliedStrokes.every(isDrawingPoint)
  const rawStrokes = isFlatPointStroke ? [suppliedStrokes] : suppliedStrokes
  const clearOnly = clear && rawStrokes.length === 0
  // Clearing is a screen-wide state operation. It must remain valid even
  // when a previous focus crop has already been consumed by a drawing call.
  const requestedCoordinateSpace = payload?.coordinateSpace || (clearOnly ? 'full_screen' : null)
  if (requestedCoordinateSpace !== 'full_screen' && requestedCoordinateSpace !== 'focused_region') {
    return { ok: false, error: 'draw_on_canvas 必须明确提供 coordinateSpace：full_screen 或 focused_region。' }
  }
  const coordinateSpace = requestedCoordinateSpace
  const focus = pendingDrawingFocusRef.current
  const hasValidFocus = Boolean(focus && focus.frameWidth && focus.frameHeight && focus.width && focus.height)
  if (!clearOnly && hasValidFocus && coordinateSpace !== 'focused_region') {
    return { ok: false, error: '刚完成 focus_screen_region，必须使用 coordinateSpace="focused_region"；请根据局部复核帧重新绘制。' }
  }
  if (!clearOnly && coordinateSpace === 'focused_region' && (!focus || !focus.frameWidth || !focus.frameHeight)) {
    return { ok: false, error: '局部放大定位已失效，请先重新调用 focus_screen_region。' }
  }
  const normalizedStrokes = rawStrokes
    .map(normalizeDrawingStroke)
    .filter(Boolean)
    .map((stroke) => {
      if (coordinateSpace !== 'focused_region') return stroke
      return {
        ...stroke,
        points: stroke.points.map((point) => ({
          x: clampNumber((focus.left + point.x * focus.width) / focus.frameWidth, 0, 1, 0.5),
          y: clampNumber((focus.top + point.y * focus.height) / focus.frameHeight, 0, 1, 0.5),
        })),
      }
    })
  if (rawStrokes.length > 0 && normalizedStrokes.length === 0) {
    return {
      ok: false,
      error: '绘画参数中的 strokes 没有包含有效笔画；每笔必须是 { points: [{ x, y }, ...] }，且至少包含两个点。',
    }
  }
  const drawPayload = { ...payload, clear, strokes: normalizedStrokes, coordinateSpace: 'full_screen' }
  const result = await window.cosight?.drawOnOverlay?.(drawPayload)
  if (!result?.ok) return result || { ok: false, error: '透明画布窗口尚未准备好。' }
  pendingDrawingFocusRef.current = null
  if (clear) drawingStrokesRef.current = []
  drawingStrokesRef.current.push(...normalizedStrokes)
  return {
    ok: true,
    cleared: clear,
    strokes: normalizedStrokes.length,
    coordinateSpace,
    annotationIncludedInNextScreenFrame: true,
  }
}

async function handleHarnessDraw(event) {
  const semantic = event?.action || {}
  const operation = String(semantic.operation || '').toLowerCase()
  const target = semantic.target && typeof semantic.target === 'object' ? semantic.target : {}
  const style = semantic.style && typeof semantic.style === 'object' ? semantic.style : {}
  const point = (value, fallback = { x: 0.5, y: 0.5 }) => ({
    x: clampNumber(Array.isArray(value) ? value[0] : value?.x, 0, 1, fallback.x),
    y: clampNumber(Array.isArray(value) ? value[1] : value?.y, 0, 1, fallback.y),
  })
  const stroke = (points) => ({ points, ...style })
  const bbox = target.bbox || semantic.bbox
  const left = clampNumber(bbox?.x, 0, 1, 0)
  const top = clampNumber(bbox?.y, 0, 1, 0)
  const width = clampNumber(bbox?.width, 0, 1 - left, 0)
  const height = clampNumber(bbox?.height, 0, 1 - top, 0)
  const strokes = []
  if (operation === 'clear') {
    strokes.length = 0
  } else if (operation === 'rectangle' && width > 0 && height > 0) {
    strokes.push(stroke([
      { x: left, y: top },
      { x: left + width, y: top },
      { x: left + width, y: top + height },
      { x: left, y: top + height },
      { x: left, y: top },
    ]))
  } else if (operation === 'circle' && width > 0 && height > 0) {
    const centerX = left + width / 2
    const centerY = top + height / 2
    const points = Array.from({ length: 33 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 32
      return { x: centerX + Math.cos(angle) * width / 2, y: centerY + Math.sin(angle) * height / 2 }
    })
    strokes.push(stroke(points))
  } else if (operation === 'arrow') {
    const from = point(target.from || semantic.from, { x: 0.25, y: 0.5 })
    const to = point(target.to || semantic.to, { x: 0.75, y: 0.5 })
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    const size = 0.025
    strokes.push(stroke([from, to]))
    strokes.push(stroke([
      to,
      { x: to.x - Math.cos(angle - Math.PI / 6) * size, y: to.y - Math.sin(angle - Math.PI / 6) * size },
    ]))
    strokes.push(stroke([
      to,
      { x: to.x - Math.cos(angle + Math.PI / 6) * size, y: to.y - Math.sin(angle + Math.PI / 6) * size },
    ]))
  } else if (operation === 'point') {
    const center = point(target.point || semantic.point)
    strokes.push(stroke([
      { x: center.x - 0.012, y: center.y },
      { x: center.x + 0.012, y: center.y },
    ]))
    strokes.push(stroke([
      { x: center.x, y: center.y - 0.012 },
      { x: center.x, y: center.y + 0.012 },
    ]))
  }
  const text = typeof semantic.text === 'string' ? semantic.text.trim().slice(0, 500) : ''
  const textPoint = point(target.point || target.position || semantic.point || semantic.position)
  const textPayload = {
    clear: Boolean(semantic.clear),
    text,
    x: textPoint.x,
    y: textPoint.y,
    fontSize: style.fontSize,
    color: style.color,
    backgroundColor: style.backgroundColor,
    backgroundOpacity: style.backgroundOpacity,
    maxWidth: style.maxWidth,
    durationMs: style.durationMs,
  }
  const supported = operation === 'clear' || operation === 'arrow' || operation === 'point'
    || (operation === 'text' && (Boolean(semantic.clear) || text.length > 0))
    || ((operation === 'circle' || operation === 'rectangle') && width > 0 && height > 0)
  const result = supported
    ? operation === 'text'
      ? await applyAgentWriting(textPayload)
      : await applyAgentDrawing({
          clear: operation === 'clear',
          coordinateSpace: 'full_screen',
          strokes,
        })
    : { ok: false, error: `不支持的绘画操作或目标无效：${operation || 'unknown'}` }
  recordSessionEvent(result.ok ? 'harness.action' : 'harness.action.error', {
    actionId: event?.actionId,
    action: semantic,
    result: { ok: Boolean(result.ok), error: result.error || null, strokes: result.strokes || 0 },
  })
  window.cosight?.sendHarnessActionResult?.({
    actionId: event?.actionId,
    ok: Boolean(result.ok),
    result,
    error: result.ok ? null : result.error,
  })
}

async function applyAgentWriting(payload) {
  if (!writingRef.current || !screenSharingRef.current) {
    return { ok: false, error: '写字能力未启用或当前没有分享屏幕。' }
  }
  if (sourceCaptureKind(screenSourceRef.current) !== 'screen') {
    return { ok: false, error: '写字覆盖层只支持整屏捕获；窗口捕获无法安全显示文字。' }
  }
  const clear = Boolean(payload?.clear)
  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
  if (!clear && !text) return { ok: false, error: '写字内容不能为空。' }
  const caption = {
    text,
    x: clampNumber(payload?.x, 0, 1, 0.5),
    y: clampNumber(payload?.y, 0, 1, 0.88),
    fontSize: clampNumber(payload?.fontSize, 16, 96, 36),
    color: isHexColor(payload?.color) ? payload.color : '#ffffff',
    backgroundColor: isHexColor(payload?.backgroundColor) ? payload.backgroundColor : '#111827',
    backgroundOpacity: clampNumber(payload?.backgroundOpacity, 0, 1, 0.82),
    maxWidth: clampNumber(payload?.maxWidth, 0.2, 0.95, 0.82),
    durationMs: clampNumber(payload?.durationMs, 0, 60000, 5000),
  }
  return displayCaptionOnOverlay(caption, clear, 'writing')
}

async function displayCaptionOnOverlay(caption, clear = false, layer = 'writing') {
  if (!screenSharingRef.current || sourceCaptureKind(screenSourceRef.current) !== 'screen') {
    return { ok: false, error: '字幕覆盖层只支持整屏捕获；当前没有可用的整屏覆盖层。' }
  }
  const isCoreLayer = layer === 'core'
  const captionRef = isCoreLayer ? coreCaptionRef : writingCaptionRef
  const timerRef = isCoreLayer ? coreCaptionTimerRef : writingCaptionTimerRef
  const result = await window.cosight?.showCaptionOnOverlay?.({ ...caption, clear, layer })
  if (!result?.ok) return result || { ok: false, error: '字幕窗口尚未准备好。' }
  if (timerRef.current) window.clearTimeout(timerRef.current)
  timerRef.current = null
  captionRef.current = clear || !caption?.text ? null : caption
  if (captionRef.current && caption.durationMs > 0) {
    timerRef.current = window.setTimeout(() => {
      captionRef.current = null
      timerRef.current = null
      clearCaptionOverlay(layer)
    }, caption.durationMs)
  }
  return {
    ok: true,
    cleared: clear,
    displayed: Boolean(captionRef.current?.text),
    // Captions are rendered in an OS-protected overlay window. They remain
    // visible to the user but are intentionally absent from screen frames
    // sent to the visual model.
    captionIncludedInNextScreenFrame: false,
  }
}

function clearCaptionOverlay(layer) {
  if (!screenSharingRef.current || sourceCaptureKind(screenSourceRef.current) !== 'screen') return
  void window.cosight?.showCaptionOnOverlay?.({ clear: true, layer })
}

function scheduleCoreCaptionClearAtPlaybackEnd(playbackEndAt = null, clearWhenNoPlayback = true) {
  if (!coreCaptionRef.current) return
  if (coreCaptionTimerRef.current) window.clearTimeout(coreCaptionTimerRef.current)
  const playback = audioPlaybackRef.current
  const hasPendingPlayback = Number.isFinite(playbackEndAt)
    || Boolean(playback?.context && Number.isFinite(playback.nextTime) && playback.nextTime > playback.context.currentTime + 0.02)
  if (!hasPendingPlayback) {
    if (!clearWhenNoPlayback) return
    coreCaptionRef.current = null
    clearCaptionOverlay('core')
    return
  }
  const contextEndAt = playback?.context && Number.isFinite(playback.nextTime)
    ? Date.now() + Math.max(0, (playback.nextTime - playback.context.currentTime) * 1000)
    : Date.now()
  const endAt = Number.isFinite(playbackEndAt) ? Math.max(playbackEndAt, contextEndAt) : contextEndAt
  const delayMs = Math.max(0, Math.ceil(endAt - Date.now())) + 80
  coreCaptionTimerRef.current = window.setTimeout(() => {
    coreCaptionTimerRef.current = null
    coreCaptionRef.current = null
    clearCaptionOverlay('core')
  }, delayMs)
}

async function showCoreCaption(text) {
  if (!coreSubtitlesRef.current || !screenSharingRef.current || sourceCaptureKind(screenSourceRef.current) !== 'screen' || !speakingRef.current) return
  const normalized = transcriptText(text).trim()
  if (!normalized) return
  const visibleText = normalized.length > 500 ? `…${normalized.slice(-500)}` : normalized
  try {
    await displayCaptionOnOverlay({
      text: visibleText,
      x: 0.5,
      y: 0.88,
      fontSize: 36,
      color: '#ffffff',
      backgroundColor: '#111827',
      backgroundOpacity: 0.82,
      maxWidth: 0.82,
      // Core subtitles follow the actual audio playback queue. They are
      // cleared by scheduleCoreCaptionClearAtPlaybackEnd(), not by a fixed
      // wall-clock timeout while the agent is still speaking.
      durationMs: 0,
    }, false, 'core')
    scheduleCoreCaptionClearAtPlaybackEnd(null, false)
  } catch (error) {
    window.cosight?.reportRendererError?.({
      phase: 'core.subtitles',
      error: { name: error.name, message: error.message, stack: error.stack },
    })
  }
}

useEffect(() => {
  // The chat page owns the preview element. Navigating to another page
  // unmounts that element while the capture stream intentionally remains
  // alive, so bind the existing stream again whenever the chat page returns.
  if (activeNav !== 'chatSession' || !screenSharing || !screenStreamRef.current) return undefined
  const stream = screenStreamRef.current
  let cancelled = false
  attachScreenPreview(stream).catch((error) => {
    if (cancelled || screenStreamRef.current !== stream) return
    stopScreenShare()
    setNotice(t('notices.previewFailed', { message: error.message }))
  }).then(() => {
    if (!cancelled && screenStreamRef.current === stream) setScreenLoading(false)
  })
  return () => {
    cancelled = true
  }
}, [activeNav, screenSharing, t])

useEffect(() => {
  const canvas = drawingCanvasRef.current
  const stage = canvas?.parentElement
  if (!canvas || !stage || !screenSharing || !useTransparentCanvas) return undefined
  const resize = () => window.requestAnimationFrame(resizeDrawingCanvas)
  const observer = window.ResizeObserver ? new ResizeObserver(resize) : null
  observer?.observe(stage)
  window.addEventListener('resize', resize)
  screenVideoRef.current?.addEventListener('loadedmetadata', resize)
  resize()
  return () => {
    observer?.disconnect()
    window.removeEventListener('resize', resize)
    screenVideoRef.current?.removeEventListener('loadedmetadata', resize)
  }
}, [screenSharing, screenCaptureKind, useTransparentCanvas])

useEffect(() => {
  if (!screenSharing || !screenSourceRef.current) return undefined
  if (screenCaptureKind === 'screen' && (useTransparentCanvas || useWritingAbility || coreSubtitlesEnabled || seeBboxDebugEnabled)) {
    void window.cosight?.showOverlay?.(screenSourceRef.current)
    if (!seeBboxDebugEnabled) void window.cosight?.drawOnOverlay?.({ debugBoxes: [] })
    if (!useTransparentCanvas) drawingStrokesRef.current = []
    if (!useWritingAbility) {
      writingCaptionRef.current = null
      if (writingCaptionTimerRef.current) window.clearTimeout(writingCaptionTimerRef.current)
      writingCaptionTimerRef.current = null
      void window.cosight?.showCaptionOnOverlay?.({ clear: true, layer: 'writing' })
    }
    if (!coreSubtitlesEnabled) {
      coreCaptionRef.current = null
      if (coreCaptionTimerRef.current) window.clearTimeout(coreCaptionTimerRef.current)
      coreCaptionTimerRef.current = null
      void window.cosight?.showCaptionOnOverlay?.({ clear: true, layer: 'core' })
    }
    return undefined
  }
  drawingStrokesRef.current = []
  writingCaptionRef.current = null
  coreCaptionRef.current = null
  if (writingCaptionTimerRef.current) window.clearTimeout(writingCaptionTimerRef.current)
  if (coreCaptionTimerRef.current) window.clearTimeout(coreCaptionTimerRef.current)
  writingCaptionTimerRef.current = null
  coreCaptionTimerRef.current = null
  void window.cosight?.hideOverlay?.()
  return undefined
}, [screenSharing, screenCaptureKind, useTransparentCanvas, useWritingAbility, coreSubtitlesEnabled, seeBboxDebugEnabled])

function stopAllCapture() {
  stopScreenShare()
  stopMicrophone()
  void window.cosight?.stopSystemAudioCapture?.()
  window.clearInterval(elapsedTimerRef.current)
}

async function startChat() {
  if (screenLoading) {
    setNotice(t('screen.loading'))
    return
  }
  setIsStarting(true)
  lastBridgeErrorRef.current = ''
  assistantDraftRef.current = ''
  assistantToolResponseRef.current = false
  setAssistantDraft('')
  try {
    if (modelMode === 'harness') {
      if (!harnessReady) {
        setNotice(t('notices.harnessModelsFirst'))
        return
      }
    } else {
      if (!selectedModel) {
        setNotice(t('notices.addModelFirst'))
        return
      }
      if (!selectedModel.hasApiKey) {
        setNotice(t('notices.apiKeyFirst'))
        return
      }
    }
    const contextToInject = importedContext && !importedContext.consumed
      ? {
          messages: importedContext.artifact.messages,
          capabilityCalls: importedContext.artifact.capabilityCalls,
          conversationSummary: normalizeConversationSummary(importedContext.artifact.conversationSummary),
        }
      : null
    const startingConversationSummary = contextToInject
      ? contextToInject.conversationSummary
      : normalizeConversationSummary(conversationSummary)
    currentSessionIdRef.current = makeSessionId()
    connectionRef.current = 'Connecting'
    audioFrameSentRef.current = false
    if (audioInputModeRef.current === 'system') {
      await startAudioInput('system')
    } else if (!micStreamRef.current) {
      await startMicrophone()
    }
    const effectiveInitiative = initiativeActive
    const overlayEnabledForSession = screenSharing && screenCaptureKind === 'screen'
    const result = await window.cosight?.startSession?.({
      mode: modelMode,
      modelId: selectedModel?.id || '',
      roleId: selectedRoleId,
      screenSharing: Boolean(screenSharing),
      screenVisionEnabled,
      seeMaxObjects,
      listeningEnabled,
      speakingEnabled,
      turnDetectionSilenceDurationMs,
      // A window capture has window-local coordinates and cannot safely use
      // the full-display transparent overlay. The runtime guard also keeps
      // this invariant if the capture source changes during a session.
      canvasEnabled: useTransparentCanvas && overlayEnabledForSession,
      writingEnabled: useWritingAbility && overlayEnabledForSession,
      subtitlesEnabled: coreSubtitlesEnabled && overlayEnabledForSession,
      initiativeEnabled: effectiveInitiative,
      importedContext: contextToInject,
      conversationSummary: startingConversationSummary,
    })
    if (!result?.ok) {
      setNotice(result?.error || t('notices.bridgeStartFailed'))
      return
    }
    if (contextToInject) setImportedContext((current) => current ? { ...current, consumed: true } : current)
    setConnection('Connecting')
    setElapsed(0)
  } catch (error) {
    setNotice(t('notices.microphoneStartFailed', { message: error.message }))
  } finally {
    setIsStarting(false)
  }
}

function clearConversationContext() {
  if (assistantTurnFlushTimerRef.current) {
    window.clearTimeout(assistantTurnFlushTimerRef.current)
    assistantTurnFlushTimerRef.current = null
  }
  assistantDraftRef.current = ''
  assistantTurnTextRef.current = ''
  assistantToolResponseRef.current = false
  setAssistantDraft('')
  setTranscript([])
  setConversationSummary(emptyConversationSummary())
  setImportedContext(null)
  window.cosight?.clearConversationContext?.()
  recordSessionEvent('conversation.context.cleared')
}

async function stopChat() {
  flushAssistantTurn()
  await window.cosight?.stopSession?.()
  connectionRef.current = 'Disconnected'
  audioFrameSentRef.current = false
  stopMicrophone()
  void window.cosight?.stopSystemAudioCapture?.()
  window.clearInterval(elapsedTimerRef.current)
  lastBridgeErrorRef.current = ''
  assistantDraftRef.current = ''
  assistantToolResponseRef.current = false
  assistantAudioUntilRef.current = 0
  setTextInput('')
  setTextSending(false)
  setAssistantDraft('')
  setConnection('Disconnected')
}

async function submitTextMessage(event) {
  event?.preventDefault?.()
  const text = textInput.trim()
  if (!text || textSending) return
  if (!isConnected) {
    setNotice(t('transcript.textInputDisconnected'))
    return
  }
  if (!window.cosight?.sendTextMessage) {
    setNotice(t('transcript.textInputUnavailable'))
    return
  }
  setTextSending(true)
  try {
    const result = await window.cosight.sendTextMessage(text)
    if (!result?.ok) {
      setNotice(result?.error || t('transcript.textInputFailed'))
      return
    }
    recordSessionEvent('listen.text.sent', { textBytes: text.length })
    setTextInput('')
  } catch (error) {
    setNotice(error.message || t('transcript.textInputFailed'))
  } finally {
    setTextSending(false)
  }
}

function resetModelTestState() {
  modelTestRequestRef.current += 1
  modelTestAbortRef.current?.abort()
  modelTestAbortRef.current = null
  cancelRendererModelTest(modelTestActiveRequestIdRef)
  setModelTestState('idle')
  setModelTestResult(null)
}

function closeModelEditor() {
  resetModelTestState()
  setModelEditorOpen(false)
}

function openNewModel() {
  setModelDraft({ id: '', alias: '', name: '', url: DEFAULT_REALTIME_URL, apiKey: '' })
  setModelApiKeyVisible(false)
  resetModelTestState()
  setModelEditorOpen(true)
}

function openEditModel(model = selectedModel) {
  if (!model) return
  setModelDraft({ id: model.id, alias: model.alias || '', name: model.name, url: model.url, apiKey: '' })
  setModelApiKeyVisible(false)
  resetModelTestState()
  setModelEditorOpen(true)
}

async function testModelConfig() {
  const requestSequence = modelTestRequestRef.current + 1
  modelTestRequestRef.current = requestSequence
  modelTestAbortRef.current?.abort()
  cancelRendererModelTest(modelTestActiveRequestIdRef)
  const controller = new AbortController()
  modelTestAbortRef.current = controller
  const requestId = `model-test-${requestSequence}`
  modelTestActiveRequestIdRef.current = requestId
  controller.signal.addEventListener('abort', () => {
    if (modelTestActiveRequestIdRef.current === requestId) cancelRendererModelTest(modelTestActiveRequestIdRef)
  }, { once: true })
  const draftAtRequest = { ...modelDraft }
  const draftSignatureAtRequest = JSON.stringify(draftAtRequest)
  setModelTestState('testing')
  setModelTestResult(null)
  try {
    const result = await window.cosight?.testModel?.(draftAtRequest, requestId)
    if (controller.signal.aborted || modelTestRequestRef.current !== requestSequence || modelTestLatestDraftSignatureRef.current !== draftSignatureAtRequest) return
    if (!result?.ok) {
      setModelTestState('error')
      setModelTestResult({ error: result?.error || t('model.testFailed') })
      return
    }
    setModelTestState('success')
    setModelTestResult({})
  } catch (error) {
    if (controller.signal.aborted || modelTestRequestRef.current !== requestSequence || modelTestLatestDraftSignatureRef.current !== draftSignatureAtRequest) return
    setModelTestState('error')
    setModelTestResult({ error: error.message || t('model.testFailed') })
  } finally {
    if (modelTestRequestRef.current === requestSequence) {
      modelTestAbortRef.current = null
      if (modelTestActiveRequestIdRef.current === requestId) modelTestActiveRequestIdRef.current = ''
    }
  }
}
async function saveModel() {
  const result = await window.cosight?.saveModel?.(modelDraft)
  if (!result?.ok) {
    setNotice(result?.error || t('notices.modelSaveFailed'))
    return
  }
  setModels((current) => {
    const next = current.filter((model) => model.id !== result.model.id)
    return [...next, result.model]
  })
  setSelectedModelId(result.selectedModelId || result.model.id)
  closeModelEditor()
  setNotice(t('notices.modelSaved'))
}

async function changeModelMode(nextMode) {
  if (isChatActive || nextMode === modelMode) return
  const result = await window.cosight?.setModelMode?.(nextMode)
  if (!result?.ok) {
    setNotice(result?.error || t('notices.modelModeSaveFailed'))
    return
  }
  setModelMode(nextMode)
  closeModelEditor()
  closeHarnessModelEditor()
}

function openHarnessModelEditor(module, model = harnessModels[module]) {
  closeHarnessModelEditor()
  const isRealtime = module === 'listen' || module === 'speak'
  setHarnessEditorModule(module)
  setHarnessModelDraft({
    id: model?.id || '',
    module,
    alias: model?.alias || '',
    name: model?.name || (module === 'listen' ? 'qwen3-asr-flash-realtime' : module === 'speak' ? 'qwen3-tts-flash-realtime' : ''),
    url: model?.url || (isRealtime ? DEFAULT_REALTIME_URL : DEFAULT_HARNESS_HTTP_URL),
    voice: model?.voice || '',
    apiKey: '',
  })
  setHarnessApiKeyVisible(false)
  setHarnessTestState('idle')
  setHarnessTestResult(null)
}

async function testHarnessModelConfig() {
  const requestSequence = harnessTestRequestRef.current + 1
  harnessTestRequestRef.current = requestSequence
  harnessTestAbortRef.current?.abort()
  cancelRendererModelTest(harnessTestActiveRequestIdRef)
  const controller = new AbortController()
  harnessTestAbortRef.current = controller
  const requestId = `harness-test-${requestSequence}`
  harnessTestActiveRequestIdRef.current = requestId
  controller.signal.addEventListener('abort', () => {
    if (harnessTestActiveRequestIdRef.current === requestId) cancelRendererModelTest(harnessTestActiveRequestIdRef)
  }, { once: true })
  const draftAtRequest = harnessModelDraft ? { ...harnessModelDraft } : null
  const draftSignatureAtRequest = JSON.stringify(draftAtRequest)
  setHarnessTestState('testing')
  setHarnessTestResult(null)
  try {
    const result = await window.cosight?.testHarnessModel?.(draftAtRequest, requestId)
    if (controller.signal.aborted || harnessTestRequestRef.current !== requestSequence || harnessTestLatestDraftSignatureRef.current !== draftSignatureAtRequest) return
    if (!result?.ok) {
      setHarnessTestState('error')
      setHarnessTestResult({ error: result?.error || t('model.testFailed') })
      return
    }
    setHarnessTestState('success')
    setHarnessTestResult({})
  } catch (error) {
    if (controller.signal.aborted || harnessTestRequestRef.current !== requestSequence || harnessTestLatestDraftSignatureRef.current !== draftSignatureAtRequest) return
    setHarnessTestState('error')
    setHarnessTestResult({ error: error.message || t('model.testFailed') })
  } finally {
    if (harnessTestRequestRef.current === requestSequence) {
      harnessTestAbortRef.current = null
      if (harnessTestActiveRequestIdRef.current === requestId) harnessTestActiveRequestIdRef.current = ''
    }
  }
}

async function saveHarnessModel() {
  const result = await window.cosight?.saveHarnessModel?.(harnessModelDraft)
  if (!result?.ok) {
    setNotice(result?.error || t('notices.harnessModelSaveFailed'))
    return
  }
  setHarnessModels((current) => ({ ...current, [result.module]: result.model }))
  closeHarnessModelEditor()
  setNotice(t('notices.harnessModelSaved'))
}

async function saveHarnessSettings(nextSettings) {
  const result = await window.cosight?.saveHarnessSettings?.(nextSettings)
  if (!result?.ok) {
    setNotice(result?.error || t('notices.harnessSettingsSaveFailed'))
    return result || { ok: false }
  }
  setHarnessSettings({ ...DEFAULT_HARNESS_SETTINGS, ...(result.harnessSettings || nextSettings) })
  return result
}

function closeHarnessModelEditor() {
  harnessTestRequestRef.current += 1
  harnessTestAbortRef.current?.abort()
  harnessTestAbortRef.current = null
  cancelRendererModelTest(harnessTestActiveRequestIdRef)
  setHarnessTestState('idle')
  setHarnessTestResult(null)
  setHarnessEditorModule('')
  setHarnessModelDraft(null)
}

async function deleteHarnessModel(module) {
  const model = harnessModels[module]
  if (!model || !window.confirm(t('harness.deleteConfirm', { name: model.alias || model.name }))) return
  const result = await window.cosight?.deleteHarnessModel?.(module)
  if (!result?.ok) {
    setNotice(result?.error || t('notices.harnessModelDeleteFailed'))
    return
  }
  setHarnessModels((current) => ({ ...current, [module]: null }))
  setNotice(t('notices.harnessModelDeleted'))
}

async function selectModel(modelId) {
  setSelectedModelId(modelId)
  if (!modelId) return
  const result = await window.cosight?.selectModel?.(modelId)
  if (result && !result.ok) setNotice(result.error || t('notices.modelSelectFailed'))
}

async function deleteSelectedModel(model = selectedModel) {
  if (!model || !window.confirm(t('model.deleteConfirm', { name: model.alias || model.name }))) return
  const result = await window.cosight?.deleteModel?.(model.id)
  if (!result?.ok) {
    setNotice(result?.error || t('notices.modelDeleteFailed'))
    return
  }
  const nextModels = models.filter((item) => item.id !== model.id)
  setModels(nextModels)
  setSelectedModelId(result.selectedModelId || (selectedModelId === model.id ? nextModels[0]?.id || '' : selectedModelId))
  setNotice(t('notices.modelDeleted'))
}

function openNewEmbeddingModel(type = 'cloud') {
  setEmbeddingModelDraft(emptyEmbeddingModelDraft(type))
  setEmbeddingApiKeyVisible(false)
  setEmbeddingTestState('idle')
  setEmbeddingTestResult(null)
  setEmbeddingEditorOpen(true)
}

function openEditEmbeddingModel(model) {
  if (!model) return
  setEmbeddingModelDraft({
    ...emptyEmbeddingModelDraft(model.type),
    id: model.id,
    type: model.type || 'cloud',
    alias: model.alias || '',
    model: model.model || '',
    url: model.url || '',
    dimensions: model.dimensions ? String(model.dimensions) : '',
    apiKey: '',
  })
  setEmbeddingApiKeyVisible(false)
  setEmbeddingTestState('idle')
  setEmbeddingTestResult(null)
  setEmbeddingEditorOpen(true)
}

async function testEmbeddingModelConfig() {
  setEmbeddingTestState('testing')
  setEmbeddingTestResult(null)
  try {
    const result = await window.cosight?.testEmbeddingModel?.(embeddingModelDraft)
    if (!result?.ok) {
      setEmbeddingTestState('error')
      setEmbeddingTestResult({ error: result?.error || t('embeddings.testFailed') })
      return
    }
    setEmbeddingTestState('success')
    setEmbeddingTestResult({ dimensions: result.dimensions })
    if (!embeddingModelDraft.dimensions && result.dimensions) {
      setEmbeddingModelDraft((current) => ({ ...current, dimensions: String(result.dimensions) }))
    }
  } catch (error) {
    setEmbeddingTestState('error')
    setEmbeddingTestResult({ error: error.message || t('embeddings.testFailed') })
  }
}

async function saveEmbeddingModel() {
  const result = await window.cosight?.saveEmbeddingModel?.(embeddingModelDraft)
  if (!result?.ok) {
    setNotice(result?.error || t('notices.embeddingModelSaveFailed'))
    return
  }
  setEmbeddingModels((current) => {
    const next = current.filter((model) => model.id !== result.model.id)
    return [...next, result.model]
  })
  setEmbeddingEditorOpen(false)
  setEmbeddingTestState('idle')
  setEmbeddingTestResult(null)
  setNotice(t('notices.embeddingModelSaved'))
}

async function deleteEmbeddingModel(model) {
  if (!model || !window.confirm(t('embeddings.deleteConfirm', { name: model.alias || model.model }))) return
  const result = await window.cosight?.deleteEmbeddingModel?.(model.id)
  if (!result?.ok) {
    setNotice(result?.error || t('notices.embeddingModelDeleteFailed'))
    return
  }
  setEmbeddingModels((current) => current.filter((item) => item.id !== model.id))
  if (embeddingModelDraft.id === model.id) setEmbeddingEditorOpen(false)
  setNotice(t('notices.embeddingModelDeleted'))
}

function openNewRole(returnNav = 'roles') {
  if (isChatActive) return
  setRoleDraft(emptyRoleDraft())
  setRoleEditorReturnNav(returnNav)
  setRoleEditorOpen(true)
  setActiveNav('roles')
}

function openEditRole(role) {
  if (!role || isChatActive) return
  const abilities = [...(role.abilities || [])]
  const legacyLanguage = role.language || 'auto'
  setRoleDraft({ ...emptyRoleDraft(), ...role, listeningLanguage: role.listeningLanguage || legacyLanguage, outputLanguage: role.outputLanguage || legacyLanguage, speechStyle: typeof role.speechStyle === 'string' ? role.speechStyle : '', avatarRemoved: false, abilities, drawingPolicy: abilities.includes('drawing') ? (role.drawingPolicy || role.writingPolicy || role.subtitlesPolicy || '') : '', writingPolicy: role.writingPolicy || role.subtitlesPolicy || '', screenVisionIntervalSec: abilities.includes('screenVision') ? String(role.screenVisionIntervalSec || DEFAULT_SCREEN_VISION_INTERVAL_SECONDS) : '', screenVisionChangeThreshold: abilities.includes('screenVision') ? String(role.screenVisionChangeThreshold || DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD) : '', initiativeTimeoutSec: abilities.includes('initiative') ? (role.initiativeTimeoutSec || '10') : '', initiativePrompt: abilities.includes('initiative') ? (role.initiativePrompt || '') : '', knowledgeFiles: [...(role.knowledgeFiles || [])], knowledgeMode: role.knowledgeMode || 'prompt', knowledgeRetrievalMode: role.knowledgeRetrievalMode || 'fast', embeddingModelId: role.embeddingModelId || '', knowledgeStatus: role.knowledgeStatus || null })
  setRoleEditorReturnNav('roles')
  setRoleEditorOpen(true)
  setActiveNav('roles')
}

async function discardRoleKnowledgeBuild() {
  if (!roleDraft.id) return
  try {
    await window.cosight?.discardRoleKnowledgeBuild?.({
      roleId: roleDraft.id,
      knowledgeBuildId: roleDraft.knowledgeBuildId || '',
    })
  } catch {
    // Cleanup is best effort; the main process also removes stale staging data on startup.
  }
}

async function closeRoleEditor() {
  await discardRoleKnowledgeBuild()
  setRoleEditorOpen(false)
  setActiveNav(roleEditorReturnNav)
}

async function previewRolePrompt(draft) {
  setRolePromptPreviewOpen(true)
  setRolePromptPreviewLoading(true)
  setRolePromptPreview('')
  let result
  try {
    result = await window.cosight?.previewRolePrompt?.(draft)
  } catch (error) {
    result = { ok: false, error: error.message }
  }
  setRolePromptPreviewLoading(false)
  if (!result?.ok) {
    setRolePromptPreviewOpen(false)
    setNotice(result?.error || t('notices.rolePromptPreviewFailed', { message: '' }))
    return
  }
  setRolePromptPreview(result.prompt || '')
}

async function saveRole() {
  if (!roleDraft.name.trim()) {
    setNotice(t('notices.roleNameRequired'))
    return
  }
  const roleToSave = modelMode === 'harness'
    ? roleDraft
    : { ...roleDraft, knowledgeRetrievalMode: 'fast' }
  const result = await window.cosight?.saveRole?.(roleToSave)
  if (!result?.ok) {
    setNotice(result?.error || t('notices.roleSaveFailed'))
    return
  }
  setRoles((current) => {
    const next = current.filter((role) => role.id !== result.role.id)
    return [result.role, ...next]
  })
  if (selectedRoleId !== result.role.id) setConversationSummary(emptyConversationSummary())
  const selection = await window.cosight?.selectRole?.(result.role.id)
  setSelectedRoleId(selection?.selectedRoleId || result.role.id)
  setRoleEditorOpen(false)
  setActiveNav(roleEditorReturnNav)
  setNotice(t('notices.roleSaved'))
}

async function reindexRoleKnowledge(roleInput) {
  const requestedRoleId = typeof roleInput === 'string' ? roleInput.trim() : (roleInput?.id || '')
  let result
  try {
    result = await window.cosight?.reindexRoleKnowledge?.(roleInput)
  } catch (error) {
    result = { ok: false, error: error.message }
  }
  if (!result?.ok) {
    setNotice(result?.error || t('notices.knowledgeReindexFailed'))
    return false
  }
  const status = result.status || { status: 'indexing' }
  const roleId = result.roleId || requestedRoleId
  if (!result.knowledgeBuildId) setRoles((current) => current.map((role) => role.id === roleId ? { ...role, knowledgeStatus: status } : role))
  setRoleDraft((current) => {
    if (current.id && current.id !== requestedRoleId && current.id !== roleId) return current
    return {
      ...current,
      id: roleId || current.id,
      knowledgeStatus: status,
      knowledgeBuildId: result.knowledgeBuildId || '',
      knowledgeFiles: Array.isArray(result.knowledgeFiles) ? result.knowledgeFiles : current.knowledgeFiles,
    }
  })
  setNotice(t('notices.knowledgeBuildCompleted'))
  return true
}

async function selectRole(roleId) {
  if (isChatActive) return
  if (selectedRoleId !== roleId) setConversationSummary(emptyConversationSummary())
  setSelectedRoleId(roleId)
  const result = await window.cosight?.selectRole?.(roleId)
  if (result && !result.ok) setNotice(result.error || t('notices.roleSelectFailed'))
}

async function deleteRole(role) {
  if (!role || isChatActive || !window.confirm(t('roles.deleteConfirm', { name: role.name }))) return
  const result = await window.cosight?.deleteRole?.(role.id)
  if (!result?.ok) {
    setNotice(result?.error || t('notices.roleDeleteFailed'))
    return
  }
  setRoles((current) => current.filter((item) => item.id !== role.id))
  if (selectedRoleId === role.id) setConversationSummary(emptyConversationSummary())
  setSelectedRoleId(result.selectedRoleId || '')
  setNotice(t('notices.roleDeleted'))
}

async function changeOutput(deviceId) {
  setSelectedOutput(deviceId)
  const context = audioPlaybackRef.current?.context
  if (context?.setSinkId && deviceId) await context.setSinkId(deviceId)
}

function playPcm(base64) {
  let playback = audioPlaybackRef.current
  if (!playback) {
    const context = new AudioContext()
    const outputGain = context.createGain()
    outputGain.gain.value = outputVolumeRef.current / 100
    outputGain.connect(context.destination)
    playback = { context, outputGain, nextTime: context.currentTime }
    audioPlaybackRef.current = playback
  }
  if (!playback.outputGain) {
    const outputGain = playback.context.createGain()
    outputGain.gain.value = outputVolumeRef.current / 100
    outputGain.connect(playback.context.destination)
    playback.outputGain = outputGain
  }
  const { context, outputGain } = playback
  const binary = atob(base64)
  const pcm = new Int16Array(binary.length / 2)
  for (let i = 0; i < pcm.length; i += 1) pcm[i] = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8)
  const buffer = context.createBuffer(1, pcm.length, 24000)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(outputGain)
  const startAt = Math.max(context.currentTime, playback.nextTime)
  const endAt = startAt + buffer.duration
  source.start(startAt)
  playback.nextTime = endAt
  return Date.now() + Math.max(0, Math.round((endAt - context.currentTime) * 1000))
}

function toggleNav(key) {
  if (roleEditorOpen && key !== 'roles') void discardRoleKnowledgeBuild()
  setActiveNav(key)
  if (key === 'chatSession' || key === 'abilities' || key === 'roles' || key === 'models' || key === 'embeddings' || key === 'usage' || key === 'settings') {
    closeModelEditor()
    closeHarnessModelEditor()
  }
}

const isConnected = connection === 'Connected'
const isChatActive = connection === 'Connecting' || isConnected
const captureLockedDuringConnection = connection === 'Connecting'
const connectionLabel = {
  Disconnected: t('status.disconnected'),
  Connecting: t('status.connecting'),
  Connected: t('status.connected'),
  'Bridge error': t('status.bridgeError'),
}[connection] || connection
const startChatBlockedReason = modelMode === 'harness'
  ? (!harnessReady ? t('notices.harnessModelsFirst') : '')
  : (!selectedModel
    ? t('notices.addModelFirst')
    : !selectedModel.hasApiKey
      ? t('notices.apiKeyFirst')
      : '')

useEffect(() => {
  window.clearInterval(initiativeSilenceTimerRef.current)
  initiativeSilenceTimerRef.current = null
  initiativeResponsePendingRef.current = false
  if (!isConnected || !initiativeActive) return undefined

  markInitiativeActivity()
  const timeoutValue = Number.parseInt(selectedRole?.initiativeTimeoutSec || '10', 10)
  const timeoutMs = Math.min(300000, Math.max(5000, (Number.isFinite(timeoutValue) ? timeoutValue : 10) * 1000))
  window.cosight?.reportRendererEvent?.({ type: 'initiative.timer.started', roleId: selectedRole?.id || 'default', timeoutMs })
  initiativeSilenceTimerRef.current = window.setInterval(() => {
    if (initiativeResponsePendingRef.current || !connectionRef.current.includes('Connected')) return
    if (Date.now() - lastInitiativeActivityRef.current < timeoutMs) return
    initiativeResponsePendingRef.current = true
    markInitiativeActivity()
    const prompt = selectedRole?.initiativePrompt?.trim() || 'Continue the conversation with a brief, context-aware question or useful next step.'
    const triggerInitiative = window.cosight?.triggerInitiative
    window.cosight?.reportRendererEvent?.({ type: 'initiative.trigger.requested', roleId: selectedRole?.id || 'default', silenceMs: timeoutMs, promptLength: prompt.length })
    if (typeof triggerInitiative !== 'function') {
      initiativeResponsePendingRef.current = false
      markInitiativeActivity()
      setNotice(t('notices.initiativeTriggerFailed'))
      return
    }
    void Promise.resolve(triggerInitiative(prompt)).then((result) => {
      if (!result?.ok) {
        window.cosight?.reportRendererError?.({ phase: 'initiative.trigger', error: { message: result?.error || t('notices.initiativeTriggerFailed') } })
        initiativeResponsePendingRef.current = false
        markInitiativeActivity()
        setNotice(result?.error || t('notices.initiativeTriggerFailed'))
      }
    }).catch((error) => {
      initiativeResponsePendingRef.current = false
      markInitiativeActivity()
      setNotice(t('notices.initiativeTriggerFailedWithMessage', { message: error.message }))
    })
  }, 250)
  return () => {
    window.clearInterval(initiativeSilenceTimerRef.current)
    initiativeSilenceTimerRef.current = null
    initiativeResponsePendingRef.current = false
  }
}, [isConnected, initiativeActive, selectedRole?.id, selectedRole?.initiativeTimeoutSec, selectedRole?.initiativePrompt, t])
  return {
    activeNav, setActiveNav, language, setLanguage,
    models, setModels, selectedModelId, setSelectedModelId, modelMode, setModelMode,
    harnessModels, setHarnessModels, harnessSettings, setHarnessSettings,
    harnessEditorModule, setHarnessEditorModule, harnessModelDraft, setHarnessModelDraft,
    harnessApiKeyVisible, setHarnessApiKeyVisible, harnessTestState, harnessTestResult, modelEditorOpen, setModelEditorOpen,
    embeddingModels, setEmbeddingModels, embeddingEditorOpen, setEmbeddingEditorOpen,
    embeddingModelDraft, setEmbeddingModelDraft, embeddingApiKeyVisible, setEmbeddingApiKeyVisible,
    embeddingTestState, embeddingTestResult,
    modelDraft, setModelDraft, modelApiKeyVisible, setModelApiKeyVisible, modelTestState, modelTestResult,
    roles, setRoles, selectedRoleId, setSelectedRoleId, roleEditorOpen, setRoleEditorOpen,
    roleDraft, setRoleDraft, rolePromptPreviewOpen, setRolePromptPreviewOpen,
    rolePromptPreviewLoading, rolePromptPreview, setRolePromptPreview, setRolePromptPreviewOpen,
    micDevices, outputDevices, selectedMic, setSelectedMic, audioInputMode, selectedOutput, setSelectedOutput,
    outputVolume, setOutputVolume, connection, setConnection, screenSharing, screenLoading,
    seeBboxDebugEnabled, setSeeBboxDebugEnabled,
    seeMaxObjects, setSeeMaxObjects,
    turnDetectionSilenceDurationMs, setTurnDetectionSilenceDurationMs,
    autoReconnect, setAutoReconnect, pushToTalk, setPushToTalk,
    allowInterruptions, setAllowInterruptions, liveTranscript, setLiveTranscript,
    coreSubtitlesEnabled, setCoreSubtitlesEnabled,
    screenVideoRef, micActive, micMuted, micLevel, elapsed, transcript, setTranscript,
    textInput, setTextInput, textSending, importedContext, setImportedContext, importLoading,
    conversationSummary, setConversationSummary,
    notice, setNotice, sourcePickerOpen, setSourcePickerOpen, sources, sourcesLoading,
    assistantDraft, isStarting, selectedModel, selectedRole, screenVisionEnabled,
    listeningEnabled, speakingEnabled, useTransparentCanvas, useWritingAbility,
    initiativeEnabled, initiativeActive, t, harnessReady, modelReady, deviceLabel,
    isConnected, isChatActive, captureLockedDuringConnection, connectionLabel,
    startChatBlockedReason,
    exportSessionArtifact, importSessionContext, openSourcePicker, shareSource,
    stopScreenShare, toggleMicrophoneMute, startChat, stopChat, clearConversationContext, submitTextMessage,
    openNewModel, openEditModel, saveModel, testModelConfig, closeModelEditor, changeModelMode, openHarnessModelEditor,
    closeHarnessModelEditor, saveHarnessModel, testHarnessModelConfig, saveHarnessSettings, deleteHarnessModel,
    openNewEmbeddingModel, openEditEmbeddingModel, saveEmbeddingModel, deleteEmbeddingModel,
    testEmbeddingModelConfig,
    selectModel, deleteSelectedModel, openNewRole, openEditRole, closeRoleEditor,
    previewRolePrompt, saveRole, reindexRoleKnowledge, selectRole, deleteRole, changeOutput, selectMicrophone, selectAudioInputMode,
    toggleNav,
  }
}
