import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const electronSource = await readFile(new URL('../../electron/main.mjs', import.meta.url), 'utf8')
const harnessLoggingSource = await readFile(new URL('../../harness/logging.go', import.meta.url), 'utf8')
const harnessMetricsSource = await readFile(new URL('../../harness/metrics.go', import.meta.url), 'utf8')
const harnessBrainSource = await readFile(new URL('../../harness/brain.go', import.meta.url), 'utf8')
const harnessListenSource = await readFile(new URL('../../harness/listen.go', import.meta.url), 'utf8')
const legacyBridgeSource = await readFile(new URL('../../python/qwen_bridge.py', import.meta.url), 'utf8')

test('all runtime loggers persist explicit INFO, ERROR, and DEBUG levels', () => {
  assert.match(electronSource, /const level = normalizeLogLevel\(requestedLevel\) \|\| inferredLogLevel\(kind\)/)
  assert.match(electronSource, /JSON\.stringify\(\{ time: new Date\(\)\.toISOString\(\), level, kind, payload \}\)/)
  assert.match(harnessLoggingSource, /logLevelDebug = "DEBUG"/)
  assert.match(harnessLoggingSource, /logLevelInfo  = "INFO"/)
  assert.match(harnessLoggingSource, /logLevelError = "ERROR"/)
  assert.match(legacyBridgeSource, /"level": _log_level\(kind, level\)/)
})

test('performance and conversation diagnostics remain DEBUG-only records', () => {
  assert.match(harnessMetricsSource, /emitDebugLog\("performance\.latency\.summary"/)
  assert.match(harnessMetricsSource, /"averageMs"/)
  assert.match(harnessMetricsSource, /"p50Ms"/)
  assert.match(harnessMetricsSource, /"p95Ms"/)
  assert.match(harnessBrainSource, /emitDebugLog\("conversation\.content"/)
  assert.match(harnessListenSource, /emitDebugLog\("conversation\.content"/)
  assert.match(legacyBridgeSource, /debug_log\("conversation\.content"/)
})

test('Harness DEBUG records are forwarded with their original level', () => {
  assert.match(electronSource, /const \{ type, level, message, \.\.\.fields \} = payload/)
  assert.match(electronSource, /debugLog\(`harness\.\$\{message \|\| 'log'\}`, fields, level\)/)
})
