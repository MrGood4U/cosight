import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_ROLE_ABILITY_IDS,
  DEFAULT_SCREEN_VISION_INTERVAL_SECONDS,
  DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD,
  DEFAULT_SEE_MAX_OBJECTS,
  HARNESS_MODULES,
  buildInitiativeCommand,
  configuredHarnessModels,
  configuredHarnessSettings,
  defaultRoleForRuntime,
  normalizeInitiativeInstructions,
  normalizeInitiativeTimeout,
  normalizeRoleAbilities,
  normalizeScreenVisionChangeThreshold,
  normalizeScreenVisionInterval,
  normalizeSeeMaxObjects,
  normalizeUsageRecord,
  publicHarnessModel,
} from '../../electron/runtime-utils.mjs'

import {
  DEFAULT_ROLE_ABILITY_IDS as RENDERER_DEFAULT_ROLE_ABILITY_IDS,
  DEFAULT_SCREEN_VISION_INTERVAL_SECONDS as RENDERER_DEFAULT_SCREEN_VISION_INTERVAL_SECONDS,
  DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD as RENDERER_DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD,
  emptyConversationSummary,
  normalizeConversationSummary,
  normalizeImportedSessionArtifact,
} from '../../src/app/shared.js'

test('role abilities migrate writing and subtitles into drawing', () => {
  assert.deepEqual(
    normalizeRoleAbilities(['writing', 'subtitles', 'drawing', 'drawing', 'unknown', 'initiative']),
    ['drawing', 'initiative'],
  )
})

test('screen vision and initiative settings are clamped to safe ranges', () => {
  assert.equal(normalizeScreenVisionInterval('0'), 1)
  assert.equal(normalizeScreenVisionInterval('999'), 60)
  assert.equal(normalizeScreenVisionInterval('not-a-number'), 5)
  assert.equal(normalizeScreenVisionChangeThreshold('-1'), 1)
  assert.equal(normalizeScreenVisionChangeThreshold('999'), 100)
  assert.equal(normalizeScreenVisionChangeThreshold('not-a-number'), 8)
  assert.equal(normalizeInitiativeTimeout('1'), 5)
  assert.equal(normalizeInitiativeTimeout('999'), 300)
  assert.equal(normalizeInitiativeTimeout('not-a-number'), 10)
  assert.equal(DEFAULT_SEE_MAX_OBJECTS, 8)
  assert.equal(normalizeSeeMaxObjects('0'), 1)
  assert.equal(normalizeSeeMaxObjects('999'), 20)
  assert.equal(normalizeSeeMaxObjects('not-a-number'), 8)
})

test('the virtual Default role has the same runtime capability defaults as the renderer', () => {
  const role = defaultRoleForRuntime()
  assert.deepEqual(role.abilities, DEFAULT_ROLE_ABILITY_IDS)
  assert.equal(DEFAULT_ROLE_ABILITY_IDS.join(','), RENDERER_DEFAULT_ROLE_ABILITY_IDS.join(','))
  assert.equal(DEFAULT_SCREEN_VISION_INTERVAL_SECONDS, RENDERER_DEFAULT_SCREEN_VISION_INTERVAL_SECONDS)
  assert.equal(role.screenVisionIntervalSec, DEFAULT_SCREEN_VISION_INTERVAL_SECONDS)
  assert.equal(role.screenVisionChangeThreshold, DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD)
  assert.equal(DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD, RENDERER_DEFAULT_SCREEN_VISION_CHANGE_THRESHOLD)
  assert.equal(role.knowledgeMode, 'prompt')
  assert.equal(role.knowledgeRetrievalMode, 'fast')
})

test('Harness settings keep all configured context controls in bounds', () => {
  assert.deepEqual(configuredHarnessSettings({}), {
    seeMinIntervalMs: 5000,
    recentConversationCount: 20,
    recentVisionCount: 1,
  })
  assert.deepEqual(configuredHarnessSettings({
    harnessSettings: {
      seeMinIntervalMs: 999999,
      recentConversationCount: 0,
      recentVisionCount: 999,
    },
  }), {
    seeMinIntervalMs: 60000,
    recentConversationCount: 1,
    recentVisionCount: 20,
  })
})

test('Harness model configuration always exposes the four model slots', () => {
  const models = configuredHarnessModels({
    harnessModels: {
      brain: { id: 'brain-1', name: 'mock-brain', apiKey: 'secret' },
      ignored: { id: 'ignored' },
    },
  })
  assert.deepEqual(Object.keys(models), HARNESS_MODULES)
  assert.equal(models.brain.name, 'mock-brain')
  assert.equal(models.listen, null)
  assert.equal(models.ignored, undefined)
  assert.deepEqual(publicHarnessModel(models.brain), {
    id: 'brain-1',
    alias: '',
    name: 'mock-brain',
    url: undefined,
    voice: '',
    hasApiKey: true,
  })
  assert.equal(publicHarnessModel(null), null)
})

test('usage records normalize provider token field variants without exposing keys', () => {
  assert.deepEqual(normalizeUsageRecord({
    recordedAt: '2026-08-28T12:00:00Z',
    sessionId: 'session-1',
    module: 'brain',
    model: 'mock-brain',
    usage: { prompt_tokens: 12.4, completion_tokens: 7.6 },
    apiKey: 'must-not-be-copied',
  }), {
    timestamp: '2026-08-28T12:00:00Z',
    sessionId: 'session-1',
    module: 'brain',
    model: 'mock-brain',
    inputTokens: 12,
    outputTokens: 8,
    totalTokens: 20,
  })
  assert.equal(normalizeUsageRecord({ model: 'mock-brain', totalTokens: 0 }), null)
})

test('initiative routing preserves legacy mode and sends a Harness command in Harness mode', () => {
  const prompt = ` ${'a'.repeat(21000)} `
  const harnessCommand = buildInitiativeCommand('harness', prompt)
  const legacyCommand = buildInitiativeCommand('legacy', prompt)
  assert.equal(harnessCommand.type, 'initiative')
  assert.equal(harnessCommand.data.length, 20000)
  assert.equal(legacyCommand.type, 'response.create')
  assert.equal(legacyCommand.instructions.length, 20000)
  assert.equal(normalizeInitiativeInstructions('   '), '')
  assert.equal(buildInitiativeCommand('harness', '   '), null)
})

test('conversation summaries stay compact and preserve the import/export shape', () => {
  const summary = normalizeConversationSummary({
    topic: '  当前会话  ',
    facts: ['用户已选择 Harness', '', '第二条'],
    decisions: [],
    pendingTasks: ['继续测试'],
    lastIntent: '检查会话摘要',
  })
  assert.deepEqual(summary, {
    topic: '当前会话',
    facts: ['用户已选择 Harness', '第二条'],
    decisions: [],
    pendingTasks: ['继续测试'],
    lastIntent: '检查会话摘要',
    updatedAt: '',
  })

  const artifact = normalizeImportedSessionArtifact({
    format: 'cosight-session',
    version: 1,
    messages: [],
    conversationSummary: summary,
  })
  assert.deepEqual(artifact.conversationSummary, summary)
  assert.deepEqual(normalizeConversationSummary(undefined), emptyConversationSummary())
})
