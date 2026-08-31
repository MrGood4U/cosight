export const ROLE_ABILITY_IDS = ['screenVision', 'listening', 'speaking', 'drawing', 'initiative']

// Writing remains a legacy alias for the unified Drawing capability.
const ROLE_ABILITY_ALIASES = { subtitles: 'drawing', writing: 'drawing' }

export const HARNESS_MODULES = ['brain', 'listen', 'speak', 'see']

// The renderer exposes a virtual Default role when no persisted role is
// selected. Keep its runtime capabilities and screen-vision defaults here so
// the main process does not have to infer them from a missing role object.
export const DEFAULT_ROLE_ABILITY_IDS = ['screenVision', 'listening', 'speaking', 'drawing']
export const DEFAULT_SCREEN_VISION_INTERVAL_SECONDS = 5
export const DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD = 8

export const DEFAULT_HARNESS_SETTINGS = {
  seeMinIntervalMs: 5000,
  recentConversationCount: 20,
  recentVisionCount: 1,
}

const DEFAULT_INITIATIVE_TIMEOUT_SECONDS = 10

export function defaultRoleForRuntime() {
  return {
    id: '',
    isDefault: true,
    name: 'Default',
    identity: 'Cosight 默认对话行为',
    listeningLanguage: 'auto',
    outputLanguage: 'auto',
    voice: '',
    speechStyle: '',
    abilities: [...DEFAULT_ROLE_ABILITY_IDS],
    drawingPolicy: '',
    writingPolicy: '',
    screenVisionIntervalSec: DEFAULT_SCREEN_VISION_INTERVAL_SECONDS,
    screenVisionChangeThreshold: DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD,
    initiativeTimeoutSec: '',
    initiativePrompt: '',
    knowledgeText: '',
    knowledgeFiles: [],
    knowledgeMode: 'prompt',
    knowledgeRetrievalMode: 'fast',
    embeddingModelId: '',
  }
}

export function normalizeRoleAbilities(value) {
  const result = []
  for (const ability of Array.isArray(value) ? value : []) {
    const normalized = ROLE_ABILITY_ALIASES[ability] || ability
    if (ROLE_ABILITY_IDS.includes(normalized) && !result.includes(normalized)) result.push(normalized)
  }
  return result
}

export function normalizeRoleText(value, maxLength = 20000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function normalizeInitiativeTimeout(value) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_INITIATIVE_TIMEOUT_SECONDS
  return Math.min(300, Math.max(5, parsed))
}

export function normalizeScreenVisionInterval(value) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_SCREEN_VISION_INTERVAL_SECONDS
  return Math.min(60, Math.max(1, parsed))
}

export function normalizeScreenVisionChangeThreshold(value) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD
  return Math.min(100, Math.max(1, parsed))
}

export function configuredHarnessModels(config) {
  const source = config?.harnessModels && typeof config.harnessModels === 'object' ? config.harnessModels : {}
  return Object.fromEntries(HARNESS_MODULES.map((module) => [module, source[module] || null]))
}

export function publicHarnessModel(model) {
  if (!model || typeof model !== 'object') return null
  return {
    id: model.id,
    alias: typeof model.alias === 'string' ? model.alias : '',
    name: model.name,
    url: model.url,
    voice: typeof model.voice === 'string' ? model.voice : '',
    hasApiKey: Boolean(model.apiKey),
  }
}

export function configuredHarnessSettings(config) {
  const intervalValue = Number(config?.harnessSettings?.seeMinIntervalMs)
  const conversationValue = Number(config?.harnessSettings?.recentConversationCount)
  const visionValue = Number(config?.harnessSettings?.recentVisionCount)
  return {
    seeMinIntervalMs: Number.isFinite(intervalValue)
      ? Math.min(60000, Math.max(1000, Math.round(intervalValue)))
      : DEFAULT_HARNESS_SETTINGS.seeMinIntervalMs,
    recentConversationCount: Number.isFinite(conversationValue)
      ? Math.min(100, Math.max(1, Math.round(conversationValue)))
      : DEFAULT_HARNESS_SETTINGS.recentConversationCount,
    recentVisionCount: Number.isFinite(visionValue)
      ? Math.min(20, Math.max(1, Math.round(visionValue)))
      : DEFAULT_HARNESS_SETTINGS.recentVisionCount,
  }
}

function usageCount(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return 0
  return Math.max(0, Math.round(number))
}

function readUsageCount(source, keys) {
  for (const key of keys) {
    const value = usageCount(source?.[key])
    if (value > 0) return value
  }
  return 0
}

export function normalizeUsageRecord(value) {
  if (!value || typeof value !== 'object') return null
  const usage = value.usage && typeof value.usage === 'object' ? value.usage : value
  const inputTokens = readUsageCount(usage, ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens'])
  const outputTokens = readUsageCount(usage, ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens'])
  const totalTokens = readUsageCount(usage, ['totalTokens', 'total_tokens']) || inputTokens + outputTokens
  const model = typeof value.model === 'string' ? value.model.trim().slice(0, 240) : ''
  if (!model || (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0)) return null
  const timestamp = typeof value.timestamp === 'string' && value.timestamp
    ? value.timestamp
    : typeof value.recordedAt === 'string' && value.recordedAt
      ? value.recordedAt
      : new Date().toISOString()
  return {
    timestamp: timestamp.slice(0, 80),
    sessionId: typeof value.sessionId === 'string' ? value.sessionId.slice(0, 160) : '',
    module: typeof value.module === 'string' ? value.module.slice(0, 40) : (typeof value.stage === 'string' ? value.stage.slice(0, 40) : 'unknown'),
    model,
    inputTokens,
    outputTokens,
    totalTokens,
  }
}

export function normalizeInitiativeInstructions(value) {
  return typeof value === 'string' ? value.trim().slice(0, 20000) : ''
}

export function buildInitiativeCommand(runtime, instructions) {
  const prompt = normalizeInitiativeInstructions(instructions)
  if (!prompt) return null
  return runtime === 'harness'
    ? { type: 'initiative', data: prompt }
    : { type: 'response.create', instructions: prompt }
}
