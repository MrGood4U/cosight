import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Download,
  Eye,
  EyeOff,
  FileText,
  Languages,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Mic,
  MicOff,
  Monitor,
  MoreHorizontal,
  Pencil,
  Plus,
  Play,
  Radio,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  Upload,
  Volume2,
  X,
} from 'lucide-react'
import { createTranslator, getInitialLanguage, LANGUAGE_OPTIONS } from './i18n.js'

const DEFAULT_REALTIME_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime'
const ROLE_ABILITY_IDS = ['screenVision', 'listening', 'speaking', 'drawing', 'writing', 'initiative']
const DEFAULT_ROLE_ABILITY_IDS = ['screenVision', 'listening', 'speaking', 'drawing']
const NEW_ROLE_DEFAULT_ABILITY_IDS = ['screenVision', 'listening', 'speaking']
const ROLE_ABILITY_LABEL_KEYS = {
  screenVision: 'roles.abilityScreenVision',
  listening: 'roles.abilityListening',
  speaking: 'roles.abilitySpeaking',
  drawing: 'roles.abilityDrawing',
  writing: 'roles.abilityWriting',
  initiative: 'roles.abilityInitiative',
}
const ROLE_LANGUAGE_OPTIONS = [
  { value: 'auto', labelKey: 'roles.languageAuto' },
  { value: 'zh-CN', labelKey: 'language.chinese' },
  { value: 'en-US', labelKey: 'language.english' },
]
const ROLE_VOICE_OPTIONS = [
  { value: '', labelKey: 'roles.voiceDefault' },
  { value: 'Tina', label: 'Tina' },
  { value: 'Cindy', label: 'Cindy' },
  { value: 'Liora Mira', label: 'Liora Mira' },
  { value: 'Sunnybobi', label: 'Sunnybobi' },
  { value: 'Raymond', label: 'Raymond' },
  { value: 'Ethan', label: 'Ethan' },
  { value: 'Theo Calm', label: 'Theo Calm' },
  { value: 'Serena', label: 'Serena' },
  { value: 'Harvey', label: 'Harvey' },
  { value: 'Maia', label: 'Maia' },
  { value: 'Evan', label: 'Evan' },
  { value: 'Qiao', label: 'Qiao' },
  { value: 'Momo', label: 'Momo' },
  { value: 'Wil', label: 'Wil' },
  { value: 'Angel', label: 'Angel' },
  { value: 'Li Cassian', label: 'Li Cassian' },
  { value: 'Mia', label: 'Mia' },
  { value: 'Joyner', label: 'Joyner' },
  { value: 'Gold', label: 'Gold' },
  { value: 'Katerina', label: 'Katerina' },
  { value: 'Ryan', label: 'Ryan' },
  { value: 'Jennifer', label: 'Jennifer' },
  { value: 'Aiden', label: 'Aiden' },
  { value: 'Mione', label: 'Mione' },
  { value: 'Sunny', label: 'Sunny' },
  { value: 'Dylan', label: 'Dylan' },
  { value: 'Eric', label: 'Eric' },
  { value: 'Peter', label: 'Peter' },
  { value: 'Joseph Chen', label: 'Joseph Chen' },
  { value: 'Marcus', label: 'Marcus' },
  { value: 'Li', label: 'Li' },
  { value: 'Kiki', label: 'Kiki' },
  { value: 'Rocky', label: 'Rocky' },
  { value: 'Sohee', label: 'Sohee' },
  { value: 'Lenn', label: 'Lenn' },
  { value: 'Ono Anna', label: 'Ono Anna' },
  { value: 'Sonrisa', label: 'Sonrisa' },
  { value: 'Bodega', label: 'Bodega' },
  { value: 'Emilien', label: 'Emilien' },
  { value: 'Andre', label: 'Andre' },
  { value: 'Radio Gol', label: 'Radio Gol' },
  { value: 'Alek', label: 'Alek' },
  { value: 'Rizky', label: 'Rizky' },
  { value: 'Roya', label: 'Roya' },
  { value: 'Arda', label: 'Arda' },
  { value: 'Hana', label: 'Hana' },
  { value: 'Dolce', label: 'Dolce' },
  { value: 'Jakub', label: 'Jakub' },
  { value: 'Griet', label: 'Griet' },
  { value: 'Eliška', label: 'Eliška' },
  { value: 'Marina', label: 'Marina' },
  { value: 'Siiri', label: 'Siiri' },
  { value: 'Ingrid', label: 'Ingrid' },
  { value: 'Sigga', label: 'Sigga' },
  { value: 'Bea', label: 'Bea' },
  { value: 'Chloe', label: 'Chloe' },
]

const navItems = [
  { key: 'chatSession', labelKey: 'nav.chatSession', icon: Monitor },
  { key: 'abilities', labelKey: 'nav.abilities', icon: Sparkles },
  { key: 'roles', labelKey: 'nav.roles', icon: UserRound },
  { key: 'models', labelKey: 'nav.models', icon: Cpu },
  { key: 'settings', labelKey: 'nav.settings', icon: SettingsIcon },
]

function emptyRoleDraft() {
  return {
    id: '',
    name: '',
    identity: '',
    goal: '',
    corePrinciples: '',
    behavior: '',
    workflow: '',
    constraints: '',
    language: 'auto',
    voice: '',
    avatar: '',
    avatarName: '',
    avatarRemoved: false,
    drawingPolicy: '',
    writingPolicy: '',
    initiativeTimeoutSec: '10',
    initiativePrompt: '',
    abilities: [...NEW_ROLE_DEFAULT_ABILITY_IDS],
    knowledgeText: '',
    knowledgeFiles: [],
  }
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

function formatElapsed(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
  const remainder = String(seconds % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function transcriptText(value) {
  return typeof value === 'string' ? value : ''
}

function hasVisibleTranscriptText(value) {
  return transcriptText(value).trim().length > 0
}

const SESSION_ARTIFACT_FORMAT = 'cosight-session'
const SESSION_ARTIFACT_VERSION = 1
const MAX_SESSION_MESSAGES = 5000
const MAX_SESSION_EVENTS = 5000

function makeSessionId(prefix = 'session') {
  try {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
  } catch {
    // The fallback keeps exports usable in older Electron runtimes.
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function cloneSessionValue(value, maxLength = 16000) {
  try {
    const serialized = JSON.stringify(value)
    if (serialized.length <= maxLength) return JSON.parse(serialized)
    return { truncated: true, preview: serialized.slice(0, maxLength) }
  } catch {
    return { truncated: true, preview: String(value) }
  }
}

function sessionRoleSnapshot(role) {
  if (!role || typeof role !== 'object') return null
  return {
    id: typeof role.id === 'string' ? role.id : '',
    name: typeof role.name === 'string' ? role.name : '',
    identity: typeof role.identity === 'string' ? role.identity : '',
    goal: typeof role.goal === 'string' ? role.goal : '',
    corePrinciples: typeof role.corePrinciples === 'string' ? role.corePrinciples : '',
    behavior: typeof role.behavior === 'string' ? role.behavior : '',
    workflow: typeof role.workflow === 'string' ? role.workflow : '',
    constraints: typeof role.constraints === 'string' ? role.constraints : '',
    language: typeof role.language === 'string' ? role.language : 'auto',
    voice: typeof role.voice === 'string' ? role.voice : '',
    abilities: Array.isArray(role.abilities) ? role.abilities.filter((item) => typeof item === 'string') : [],
    drawingPolicy: typeof role.drawingPolicy === 'string' ? role.drawingPolicy : '',
    writingPolicy: typeof role.writingPolicy === 'string' ? role.writingPolicy : '',
    initiativeTimeoutSec: role.initiativeTimeoutSec ?? '',
    initiativePrompt: typeof role.initiativePrompt === 'string' ? role.initiativePrompt : '',
    knowledgeText: typeof role.knowledgeText === 'string' ? role.knowledgeText : '',
    knowledgeFiles: Array.isArray(role.knowledgeFiles)
      ? role.knowledgeFiles.map((file) => ({
          id: typeof file?.id === 'string' ? file.id : '',
          name: typeof file?.name === 'string' ? file.name : '',
          size: Number.isFinite(file?.size) ? file.size : 0,
          type: typeof file?.type === 'string' ? file.type : '',
        }))
      : [],
  }
}

function normalizeImportedSessionArtifact(value) {
  if (!value || typeof value !== 'object' || value.format !== SESSION_ARTIFACT_FORMAT || value.version !== SESSION_ARTIFACT_VERSION) {
    throw new Error('文件不是受支持的 Cosight 会话档案。')
  }
  if (!Array.isArray(value.messages)) throw new Error('会话档案缺少有效的消息列表。')
  const messages = value.messages.slice(0, MAX_SESSION_MESSAGES).map((item) => ({
    id: typeof item?.id === 'string' ? item.id : makeSessionId('message'),
    time: typeof item?.time === 'string' ? item.time : '00:00',
    timestamp: typeof item?.timestamp === 'string' ? item.timestamp : '',
    speaker: item?.speaker === 'You' ? 'You' : 'Cosight',
    text: transcriptText(item?.text).trim().slice(0, 20000),
    final: item?.final !== false,
    sessionId: typeof item?.sessionId === 'string' ? item.sessionId : '',
  })).filter((item) => item.text)
  const capabilityCalls = Array.isArray(value.capabilityCalls)
    ? value.capabilityCalls.slice(0, MAX_SESSION_EVENTS).map((item) => ({
        id: typeof item?.id === 'string' ? item.id : makeSessionId('event'),
        time: typeof item?.time === 'string' ? item.time : '00:00',
        timestamp: typeof item?.timestamp === 'string' ? item.timestamp : '',
        type: typeof item?.type === 'string' ? item.type : 'ability.event',
        payload: cloneSessionValue(item?.payload || {}, 12000),
      }))
    : []
  return {
    format: SESSION_ARTIFACT_FORMAT,
    version: SESSION_ARTIFACT_VERSION,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
    session: value.session && typeof value.session === 'object' ? {
      id: typeof value.session.id === 'string' ? value.session.id : '',
      elapsedSeconds: Number.isFinite(value.session.elapsedSeconds) ? value.session.elapsedSeconds : 0,
    } : { id: '', elapsedSeconds: 0 },
    role: sessionRoleSnapshot(value.role),
      model: value.model && typeof value.model === 'object' ? {
        id: typeof value.model.id === 'string' ? value.model.id : '',
        alias: typeof value.model.alias === 'string' ? value.model.alias : '',
        name: typeof value.model.name === 'string' ? value.model.name : '',
      url: typeof value.model.url === 'string' ? value.model.url : '',
    } : { id: '', name: '', url: '' },
    capabilities: value.capabilities && typeof value.capabilities === 'object' ? {
      screenVision: Boolean(value.capabilities.screenVision),
      listening: Boolean(value.capabilities.listening),
      speaking: Boolean(value.capabilities.speaking),
      drawing: Boolean(value.capabilities.drawing),
      writing: Boolean(value.capabilities.writing),
      subtitles: Boolean(value.capabilities.subtitles),
      initiative: Boolean(value.capabilities.initiative),
    } : {},
    messages,
    capabilityCalls,
  }
}

function normalizeDrawingStroke(stroke) {
  // The contract is { points: [...] }, but some realtime tool calls have
  // emitted a legacy shorthand of [[{x, y}, ...]]. Accept that shorthand at
  // the client boundary so a recoverable model formatting mistake does not
  // silently turn into a successful zero-stroke draw.
  const isPointArrayStroke = Array.isArray(stroke)
  const points = isPointArrayStroke
    ? stroke
    : (Array.isArray(stroke?.points) ? stroke.points : [])
  const style = isPointArrayStroke ? {} : stroke
  if (points.length < 2) return null
  const normalizedPoints = points.map((point) => {
    const rawX = Array.isArray(point) ? point[0] : point?.x
    const rawY = Array.isArray(point) ? point[1] : point?.y
    const x = Number(rawX)
    const y = Number(rawY)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return {
      x: clampNumber(x, 0, 1, 0.5),
      y: clampNumber(y, 0, 1, 0.5),
    }
  })
  if (normalizedPoints.some((point) => !point)) return null
  return {
    points: normalizedPoints,
    color: isHexColor(style?.color) ? style.color : '#ff4d6d',
    width: clampNumber(style?.width, 1, 24, 4),
    opacity: clampNumber(style?.opacity, 0.1, 1, 0.95),
  }
}

function sourceCaptureKind(source) {
  if (source?.captureKind === 'screen' || source?.type === 'screen' || source?.kind === 'screen') return 'screen'
  if (source?.captureKind === 'window' || source?.type === 'window' || source?.kind === 'window') return 'window'
  if (String(source?.id || '').startsWith('screen:')) return 'screen'
  if (String(source?.id || '').startsWith('window:')) return 'window'
  return 'unknown'
}

function normalizeSourceRect(sourceWidth, sourceHeight, sourceRect) {
  const left = clampNumber(sourceRect?.left, 0, Math.max(0, sourceWidth - 1), 0)
  const top = clampNumber(sourceRect?.top, 0, Math.max(0, sourceHeight - 1), 0)
  const width = Math.max(1, Math.min(sourceWidth - left, Number(sourceRect?.width) || sourceWidth))
  const height = Math.max(1, Math.min(sourceHeight - top, Number(sourceRect?.height) || sourceHeight))
  return { left, top, width, height }
}

function drawStrokesOnCapturedFrame(context, canvas, strokes, sourceWidth, sourceHeight, sourceRect) {
  if (!context || !canvas || !sourceWidth || !sourceHeight || !strokes.length) return
  const rect = normalizeSourceRect(sourceWidth, sourceHeight, sourceRect)
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  strokes.forEach((stroke) => {
    const points = Array.isArray(stroke?.points) ? stroke.points : []
    if (points.length < 2) return
    context.beginPath()
    points.forEach((point, index) => {
      const sourceX = clampNumber(point?.x, 0, 1, 0.5) * sourceWidth
      const sourceY = clampNumber(point?.y, 0, 1, 0.5) * sourceHeight
      const x = (sourceX - rect.left) * scaleX
      const y = (sourceY - rect.top) * scaleY
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.strokeStyle = isHexColor(stroke?.color) ? stroke.color : '#ff4d6d'
    context.lineWidth = clampNumber(stroke?.width, 1, 24, 4) * Math.min(scaleX, scaleY)
    context.globalAlpha = clampNumber(stroke?.opacity, 0.1, 1, 0.95)
    context.stroke()
  })
  context.restore()
}

function drawCaptionOnCapturedFrame(context, canvas, caption, sourceWidth, sourceHeight, sourceRect) {
  if (!context || !canvas || !caption?.text || !sourceWidth || !sourceHeight) return
  const rect = normalizeSourceRect(sourceWidth, sourceHeight, sourceRect)
  const scale = Math.min(canvas.width / rect.width, canvas.height / rect.height)
  const fontSize = clampNumber(caption.fontSize, 16, 96, 36) * scale
  const maxWidth = Math.max(180 * scale, Math.min(canvas.width * 0.9, clampNumber(caption.maxWidth, 0.2, 0.95, 0.82) * canvas.width))
  context.save()
  context.font = `600 ${fontSize}px "Segoe UI", "Microsoft YaHei", sans-serif`
  const lines = []
  String(caption.text).split(/\r?\n/).forEach((paragraph) => {
    let line = ''
    for (const character of Array.from(paragraph)) {
      const next = line + character
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line)
        line = character
      } else {
        line = next
      }
    }
    lines.push(line || ' ')
  })
  const lineHeight = fontSize * 1.35
  const paddingX = fontSize * 0.55
  const paddingY = fontSize * 0.35
  const textWidth = Math.min(maxWidth, Math.max(...lines.map((line) => context.measureText(line).width)))
  const boxWidth = Math.min(canvas.width - 24 * scale, textWidth + paddingX * 2)
  const boxHeight = lines.length * lineHeight + paddingY * 2
  const centerX = (clampNumber(caption.x, 0, 1, 0.5) * sourceWidth - rect.left) * (canvas.width / rect.width)
  const centerY = (clampNumber(caption.y, 0, 1, 0.88) * sourceHeight - rect.top) * (canvas.height / rect.height)
  const boxX = Math.max(12 * scale, Math.min(canvas.width - boxWidth - 12 * scale, centerX - boxWidth / 2))
  const boxY = Math.max(12 * scale, Math.min(canvas.height - boxHeight - 12 * scale, centerY - boxHeight / 2))
  context.fillStyle = isHexColor(caption.backgroundColor) ? caption.backgroundColor : '#111827'
  context.globalAlpha = clampNumber(caption.backgroundOpacity, 0, 1, 0.82)
  context.fillRect(boxX, boxY, boxWidth, boxHeight)
  context.fillStyle = isHexColor(caption.color) ? caption.color : '#ffffff'
  context.globalAlpha = 1
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  lines.forEach((line, index) => context.fillText(line, boxX + boxWidth / 2, boxY + paddingY + lineHeight * (index + 0.5), maxWidth))
  context.restore()
}

function App() {
  const [activeNav, setActiveNav] = useState('chatSession')
  const [language, setLanguage] = useState(getInitialLanguage)
  const [models, setModels] = useState([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [modelEditorOpen, setModelEditorOpen] = useState(false)
  const [modelDraft, setModelDraft] = useState({ id: '', alias: '', name: '', url: DEFAULT_REALTIME_URL, apiKey: '' })
  const [modelApiKeyVisible, setModelApiKeyVisible] = useState(false)
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
  const [selectedOutput, setSelectedOutput] = useState('')
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
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState([])
  const [importedContext, setImportedContext] = useState(null)
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
  const connectionRef = useRef(connection)
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

  const selectedModel = useMemo(() => models.find((model) => model.id === selectedModelId) || null, [models, selectedModelId])
  const selectedRole = useMemo(() => roles.find((role) => role.id === selectedRoleId) || null, [roles, selectedRoleId])
  const selectedRoleAbilities = useMemo(() => new Set(selectedRole?.abilities || DEFAULT_ROLE_ABILITY_IDS), [selectedRole])
  const screenVisionEnabled = selectedRoleAbilities.has('screenVision')
  const listeningEnabled = selectedRoleAbilities.has('listening')
  const speakingEnabled = selectedRoleAbilities.has('speaking')
  const useTransparentCanvas = selectedRoleAbilities.has('drawing')
  const useWritingAbility = selectedRoleAbilities.has('writing')
  const initiativeEnabled = selectedRoleAbilities.has('initiative')
  const initiativeActive = initiativeEnabled && listeningEnabled && speakingEnabled
  const t = useMemo(() => createTranslator(language), [language])
  const modelReady = Boolean(selectedModel?.hasApiKey)

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
      language: 'auto',
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
      setImportedContext({
        fileName: result.fileName || 'session.json',
        artifact,
        consumed: false,
      })
      recordSessionEvent('context.imported', {
        fileName: result.fileName || 'session.json',
        messageCount: artifact.messages.length,
        capabilityEventCount: artifact.capabilityCalls.length,
      })
      setNotice(t('notices.sessionContextImported', { count: artifact.messages.length }))
    } catch (error) {
      setNotice(error.message || t('notices.sessionImportFailed'))
    } finally {
      setImportLoading(false)
    }
  }

  const deviceLabel = useMemo(() => {
    const active = micDevices.find((device) => device.deviceId === selectedMic)
    return active?.label || t('microphone.default')
  }, [micDevices, selectedMic, t])

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
      setRoles(settings?.roles || [])
      setSelectedRoleId(settings?.selectedRoleId || '')
    })
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices)
    loadDevices().catch(() => {}).finally(() => {
      if (!navigator.mediaDevices?.getUserMedia) return
      startMicrophone().catch((error) => {
        stopMicrophone()
        if (!['NotAllowedError', 'PermissionDeniedError'].includes(error.name)) {
          setNotice(t('notices.microphoneListenFailed', { message: error.message }))
        }
      })
    })
    if (window.cosight?.onQwenEvent) unsubscribe = window.cosight.onQwenEvent(handleQwenEvent)
    return () => {
      unsubscribe()
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices)
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
    speakingRef.current = speakingEnabled
    allowInterruptionsRef.current = allowInterruptions
    transparentCanvasRef.current = useTransparentCanvas
    writingRef.current = useWritingAbility
    coreSubtitlesRef.current = coreSubtitlesEnabled
  }, [screenVisionEnabled, listeningEnabled, speakingEnabled, allowInterruptions, useTransparentCanvas, useWritingAbility, coreSubtitlesEnabled])

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
    try {
      window.localStorage.setItem('cosight.allowInterruptions', String(allowInterruptions))
    } catch {
      // Local persistence is optional in the desktop shell.
    }
  }, [allowInterruptions])

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
    await context.audioWorklet.addModule('/pcm-processor.js')
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
    micStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted })
    setMicMuted(nextMuted)
    if (nextMuted) setMicLevel(0)
  }

  async function selectMicrophone(deviceId) {
    setSelectedMic(deviceId)
    stopMicrophone()
    try {
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
        window.cosight?.updateSessionCapabilities?.({ canvasEnabled: false, writingEnabled: false })
      }
      await window.cosight?.hideOverlay?.()
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null
      screenSharingRef.current = false
      setScreenSharing(false)
      setScreenLoading(false)
      setNotice(t('notices.captureFailed', { message: error.message }))
    }
  }

  async function captureAndSendScreenFrame({ maxWidth = 960, quality = 0.68, flush = false, priority = false } = {}) {
    if (screenFrameCapturePromiseRef.current) {
      if (!priority) return { ok: false, error: 'screen_frame_busy' }
      try {
        await screenFrameCapturePromiseRef.current
      } catch {
        // Retry the priority frame even if a periodic capture failed.
      }
    }
    const operation = (async () => {
      const video = screenVideoRef.current
      if (!screenVisionRef.current || !screenSharingRef.current || !video?.videoWidth || !video?.videoHeight || !connectionRef.current.includes('Connected') || !audioFrameSentRef.current) {
        return { ok: false, error: 'screen_frame_unavailable' }
      }
      const canvas = screenCanvasRef.current || document.createElement('canvas')
      screenCanvasRef.current = canvas
      const ratio = Math.min(1, maxWidth / video.videoWidth)
      canvas.width = Math.max(1, Math.round(video.videoWidth * ratio))
      canvas.height = Math.max(1, Math.round(video.videoHeight * ratio))
      const context = canvas.getContext('2d')
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      // getDisplayMedia intentionally does not include the desktop overlay.
      // Composite the same strokes into the outbound frame so the agent can
      // inspect the exact annotation it just created.
      drawStrokesOnCapturedFrame(context, canvas, drawingStrokesRef.current, video.videoWidth, video.videoHeight)
      drawCaptionOnCapturedFrame(context, canvas, coreCaptionRef.current, video.videoWidth, video.videoHeight)
      drawCaptionOnCapturedFrame(context, canvas, writingCaptionRef.current, video.videoWidth, video.videoHeight)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (!blob || !connectionRef.current.includes('Connected') || !audioFrameSentRef.current) return { ok: false, error: 'screen_frame_unavailable' }
      const flushMode = typeof flush === 'string' ? flush : (flush ? 'focus' : 'default')
      window.cosight?.sendVideoFrame?.(
        toBase64(await blob.arrayBuffer()),
        flushMode !== 'default',
        flushMode,
      )
      return { ok: true, width: canvas.width, height: canvas.height }
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
      // Keep the focused frame truthful to the visible Cosight state: existing
      // agent marks and captions are included, but the crop uses full-frame
      // normalized coordinates and therefore cannot drift at the edges.
      drawStrokesOnCapturedFrame(context, canvas, drawingStrokesRef.current, sourceWidth, sourceHeight, crop)
      drawCaptionOnCapturedFrame(context, canvas, coreCaptionRef.current, sourceWidth, sourceHeight, crop)
      drawCaptionOnCapturedFrame(context, canvas, writingCaptionRef.current, sourceWidth, sourceHeight, crop)
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
      window.cosight?.updateSessionCapabilities?.({ canvasEnabled: false, writingEnabled: false })
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
      captionIncludedInNextScreenFrame: Boolean(captionRef.current?.text),
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
    if (!screenSharing || !screenStreamRef.current) return undefined
    attachScreenPreview(screenStreamRef.current).catch((error) => {
      stopScreenShare()
      setNotice(t('notices.previewFailed', { message: error.message }))
    }).then(() => {
      if (screenStreamRef.current) setScreenLoading(false)
    })
    return undefined
  }, [screenSharing])

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
    if (screenCaptureKind === 'screen' && (useTransparentCanvas || useWritingAbility || coreSubtitlesEnabled)) {
      void window.cosight?.showOverlay?.(screenSourceRef.current)
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
  }, [screenSharing, screenCaptureKind, useTransparentCanvas, useWritingAbility, coreSubtitlesEnabled])

  function stopAllCapture() {
    stopScreenShare()
    stopMicrophone()
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
      if (!selectedModel) {
        setNotice(t('notices.addModelFirst'))
        return
      }
      if (!selectedModel.hasApiKey) {
        setNotice(t('notices.apiKeyFirst'))
        return
      }
      const contextToInject = importedContext && !importedContext.consumed
        ? {
            messages: importedContext.artifact.messages,
            capabilityCalls: importedContext.artifact.capabilityCalls,
          }
        : null
      currentSessionIdRef.current = makeSessionId()
      connectionRef.current = 'Connecting'
      audioFrameSentRef.current = false
      if (!micStreamRef.current) await startMicrophone()
      const effectiveInitiative = initiativeActive
      const overlayEnabledForSession = screenSharing && screenCaptureKind === 'screen'
      const result = await window.cosight?.startSession?.({
        modelId: selectedModel.id,
        roleId: selectedRoleId,
        screenVisionEnabled,
        listeningEnabled,
        speakingEnabled,
        // A window capture has window-local coordinates and cannot safely use
        // the full-display transparent overlay. The runtime guard also keeps
        // this invariant if the capture source changes during a session.
        canvasEnabled: useTransparentCanvas && overlayEnabledForSession,
        writingEnabled: useWritingAbility && overlayEnabledForSession,
        subtitlesEnabled: coreSubtitlesEnabled && overlayEnabledForSession,
        initiativeEnabled: effectiveInitiative,
        importedContext: contextToInject,
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

  async function stopChat() {
    flushAssistantTurn()
    await window.cosight?.stopSession?.()
    connectionRef.current = 'Disconnected'
    audioFrameSentRef.current = false
    stopMicrophone()
    window.clearInterval(elapsedTimerRef.current)
    lastBridgeErrorRef.current = ''
    assistantDraftRef.current = ''
    assistantToolResponseRef.current = false
    assistantAudioUntilRef.current = 0
    setAssistantDraft('')
    setConnection('Disconnected')
  }

  function openNewModel() {
    setModelDraft({ id: '', alias: '', name: '', url: DEFAULT_REALTIME_URL, apiKey: '' })
    setModelApiKeyVisible(false)
    setModelEditorOpen(true)
  }

  function openEditModel(model = selectedModel) {
    if (!model) return
    setModelDraft({ id: model.id, alias: model.alias || '', name: model.name, url: model.url, apiKey: '' })
    setModelApiKeyVisible(false)
    setModelEditorOpen(true)
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
    setModelEditorOpen(false)
    setNotice(t('notices.modelSaved'))
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

  function openNewRole(returnNav = 'roles') {
    if (isChatActive) return
    setRoleDraft(emptyRoleDraft())
    setRoleEditorReturnNav(returnNav)
    setRoleEditorOpen(true)
    setActiveNav('roles')
  }

  function openEditRole(role) {
    if (!role || role.isBuiltin || isChatActive) return
    const abilities = [...(role.abilities || [])]
    setRoleDraft({ ...emptyRoleDraft(), ...role, avatarRemoved: false, abilities, drawingPolicy: abilities.includes('drawing') ? (role.drawingPolicy || '') : '', writingPolicy: abilities.includes('writing') ? (role.writingPolicy || role.subtitlesPolicy || '') : '', initiativeTimeoutSec: abilities.includes('initiative') ? (role.initiativeTimeoutSec || '10') : '', initiativePrompt: abilities.includes('initiative') ? (role.initiativePrompt || '') : '', knowledgeFiles: [...(role.knowledgeFiles || [])] })
    setRoleEditorReturnNav('roles')
    setRoleEditorOpen(true)
    setActiveNav('roles')
  }

  function closeRoleEditor() {
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
    const result = await window.cosight?.saveRole?.(roleDraft)
    if (!result?.ok) {
      setNotice(result?.error || t('notices.roleSaveFailed'))
      return
    }
    setRoles((current) => {
      const next = current.filter((role) => role.id !== result.role.id)
      return [result.role, ...next]
    })
    const selection = await window.cosight?.selectRole?.(result.role.id)
    setSelectedRoleId(selection?.selectedRoleId || result.role.id)
    setRoleEditorOpen(false)
    setActiveNav(roleEditorReturnNav)
    setNotice(t('notices.roleSaved'))
  }

  async function selectRole(roleId) {
    if (isChatActive) return
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
    setSelectedRoleId(result.selectedRoleId || '')
    setNotice(t('notices.roleDeleted'))
  }

  async function changeOutput(deviceId) {
    setSelectedOutput(deviceId)
    const context = audioPlaybackRef.current?.context
    if (context?.setSinkId && deviceId) await context.setSinkId(deviceId)
  }

  function playPcm(base64) {
    const context = audioPlaybackRef.current?.context || new AudioContext()
    if (!audioPlaybackRef.current) audioPlaybackRef.current = { context, nextTime: context.currentTime }
    const binary = atob(base64)
    const pcm = new Int16Array(binary.length / 2)
    for (let i = 0; i < pcm.length; i += 1) pcm[i] = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8)
    const buffer = context.createBuffer(1, pcm.length, 24000)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const startAt = Math.max(context.currentTime, audioPlaybackRef.current.nextTime)
    const endAt = startAt + buffer.duration
    source.start(startAt)
    audioPlaybackRef.current.nextTime = endAt
    return Date.now() + Math.max(0, Math.round((endAt - context.currentTime) * 1000))
  }

  function toggleNav(key) {
    setActiveNav(key)
    if (key === 'abilities' || key === 'roles' || key === 'models' || key === 'settings') {
      setModelEditorOpen(false)
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
          {activeNav === 'abilities' ? <AbilitiesPage t={t} /> : activeNav === 'roles' ? <RolesPage {...{ roles, selectedRoleId, roleEditorOpen, roleDraft, setRoleDraft, openNewRole, openEditRole, closeRoleEditor, previewRolePrompt, saveRole, selectRole, deleteRole, isChatActive, t, setNotice }} /> : activeNav === 'models' ? <ModelsPage {...{ models, selectedModel, modelEditorOpen, modelDraft, setModelDraft, modelApiKeyVisible, setModelApiKeyVisible, openNewModel, openEditModel, saveModel, selectModel, deleteModel: deleteSelectedModel, closeModelEditor: () => setModelEditorOpen(false), isChatActive, t }} /> : activeNav === 'settings' ? <SettingsPage {...{ selectedModel, modelReady, micDevices, selectedMic, setSelectedMic, selectMicrophone, micActive, micLevel, outputDevices, selectedOutput, setSelectedOutput, changeOutput, autoReconnect, setAutoReconnect, pushToTalk, setPushToTalk, allowInterruptions, setAllowInterruptions, liveTranscript, setLiveTranscript, coreSubtitlesEnabled, setCoreSubtitlesEnabled, language, setLanguage, t, setNotice }} /> : <>
          <div className="workspace-header">
            <div><h1>{t('nav.chatSession')}</h1><div className="session-meta"><span className={`status-dot ${isConnected ? 'green' : ''}`} />{connectionLabel}<span className="meta-separator">•</span><span>{formatElapsed(elapsed)}</span></div></div>
            <div className="header-actions">
              <button className={`outline-button ${screenSharing && !screenLoading ? 'selected' : ''}`} onClick={screenSharing ? stopScreenShare : openSourcePicker} disabled={screenLoading || captureLockedDuringConnection} aria-label={screenLoading ? t('screen.loading') : captureLockedDuringConnection ? t('screen.shareDisabledDuringChat') : screenSharing ? t('screen.stopSharing') : t('screen.share')} title={screenLoading ? t('screen.loading') : captureLockedDuringConnection ? t('screen.shareDisabledDuringChat') : screenSharing ? t('screen.stopSharing') : t('screen.share')}>
                {screenLoading ? <LoaderCircle className="spin" size={16} /> : <Monitor size={16} />}
                {screenLoading ? t('screen.loading') : screenSharing ? <><span className="screen-share-default-label">{t('screen.sharing')}</span><span className="screen-share-hover-label">{t('screen.stopSharing')}</span></> : t('screen.share')}
              </button>
              <RoleSelector roles={roles} selectedRole={selectedRole} selectedRoleId={selectedRoleId} onSelect={selectRole} onAdd={() => openNewRole('chatSession')} disabled={isChatActive} t={t} />
              {isChatActive ? <button className="primary-button stop-button" onClick={stopChat}><Square size={15} fill="currentColor" /> {t('chat.stop')}</button> : <button className="primary-button" onClick={startChat} disabled={isStarting || screenLoading} aria-disabled={isStarting || screenLoading} title={screenLoading ? t('screen.loading') : undefined}><Play size={15} fill="currentColor" />{isStarting ? t('chat.starting') : t('chat.start')}</button>}
            </div>
          </div>

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
          </section>
          </>}
        </main>

      </div>

      {sourcePickerOpen && <SourcePicker sources={sources} sourcesLoading={sourcesLoading} onSelect={shareSource} onClose={() => setSourcePickerOpen(false)} t={t} />}
      {rolePromptPreviewOpen && <PromptPreview prompt={rolePromptPreview} loading={rolePromptPreviewLoading} onClose={() => setRolePromptPreviewOpen(false)} t={t} />}
      {notice && <div className="toast"><Sparkles size={15} />{notice}</div>}
    </div>
  )
}

function TranscriptLine({ item, t, live = false }) {
  const speaker = item.speaker === 'You' ? t('transcript.you') : t('transcript.cosight')
  return <div className={`transcript-line ${live ? 'live-line' : ''}`}><time>{item.time}</time><strong className={item.speaker === 'You' ? 'you' : ''}>{speaker}</strong><span>{item.text}</span>{live && <span className="typing-cursor" />}</div>
}

function AbilitiesPage({ t }) {
  const abilities = [
    { icon: <Monitor size={19} />, title: t('abilities.screenVision'), description: t('abilities.screenVisionDescription') },
    { icon: <AudioLines size={19} />, title: t('abilities.listening'), description: t('abilities.listeningDescription') },
    { icon: <Volume2 size={19} />, title: t('abilities.speaking'), description: t('abilities.speakingDescription') },
    { icon: <Pencil size={19} />, title: t('abilities.drawing'), description: t('abilities.drawingDescription'), detail: t('abilities.drawingPrecisionDescription') },
    { icon: <FileText size={19} />, title: t('abilities.writing'), description: t('abilities.writingDescription') },
    { icon: <Radio size={19} />, title: t('abilities.initiative'), description: t('abilities.initiativeDescription') },
  ]
  return <section className="abilities-page" aria-labelledby="abilities-title">
    <div className="abilities-header">
      <div>
        <span className="page-kicker">{t('abilities.kicker')}</span>
        <h1 id="abilities-title">{t('abilities.title')}</h1>
        <p>{t('abilities.description')}</p>
      </div>
      <div className="ability-count"><Sparkles size={16} /><span>{t('abilities.catalogCount', { total: abilities.length })}</span></div>
    </div>
    <div className="abilities-list">{abilities.map((ability) => <AbilityCard {...ability} hint={t('abilities.roleHint')} key={ability.title} />)}</div>
    <div className="abilities-note"><Sparkles size={16} /><div><strong>{t('abilities.noteTitle')}</strong><p>{t('abilities.noteDescription')}</p></div></div>
  </section>
}

function AbilityCard({ icon, title, description, detail, hint }) {
  return <article className="ability-card">
    <div className="ability-card-header"><div className="ability-icon">{icon}</div></div>
    <div className="ability-card-copy"><h2>{title}</h2><p>{description}</p>{detail && <div className="ability-card-detail">{detail}</div>}<small>{hint}</small></div>
  </article>
}

function ModelsPage({ models, selectedModel, modelEditorOpen, modelDraft, setModelDraft, modelApiKeyVisible, setModelApiKeyVisible, openNewModel, openEditModel, saveModel, selectModel, deleteModel, closeModelEditor, isChatActive, t }) {
  return <section className="models-page" aria-labelledby="models-title">
    <div className="models-header">
      <div>
        <span className="page-kicker">{t('models.kicker')}</span>
        <h1 id="models-title">{t('models.title')}</h1>
        <p>{t('models.description')}</p>
      </div>
      <button className="primary-button" type="button" onClick={openNewModel}><Plus size={15} />{t('models.add')}</button>
    </div>
    {modelEditorOpen && <div className="model-page-editor"><ModelEditor draft={modelDraft} setDraft={setModelDraft} apiKeyVisible={modelApiKeyVisible} setApiKeyVisible={setModelApiKeyVisible} onSave={saveModel} onCancel={closeModelEditor} t={t} /></div>}
    <div className="models-list">
      {models.map((model) => <ModelCard key={model.id} model={model} selected={selectedModel?.id === model.id} isChatActive={isChatActive} onSelect={selectModel} onEdit={openEditModel} onDelete={deleteModel} t={t} />)}
      {!models.length && !modelEditorOpen && <div className="models-empty"><Cpu size={19} /><div><strong>{t('models.emptyTitle')}</strong><p>{t('models.emptyDescription')}</p><button className="text-link" type="button" onClick={openNewModel}><Plus size={13} />{t('models.add')}</button></div></div>}
    </div>
  </section>
}

function ModelCard({ model, selected, isChatActive, onSelect, onEdit, onDelete, t }) {
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

function RoleSelector({ roles, selectedRole, selectedRoleId, onSelect, onAdd, disabled, t }) {
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

function RolesPage({ roles, selectedRoleId, roleEditorOpen, roleDraft, setRoleDraft, openNewRole, openEditRole, closeRoleEditor, previewRolePrompt, saveRole, selectRole, deleteRole, isChatActive, t, setNotice }) {
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

function RoleCard({ role, selected, isChatActive, onSelect, onEdit, onDelete, t }) {
  const language = ROLE_LANGUAGE_OPTIONS.find((item) => item.value === role.language)
  const voice = ROLE_VOICE_OPTIONS.find((item) => item.value === role.voice)
  return <article className={`role-card ${selected ? 'selected' : ''}`}>
    <div className="role-card-header">
      <div className="role-card-title"><div className={`role-icon ${selected ? 'active' : ''}`}>{role.avatar ? <img src={role.avatar} alt="" /> : <UserRound size={19} />}</div><div><h2>{role.name}</h2><div className="role-title-meta">{selected && <span className="role-active-badge"><span className="status-dot green" />{t('roles.active')}</span>}{role.isBuiltin && <span className="role-builtin-badge">{t('roles.builtin')}</span>}</div></div></div>
      <div className="role-card-actions">
        <button type="button" className="text-link" onClick={() => onSelect(role.id)} disabled={isChatActive} title={isChatActive ? t('roles.lockedDuringChat') : t('roles.use')}><Check size={13} />{t('roles.use')}</button>
        {!role.isDefault && !role.isBuiltin && <><button type="button" className="text-link" onClick={() => onEdit(role)} disabled={isChatActive}><Pencil size={12} />{t('model.edit')}</button><button type="button" className="danger-link" onClick={() => onDelete(role)} disabled={isChatActive}><Trash2 size={12} />{t('model.delete')}</button></>}
      </div>
    </div>
    <p className="role-card-identity">{role.identity || t('roles.noIdentity')}</p>
    <div className="role-card-meta"><span className="role-chip">{language ? t(language.labelKey) : t('roles.languageAuto')}</span><span className="role-chip">{voice?.label || t('roles.voiceDefault')}</span>{(role.abilities || []).map((ability) => <span className="role-chip" key={ability}>{t(ROLE_ABILITY_LABEL_KEYS[ability])}</span>)}</div>
  </article>
}

function RoleEditor({ draft, setDraft, onSave, onCancel, onPreview, t, setNotice }) {
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
    if (ability === 'writing') return { ...current, abilities, writingPolicy: enabled ? '' : current.writingPolicy }
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
        <div className="role-field"><span>{t('roles.voice')}</span><label className="select-field"><Volume2 size={15} /><select value={draft.voice} onChange={(event) => updateDraft('voice', event.target.value)} aria-label={t('roles.voice')}>{ROLE_VOICE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.labelKey ? t(option.labelKey) : option.label}</option>)}</select><span className="select-value">{ROLE_VOICE_OPTIONS.find((option) => option.value === draft.voice)?.label || t('roles.voiceDefault')}</span><ChevronDown size={14} /></label></div>
      </div>
      <div className="role-field"><span>{t('roles.abilities')}</span><small>{t('roles.abilitiesHint')}</small><div className="role-ability-grid">{ROLE_ABILITY_IDS.map((ability) => { const selected = draft.abilities.includes(ability); const initiativeBlocked = ability === 'initiative' && !selected && !initiativeDependenciesMet; return <label className={`role-ability-option ${selected ? 'selected' : ''} ${initiativeBlocked ? 'disabled' : ''}`} key={ability} title={initiativeBlocked ? t('roles.initiativeRequiresListeningSpeaking') : undefined}><input type="checkbox" checked={selected} disabled={initiativeBlocked} onChange={() => toggleAbility(ability)} /><span>{t(ROLE_ABILITY_LABEL_KEYS[ability])}</span><Check size={14} /></label> })}</div></div>
      {draft.abilities.includes('drawing') && <label className="role-field ability-policy-field"><span>{t('roles.drawingPolicy')}</span><small>{t('roles.drawingPolicyHint')}</small><textarea className="role-textarea" value={draft.drawingPolicy} onChange={(event) => updateDraft('drawingPolicy', event.target.value)} placeholder={t('roles.drawingPolicyPlaceholder')} maxLength={20000} /></label>}
      {draft.abilities.includes('writing') && <label className="role-field ability-policy-field"><span>{t('roles.writingPolicy')}</span><small>{t('roles.writingPolicyHint')}</small><textarea className="role-textarea" value={draft.writingPolicy} onChange={(event) => updateDraft('writingPolicy', event.target.value)} placeholder={t('roles.writingPolicyPlaceholder')} maxLength={20000} /></label>}
      {draft.abilities.includes('initiative') && initiativeDependenciesMet && <div className="initiative-fields"><label className="role-field"><span>{t('roles.initiativeTimeout')}</span><div className="initiative-number-field"><input className="text-input" type="text" inputMode="numeric" pattern="[0-9]*" value={draft.initiativeTimeoutSec} onChange={(event) => updateDraft('initiativeTimeoutSec', event.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={() => { const value = Number.parseInt(draft.initiativeTimeoutSec || '10', 10); updateDraft('initiativeTimeoutSec', String(Math.min(300, Math.max(5, Number.isFinite(value) ? value : 10)))) }} aria-describedby="initiative-timeout-hint" /><span>s</span></div><small id="initiative-timeout-hint">{t('roles.initiativeTimeoutHint')}</small></label><label className="role-field"><span>{t('roles.initiativePrompt')}</span><textarea className="role-textarea initiative-prompt-textarea" value={draft.initiativePrompt} onChange={(event) => updateDraft('initiativePrompt', event.target.value)} placeholder={t('roles.initiativePromptPlaceholder')} maxLength={20000} /><small>{t('roles.initiativePromptHint')}</small></label></div>}
      <div className="role-field knowledge-field"><span>{t('roles.knowledge')}</span><small>{t('roles.knowledgeHint')}</small><textarea className="role-textarea knowledge-textarea" value={draft.knowledgeText} onChange={(event) => updateDraft('knowledgeText', event.target.value)} placeholder={t('roles.knowledgePlaceholder')} maxLength={60000} />
        <div className="knowledge-file-toolbar"><button type="button" className="outline-button" onClick={pickFiles}><Plus size={14} />{t('roles.addKnowledgeFiles')}</button><small>{t('roles.knowledgeFileHint')}</small></div>
        {draft.knowledgeFiles.length > 0 && <div className="knowledge-files">{draft.knowledgeFiles.map((file) => <div className="knowledge-file" key={file.id}><FileText size={14} /><span>{file.name}</span><small>{file.size ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : t('roles.fileStored')}</small><button type="button" onClick={() => removeFile(file.id)} aria-label={t('roles.removeKnowledgeFile', { name: file.name })} title={t('roles.removeKnowledgeFile', { name: file.name })}><X size={13} /></button></div>)}</div>}
      </div>
      <div className="role-editor-actions"><button type="button" className="outline-button" onClick={() => onPreview(draft)}><Eye size={14} />{t('roles.preview')}</button><span className="role-editor-actions-spacer" /><button type="button" className="outline-button" onClick={onCancel}>{t('model.cancel')}</button><button type="button" className="save-key-button" onClick={onSave}><Check size={14} />{t('roles.save')}</button></div>
    </div>
  </section>
}

function PromptPreview({ prompt, loading, onClose, t }) {
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

function RoleTextarea({ label, value, onChange, placeholder, full = false }) {
  return <label className={`role-field ${full ? 'role-field-full' : ''}`}><span>{label}</span><textarea className="role-textarea" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={20000} /></label>
}

function SettingsPage({ selectedModel, modelReady, micDevices, selectedMic, setSelectedMic, selectMicrophone, micActive, micLevel, outputDevices, selectedOutput, setSelectedOutput, changeOutput, autoReconnect, setAutoReconnect, pushToTalk, setPushToTalk, allowInterruptions, setAllowInterruptions, liveTranscript, setLiveTranscript, coreSubtitlesEnabled, setCoreSubtitlesEnabled, language, setLanguage, t, setNotice }) {
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
          <div className="field-group settings-page-field"><label className="field-label">{t('microphone.name')}</label><DeviceSelect icon={<Mic size={16} />} value={selectedMic} onChange={selectMicrophone} devices={micDevices} fallback={t('microphone.default')} /><div className="device-meta"><div className={`settings-mic-meter ${micActive ? 'active' : ''}`} role="meter" aria-label={t('microphone.level')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(micLevel * 100)}><span style={{ width: `${Math.round(micLevel * 100)}%` }} /></div></div></div>
          <div className="field-group settings-page-field"><label className="field-label">{t('audio.output')}</label><DeviceSelect icon={<Volume2 size={16} />} value={selectedOutput} onChange={changeOutput} devices={outputDevices} fallback={t('audio.defaultSpeakers')} /><div className="volume-row"><Volume2 size={16} /><input type="range" min="0" max="100" defaultValue="48" aria-label={t('audio.output')} /></div></div>
        </div>
        <button className="reset-link" onClick={() => { setSelectedMic(''); setSelectedOutput(''); setNotice(t('settings.resetDevicesNotice')) }}><RotateCcw size={15} /> {t('settings.resetDevices')}</button>
      </section>
      <section className="settings-page-section">
        <h2>{t('settings.connectionTitle')}</h2>
        <div className="settings-page-grid">
          <div className="field-group settings-page-field"><label className="field-label">{t('settings.connection')}</label><div className="connection-box"><span><span className={`status-dot ${modelReady ? 'green' : ''}`} />{selectedModel ? (modelReady ? t('settings.readyToConnect') : t('settings.apiKeyRequired')) : t('settings.modelRequired')}</span><button className="small-button" disabled>{t('settings.disconnect')}</button></div></div>
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

function ModelEditor({ draft, setDraft, apiKeyVisible, setApiKeyVisible, onSave, onCancel, t }) {
  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  return <div className="model-editor">
    <div className="editor-heading"><strong>{draft.id ? t('model.editTitle') : t('model.addTitle')}</strong><button onClick={onCancel} aria-label={t('common.close')} title={t('common.close')}><X size={15} /></button></div>
    <label className="editor-label">{t('model.alias')}<input className="text-input" value={draft.alias} onChange={(event) => updateDraft('alias', event.target.value)} placeholder={t('model.aliasPlaceholder')} maxLength={120} /></label>
    <label className="editor-label">{t('model.name')}<input className="text-input" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder={t('model.namePlaceholder')} /></label>
    <label className="editor-label">{t('model.realtimeUrl')}<input className="text-input" value={draft.url} onChange={(event) => updateDraft('url', event.target.value)} placeholder={t('model.urlPlaceholder')} /></label>
    <label className="editor-label">{t('model.apiKey')}<div className="secret-field"><input type={apiKeyVisible ? 'text' : 'password'} value={draft.apiKey} onChange={(event) => updateDraft('apiKey', event.target.value)} placeholder={draft.id ? t('model.keepKeyPlaceholder') : t('model.keyPlaceholder')} /><button onClick={() => setApiKeyVisible((value) => !value)} aria-label={apiKeyVisible ? t('model.hideKey') : t('model.showKey')} title={apiKeyVisible ? t('model.hideKey') : t('model.showKey')}>{apiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
    <div className="editor-actions"><button className="outline-button" onClick={onCancel}>{t('model.cancel')}</button><button className="save-key-button" onClick={onSave}><Check size={14} /> {t('model.save')}</button></div>
  </div>
}

function DeviceSelect({ icon, value, onChange, devices, fallback }) { const selectedDevice = devices.find((device) => device.deviceId === value); return <label className="select-field"><span className="select-icon">{icon}</span><select value={value} onChange={(event) => onChange(event.target.value)} aria-label={fallback}><option value="">{fallback}</option>{devices.map((device) => <option value={device.deviceId} key={device.deviceId}>{device.label || fallback}</option>)}</select><span className="select-value">{selectedDevice?.label || fallback}</span><ChevronDown size={15} /></label> }

function ToggleRow({ label, hint, value, onChange, disabled = false }) { return <div className="toggle-row"><div><strong>{label}</strong><small>{hint}</small></div><button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-label={label} aria-pressed={value} disabled={disabled}><span /></button></div> }

function SourcePicker({ sources, sourcesLoading, onSelect, onClose, t }) { return <div className="modal-backdrop"><div className="source-modal"><div className="modal-header"><div><span className="modal-kicker">{t('screen.captureKicker')}</span><h2>{t('screen.shareScreenOrWindow')}</h2></div><button onClick={onClose} aria-label={t('common.close')} title={t('common.close')}><X size={18} /></button></div><div className="source-grid">{sources.map((source) => <button className="source-option" key={source.id} onClick={() => onSelect(source)}><img src={source.thumbnail} alt="" /><span>{source.name}</span></button>)}</div>{sourcesLoading ? <div className="empty-sources"><LoaderCircle className="spin" size={18} /> {t('sourcePicker.loading')}</div> : !sources.length && <div className="empty-sources"><Radio size={18} /> {t('screen.noScreens')}</div>}</div></div> }

export default App
