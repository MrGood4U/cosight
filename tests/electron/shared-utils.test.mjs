import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AUDIO_INPUT_MODES,
  DEFAULT_AUDIO_INPUT_MODE,
  DEFAULT_OUTPUT_VOLUME,
  DEFAULT_SEE_MAX_OBJECTS,
  DEFAULT_TURN_DETECTION_SILENCE_DURATION_MS,
  MAX_USAGE_BUCKETS,
  buildUsageChart,
  clampNumber,
  cloneSessionValue,
  drawStrokesOnCapturedFrame,
  emptyRoleDraft,
  formatElapsed,
  hasVisibleTranscriptText,
  isHexColor,
  makeUsageRange,
  normalizeAudioInputMode,
  normalizeSeeMaxObjects,
  normalizeTurnDetectionSilenceDuration,
  normalizeDrawingStroke,
  normalizeImportedSessionArtifact,
  normalizeSeeDebugBoxes,
  normalizeSourceRect,
  parseUsageDate,
  sessionRoleSnapshot,
  sourceCaptureKind,
  toBase64,
  transcriptText,
  usageBucketCount,
  usageBucketDate,
  usageBucketLabel,
  usageFilterTimestamp,
  usageGranularity,
} from '../../src/app/shared.js'

test('audio input mode rejects unknown values and keeps the supported modes explicit', () => {
  assert.deepEqual(AUDIO_INPUT_MODES, ['microphone', 'system'])
  assert.equal(DEFAULT_AUDIO_INPUT_MODE, 'microphone')
  assert.equal(normalizeAudioInputMode('system'), 'system')
  assert.equal(normalizeAudioInputMode('speaker'), DEFAULT_AUDIO_INPUT_MODE)
})

test('usage date parsing handles date, datetime, invalid input, and inclusive end filters', () => {
  const date = parseUsageDate('2026-08-28')
  const end = parseUsageDate('2026-08-28', true)
  const dateTimeEnd = parseUsageDate('2026-08-28T12:34', true)
  assert.ok(date instanceof Date)
  assert.equal(date.getHours(), 0)
  assert.equal(date.getMinutes(), 0)
  assert.ok(end instanceof Date)
  assert.equal(end.getHours(), 23)
  assert.equal(end.getMinutes(), 59)
  assert.equal(end.getSeconds(), 59)
  assert.equal(end.getMilliseconds(), 999)
  assert.equal(dateTimeEnd.getSeconds(), 59)
  assert.equal(dateTimeEnd.getMilliseconds(), 999)
  assert.equal(parseUsageDate('2026/08/28'), null)
  assert.equal(parseUsageDate('not-a-date'), null)
  assert.equal(usageFilterTimestamp('2026-08-28'), date.toISOString())
  assert.equal(usageFilterTimestamp('not-a-date'), '')
})

test('usage range and bucket helpers support minute, hour, day, and week granularity', () => {
  const range = makeUsageRange({ hours: 1 })
  const from = parseUsageDate(range.from)
  const to = parseUsageDate(range.to)
  assert.ok(from && to)
  assert.ok(to.getTime() - from.getTime() >= 60 * 60 * 1000 - 60 * 1000)

  const source = new Date(2026, 7, 26, 13, 42, 27, 321)
  assert.equal(usageBucketDate(source, 'minute').getSeconds(), 0)
  assert.equal(usageBucketDate(source, 'minute').getMilliseconds(), 0)
  assert.equal(usageBucketDate(source, 'hour').getMinutes(), 0)
  assert.equal(usageBucketDate(source, 'day').getHours(), 0)
  assert.equal(usageBucketDate(source, 'week').getDay(), 1)
  assert.equal(usageGranularity(new Date(2026, 7, 28), new Date(2026, 7, 29), 'auto'), 'hour')
  assert.equal(usageGranularity(new Date(2026, 0, 1), new Date(2026, 5, 1), 'auto'), 'week')
  assert.equal(usageGranularity(new Date(), new Date(), 'minute'), 'minute')
  assert.equal(usageBucketCount(new Date(2026, 7, 28), new Date(2026, 7, 28, 0, 2), 'minute'), 3)
})

test('usage chart filters records, groups by model, sorts totals, and returns empty invalid ranges', () => {
  const chart = buildUsageChart([
    { timestamp: '2026-08-28T10:05:00', model: 'slow', totalTokens: 4 },
    { timestamp: '2026-08-28T10:35:00', model: 'fast', inputTokens: 5, outputTokens: 7 },
    { timestamp: '2026-08-28T10:55:00', model: 'slow', totalTokens: 6 },
    { timestamp: '2026-08-29T10:00:00', model: 'outside', totalTokens: 999 },
    { timestamp: '2026-08-28T10:15:00', model: 'empty', totalTokens: 0 },
  ], '2026-08-28T10:00', '2026-08-28T10:59', 'hour')
  assert.equal(chart.granularity, 'hour')
  assert.equal(chart.series.length, 2)
  assert.equal(chart.series[0].model, 'fast')
  assert.equal(chart.series[0].total, 12)
  assert.equal(chart.series[1].model, 'slow')
  assert.equal(chart.series[1].total, 10)
  assert.equal(chart.totalTokens, 22)
  assert.equal(chart.buckets.length, 1)

  const empty = buildUsageChart([], '2026-08-29', '2026-08-28', 'day')
  assert.deepEqual(empty, { granularity: 'day', buckets: [], series: [], totalTokens: 0 })
  assert.ok(MAX_USAGE_BUCKETS > 0)
  assert.match(usageBucketLabel(chart.buckets[0], 'hour', 'en-US'), /:/)
})

test('role, text, and generic value helpers keep unsafe or malformed values bounded', () => {
  const draft = emptyRoleDraft()
  assert.equal(draft.listeningLanguage, 'auto')
  assert.equal(draft.outputLanguage, 'auto')
  assert.equal(draft.screenVisionIntervalSec, '5')
  assert.equal(draft.screenVisionChangeThreshold, '8')
  assert.equal(draft.abilities.includes('drawing'), false)
  assert.equal(DEFAULT_OUTPUT_VOLUME, 48)
  assert.equal(DEFAULT_SEE_MAX_OBJECTS, 8)
  assert.equal(normalizeSeeMaxObjects(1), 1)
  assert.equal(normalizeSeeMaxObjects(999), 20)
  assert.equal(normalizeSeeMaxObjects(0), 1)
  assert.equal(normalizeSeeMaxObjects('invalid'), 8)
  assert.equal(DEFAULT_TURN_DETECTION_SILENCE_DURATION_MS, 1600)
  assert.equal(normalizeTurnDetectionSilenceDuration(200), 200)
  assert.equal(normalizeTurnDetectionSilenceDuration(99999), 6000)
  assert.equal(normalizeTurnDetectionSilenceDuration(50), 200)
  assert.equal(normalizeTurnDetectionSilenceDuration('invalid'), 1600)

  assert.equal(formatElapsed(125), '02:05')
  assert.equal(formatElapsed(undefined), '00:00')
  assert.equal(formatElapsed(Number.NaN), '00:00')
  assert.equal(clampNumber('bad', 1, 5, 3), 3)
  assert.equal(clampNumber(8, 1, 5), 5)
  assert.equal(isHexColor('#abcdef'), true)
  assert.equal(isHexColor('#abcd'), false)
  assert.equal(transcriptText(42), '')
  assert.equal(hasVisibleTranscriptText('  hello '), true)
  assert.equal(hasVisibleTranscriptText('  '), false)
  assert.equal(toBase64(new Uint8Array([65, 66, 67]).buffer), 'QUJD')

  const cloned = cloneSessionValue({ safe: true, nested: { value: 2 } })
  assert.deepEqual(cloned, { safe: true, nested: { value: 2 } })
  assert.deepEqual(cloneSessionValue({ value: 'x'.repeat(20) }, 10), { truncated: true, preview: '{"value":"' })
  assert.deepEqual(sessionRoleSnapshot({ id: 'r1', language: 'en-US', name: 'Role' }), {
    id: 'r1', name: 'Role', identity: '', goal: '', corePrinciples: '', behavior: '', workflow: '', constraints: '',
    listeningLanguage: 'en-US', outputLanguage: 'en-US', voice: '', speechStyle: '', abilities: [], drawingPolicy: '', writingPolicy: '',
    screenVisionIntervalSec: '', screenVisionChangeThreshold: '', initiativeTimeoutSec: '', initiativePrompt: '', knowledgeText: '', knowledgeMode: 'prompt', knowledgeRetrievalMode: 'fast', embeddingModelId: '', knowledgeFiles: [],
  })
  assert.equal(sessionRoleSnapshot({ knowledgeMode: 'rag', knowledgeRetrievalMode: 'deep' }).knowledgeRetrievalMode, 'deep')
})

test('session artifact normalization rejects invalid artifacts and removes media from safe event payloads', () => {
  assert.throws(() => normalizeImportedSessionArtifact({ format: 'wrong', version: 1, messages: [] }))
  assert.throws(() => normalizeImportedSessionArtifact({ format: 'cosight-session', version: 1 }))
  const artifact = normalizeImportedSessionArtifact({
    format: 'cosight-session',
    version: 1,
    messages: [
      { speaker: 'You', text: ' hello ' },
      { speaker: 'Cosight', text: '', image: 'drop' },
    ],
    capabilityCalls: [{ type: 'see.completed', payload: { image: 'drop', bbox: { x: 0.1 } } }],
    conversationSummary: { topic: 'topic' },
  })
  assert.equal(artifact.messages.length, 1)
  assert.equal(artifact.messages[0].text, 'hello')
  assert.deepEqual(artifact.capabilityCalls[0].payload, { bbox: { x: 0.1 } })
  assert.equal(artifact.conversationSummary.topic, 'topic')
})

test('drawing normalization clamps shorthand strokes and rejects malformed points', () => {
  assert.deepEqual(normalizeDrawingStroke([
    { x: -1, y: 0.2 },
    { x: 1.2, y: 0.8 },
  ]), {
    points: [{ x: 0, y: 0.2 }, { x: 1, y: 0.8 }],
    color: '#ff4d6d', width: 4, opacity: 0.95,
  })
  assert.deepEqual(normalizeDrawingStroke({
    points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
    color: '#00ff00', width: 30, opacity: 0,
  }), {
    points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
    color: '#00ff00', width: 24, opacity: 0.1,
  })
  assert.equal(normalizeDrawingStroke([{ x: 0, y: 0 }]), null)
  assert.equal(normalizeDrawingStroke([{ x: 0, y: 0 }, { x: 'bad', y: 1 }]), null)
})

test('screen source and See debug boxes normalize coordinates and source rectangles', () => {
  assert.equal(sourceCaptureKind({ id: 'screen:1' }), 'screen')
  assert.equal(sourceCaptureKind({ kind: 'window' }), 'window')
  assert.equal(sourceCaptureKind({ id: 'unknown' }), 'unknown')
  assert.deepEqual(normalizeSourceRect(100, 80, { left: -5, top: 70, width: 100, height: 100 }), {
    left: 0, top: 70, width: 100, height: 10,
  })
  const boxes = normalizeSeeDebugBoxes({ payload: {
    objects: [{ objectId: 'button', label: '按钮', bbox: { x: -0.1, y: 0.2, width: 0.5, height: 0.5 } }],
    textBlocks: [{ text: '确认', bbox: { x: 0.8, y: 0.8, width: 0.4, height: 0.4 } }],
  } })
  assert.equal(boxes.length, 2)
  assert.equal(boxes[0].id, 'button')
  assert.equal(boxes[0].kind, 'object')
  assert.equal(boxes[0].x, 0)
  assert.equal(boxes[0].y, 0.2)
  assert.equal(boxes[0].width, 0.4)
  assert.ok(Math.abs(boxes[0].height - 0.5) < Number.EPSILON)
  assert.equal(boxes[1].id, 'text_1')
  assert.equal(boxes[1].kind, 'text')
  assert.ok(Math.abs(boxes[1].width - 0.2) < Number.EPSILON)
  assert.ok(Math.abs(boxes[1].height - 0.2) < Number.EPSILON)
})

test('drawing renderer adapter maps normalized strokes into canvas coordinates and restores context', () => {
  const calls = []
  const context = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    moveTo: (...args) => calls.push(['moveTo', ...args]),
    lineTo: (...args) => calls.push(['lineTo', ...args]),
    stroke: () => calls.push('stroke'),
  }
  drawStrokesOnCapturedFrame(context, { width: 200, height: 100 }, [{
    points: [{ x: 0.25, y: 0.5 }, { x: 0.75, y: 1 }], color: '#123456', width: 2, opacity: 0.5,
  }], 100, 100, { left: 10, top: 20, width: 80, height: 50 })
  assert.deepEqual(calls, [
    'save', 'beginPath', ['moveTo', 37.5, 60], ['lineTo', 162.5, 160], 'stroke', 'restore',
  ])
  assert.equal(context.lineWidth, 4)
  assert.equal(context.globalAlpha, 0.5)
  assert.equal(context.strokeStyle, '#123456')
})
