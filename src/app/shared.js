import {
  BarChart3,
  Cpu,
  Monitor,
  Settings as SettingsIcon,
  Sparkles,
  UserRound,
} from 'lucide-react'

export const DEFAULT_REALTIME_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime'
export const DEFAULT_HARNESS_HTTP_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
export const HARNESS_MODULES = ['brain', 'listen', 'speak', 'see']
export const DEFAULT_HARNESS_SETTINGS = {
  seeMinIntervalMs: 5000,
  recentConversationCount: 20,
  recentVisionCount: 1,
}
// Developer-only diagnostic switch. Keep this out of the UI so it cannot be
// enabled accidentally in a normal build. When enabled, See bounding boxes
// are rendered on the transparent overlay but are never composited into an
// outbound screen frame.
export const SEE_BBOX_DEBUG_ENABLED = false
export const DEFAULT_OUTPUT_VOLUME = 48
export const OUTPUT_VOLUME_STORAGE_KEY = 'cosight.outputVolume'
export const ROLE_ABILITY_IDS = ['screenVision', 'listening', 'speaking', 'drawing', 'initiative']
export const DEFAULT_ROLE_ABILITY_IDS = ['screenVision', 'listening', 'speaking', 'drawing']
export const NEW_ROLE_DEFAULT_ABILITY_IDS = ['screenVision', 'listening', 'speaking']
export const ROLE_ABILITY_LABEL_KEYS = {
  screenVision: 'roles.abilityScreenVision',
  listening: 'roles.abilityListening',
  speaking: 'roles.abilitySpeaking',
  drawing: 'roles.abilityDrawing',
  initiative: 'roles.abilityInitiative',
}
export const USAGE_CHART_COLORS = ['#8f9bff', '#52d4b1', '#f3c969', '#ef8ca8', '#80b5ff', '#c29cff', '#ff9f68', '#73d7e5']
export const USAGE_PRESETS = [
  { key: 'lastHour', hours: 1 },
  { key: 'last24Hours', hours: 24 },
  { key: 'sevenDays', days: 7 },
  { key: 'thirtyDays', days: 30 },
  { key: 'ninetyDays', days: 90 },
]
export const USAGE_GRANULARITIES = ['auto', 'minute', 'hour', 'day', 'week']
export const MAX_USAGE_BUCKETS = 20000
export const ROLE_LANGUAGE_OPTIONS = [
  { value: 'auto', labelKey: 'roles.languageAuto' },
  { value: 'zh-CN', labelKey: 'language.chinese' },
  { value: 'en-US', labelKey: 'language.english' },
]
export const ROLE_VOICE_OPTIONS = [
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
  // Qwen-TTS realtime voices. Keep the legacy Omni voices above so existing
  // roles remain editable when the app is running in single-model mode.
  { value: 'Cherry', label: 'Cherry' },
  { value: 'Chelsie', label: 'Chelsie' },
  { value: 'Vivian', label: 'Vivian' },
  { value: 'Moon', label: 'Moon' },
  { value: 'Kai', label: 'Kai' },
  { value: 'Nofish', label: 'Nofish' },
  { value: 'Bella', label: 'Bella' },
  { value: 'Elias', label: 'Elias' },
  { value: 'Jada', label: 'Jada' },
  { value: 'Roy', label: 'Roy' },
  { value: 'Eldric Sage', label: 'Eldric Sage' },
  { value: 'Mochi', label: 'Mochi' },
  { value: 'Bellona', label: 'Bellona' },
  { value: 'Vincent', label: 'Vincent' },
  { value: 'Bunny', label: 'Bunny' },
  { value: 'Neil', label: 'Neil' },
  { value: 'Arthur', label: 'Arthur' },
  { value: 'Nini', label: 'Nini' },
  { value: 'Seren', label: 'Seren' },
  { value: 'Pip', label: 'Pip' },
  { value: 'Stella', label: 'Stella' },
]

export const navItems = [
  { key: 'chatSession', labelKey: 'nav.chatSession', icon: Monitor },
  { key: 'abilities', labelKey: 'nav.abilities', icon: Sparkles },
  { key: 'roles', labelKey: 'nav.roles', icon: UserRound },
  { key: 'models', labelKey: 'nav.models', icon: Cpu },
  { key: 'usage', labelKey: 'nav.usage', icon: BarChart3 },
  { key: 'settings', labelKey: 'nav.settings', icon: SettingsIcon },
]

export function usageDateTimeInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function makeUsageRange(preset) {
  const normalizedPreset = typeof preset === 'number' ? { days: preset } : (preset || { days: 7 })
  const end = new Date()
  const start = new Date(end)
  if (normalizedPreset.hours) start.setTime(end.getTime() - Math.max(1, Number(normalizedPreset.hours) || 1) * 60 * 60 * 1000)
  else start.setDate(start.getDate() - Math.max(1, Number(normalizedPreset.days) || 1) + 1)
  return { from: usageDateTimeInputValue(start), to: usageDateTimeInputValue(end) }
}

export function parseUsageDate(value, endOfDay = false) {
  if (typeof value !== 'string') return null
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const isDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  if (!isDate && !isDateTime) return null
  const date = new Date(isDate ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}` : value)
  if (isDateTime && endOfDay) date.setSeconds(59, 999)
  return Number.isFinite(date.getTime()) ? date : null
}

export function usageFilterTimestamp(value, endOfDay = false) {
  return parseUsageDate(value, endOfDay)?.toISOString() || ''
}

export function usageGranularity(fromDate, toDate, requested = 'auto') {
  if (USAGE_GRANULARITIES.includes(requested) && requested !== 'auto') return requested
  const durationDays = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000))
  if (durationDays <= 2) return 'hour'
  if (durationDays <= 90) return 'day'
  return 'week'
}

export function usageBucketDate(date, granularity) {
  const bucket = new Date(date)
  if (granularity === 'minute') {
    bucket.setSeconds(0, 0)
  } else if (granularity === 'hour') {
    bucket.setMinutes(0, 0, 0)
  } else {
    bucket.setHours(0, 0, 0, 0)
    if (granularity === 'week') {
      const day = bucket.getDay() || 7
      bucket.setDate(bucket.getDate() - day + 1)
    }
  }
  return bucket
}

export function usageBucketCount(fromDate, toDate, granularity) {
  const intervalMs = granularity === 'minute'
    ? 60 * 1000
    : granularity === 'hour'
      ? 60 * 60 * 1000
      : granularity === 'week' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  return Math.floor(Math.max(0, toDate.getTime() - fromDate.getTime()) / intervalMs) + 1
}

export function usageBucketKey(date) {
  return date.toISOString()
}

export function formatUsageNumber(value, language = 'zh-CN') {
  const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US'
  return new Intl.NumberFormat(locale).format(Math.max(0, Math.round(Number(value) || 0)))
}

export function formatUsageCompact(value, language = 'zh-CN') {
  const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US'
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, Math.round(Number(value) || 0)))
}

export function usageBucketLabel(date, granularity, language = 'zh-CN') {
  const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US'
  const options = granularity === 'minute' || granularity === 'hour'
    ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric' }
  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function usageRangeLabel(value, language = 'zh-CN', endOfRange = false) {
  const date = parseUsageDate(value, endOfRange)
  if (!date) return value
  const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export function buildUsageChart(records, fromValue, toValue, requestedGranularity = 'auto') {
  const fromDate = parseUsageDate(fromValue)
  const toDate = parseUsageDate(toValue, true)
  if (!fromDate || !toDate || fromDate > toDate) {
    return { granularity: 'day', buckets: [], series: [], totalTokens: 0 }
  }

  const granularity = usageGranularity(fromDate, toDate, requestedGranularity)
  const firstBucket = usageBucketDate(fromDate, granularity)
  const lastBucket = usageBucketDate(toDate, granularity)
  const buckets = []
  const bucketIndexes = new Map()
  const cursor = new Date(firstBucket)
  let guard = 0
  while (cursor <= lastBucket && guard < MAX_USAGE_BUCKETS) {
    const bucket = new Date(cursor)
    bucketIndexes.set(usageBucketKey(bucket), buckets.length)
    buckets.push(bucket)
    if (granularity === 'minute') cursor.setMinutes(cursor.getMinutes() + 1)
    else if (granularity === 'hour') cursor.setHours(cursor.getHours() + 1)
    else if (granularity === 'day') cursor.setDate(cursor.getDate() + 1)
    else cursor.setDate(cursor.getDate() + 7)
    guard += 1
  }

  const modelValues = new Map()
  records.forEach((record) => {
    const timestamp = new Date(record?.timestamp || '')
    if (!Number.isFinite(timestamp.getTime()) || timestamp < fromDate || timestamp > toDate) return
    const model = typeof record?.model === 'string' && record.model.trim() ? record.model.trim() : 'unknown'
    const total = Math.max(0, Math.round(Number(record?.totalTokens) || (Number(record?.inputTokens) || 0) + (Number(record?.outputTokens) || 0)))
    if (!total) return
    const bucketIndex = bucketIndexes.get(usageBucketKey(usageBucketDate(timestamp, granularity)))
    if (bucketIndex === undefined) return
    if (!modelValues.has(model)) modelValues.set(model, Array.from({ length: buckets.length }, () => 0))
    modelValues.get(model)[bucketIndex] += total
  })

  const series = Array.from(modelValues.entries())
    .map(([model, values], index) => ({
      model,
      values,
      total: values.reduce((sum, value) => sum + value, 0),
      color: USAGE_CHART_COLORS[index % USAGE_CHART_COLORS.length],
    }))
    .sort((left, right) => right.total - left.total || left.model.localeCompare(right.model))
    .map((seriesItem, index) => ({ ...seriesItem, color: USAGE_CHART_COLORS[index % USAGE_CHART_COLORS.length] }))

  return {
    granularity,
    buckets,
    series,
    totalTokens: series.reduce((sum, seriesItem) => sum + seriesItem.total, 0),
  }
}

export function emptyRoleDraft() {
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
    speechStyle: '',
    avatar: '',
    avatarName: '',
    avatarRemoved: false,
    drawingPolicy: '',
    writingPolicy: '',
    screenVisionIntervalSec: '5',
    screenVisionChangeThreshold: '8',
    initiativeTimeoutSec: '10',
    initiativePrompt: '',
    abilities: [...NEW_ROLE_DEFAULT_ABILITY_IDS],
    knowledgeText: '',
    knowledgeFiles: [],
  }
}

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

export function formatElapsed(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
  const remainder = String(seconds % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}

export function clampNumber(value, min, max, fallback = min) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

export function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

export function transcriptText(value) {
  return typeof value === 'string' ? value : ''
}

export function hasVisibleTranscriptText(value) {
  return transcriptText(value).trim().length > 0
}

export const SESSION_ARTIFACT_FORMAT = 'cosight-session'
export const SESSION_ARTIFACT_VERSION = 1
export const MAX_SESSION_MESSAGES = 5000
export const MAX_SESSION_EVENTS = 5000

export function makeSessionId(prefix = 'session') {
  try {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
  } catch {
    // The fallback keeps exports usable in older Electron runtimes.
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function cloneSessionValue(value, maxLength = 16000) {
  try {
    const serialized = JSON.stringify(value)
    if (serialized.length <= maxLength) return JSON.parse(serialized)
    return { truncated: true, preview: serialized.slice(0, maxLength) }
  } catch {
    return { truncated: true, preview: String(value) }
  }
}

export function sessionRoleSnapshot(role) {
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
    speechStyle: typeof role.speechStyle === 'string' ? role.speechStyle : '',
    abilities: Array.isArray(role.abilities) ? role.abilities.filter((item) => typeof item === 'string') : [],
    drawingPolicy: typeof role.drawingPolicy === 'string' ? role.drawingPolicy : '',
    writingPolicy: typeof role.writingPolicy === 'string' ? role.writingPolicy : '',
    screenVisionIntervalSec: role.screenVisionIntervalSec ?? '',
    screenVisionChangeThreshold: role.screenVisionChangeThreshold ?? '',
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

export function normalizeImportedSessionArtifact(value) {
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
      subtitles: Boolean(value.capabilities.subtitles),
      initiative: Boolean(value.capabilities.initiative),
    } : {},
    messages,
    capabilityCalls,
  }
}

export function normalizeDrawingStroke(stroke) {
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

export function sourceCaptureKind(source) {
  if (source?.captureKind === 'screen' || source?.type === 'screen' || source?.kind === 'screen') return 'screen'
  if (source?.captureKind === 'window' || source?.type === 'window' || source?.kind === 'window') return 'window'
  if (String(source?.id || '').startsWith('screen:')) return 'screen'
  if (String(source?.id || '').startsWith('window:')) return 'window'
  return 'unknown'
}

export function normalizeSeeDebugBoxes(signal) {
  const payload = signal?.payload && typeof signal.payload === 'object' ? signal.payload : {}
  const boxes = []
  const appendBox = (item, index, kind) => {
    const bbox = item?.bbox
    const x = Number(bbox?.x)
    const y = Number(bbox?.y)
    const width = Number(bbox?.width)
    const height = Number(bbox?.height)
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return
    const left = clampNumber(x, 0, 1, 0)
    const top = clampNumber(y, 0, 1, 0)
    const right = clampNumber(x + width, 0, 1, 0)
    const bottom = clampNumber(y + height, 0, 1, 0)
    if (right <= left || bottom <= top) return
    const rawLabel = kind === 'object'
      ? item?.label || item?.objectId || `object_${index + 1}`
      : item?.text || item?.textContent || `text_${index + 1}`
    boxes.push({
      id: item?.objectId || `${kind}_${index + 1}`,
      kind,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      label: String(rawLabel).replace(/\s+/g, ' ').trim().slice(0, 48),
    })
  }
  if (Array.isArray(payload.objects)) payload.objects.forEach((item, index) => appendBox(item, index, 'object'))
  if (Array.isArray(payload.textBlocks)) payload.textBlocks.forEach((item, index) => appendBox(item, index, 'text'))
  return boxes.slice(0, 64)
}

export function normalizeSourceRect(sourceWidth, sourceHeight, sourceRect) {
  const left = clampNumber(sourceRect?.left, 0, Math.max(0, sourceWidth - 1), 0)
  const top = clampNumber(sourceRect?.top, 0, Math.max(0, sourceHeight - 1), 0)
  const width = Math.max(1, Math.min(sourceWidth - left, Number(sourceRect?.width) || sourceWidth))
  const height = Math.max(1, Math.min(sourceHeight - top, Number(sourceRect?.height) || sourceHeight))
  return { left, top, width, height }
}

export function drawStrokesOnCapturedFrame(context, canvas, strokes, sourceWidth, sourceHeight, sourceRect) {
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
