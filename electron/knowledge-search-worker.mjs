import { parentPort, workerData } from 'node:worker_threads'

import { searchKnowledgeDatabase } from './knowledge-store.mjs'

try {
  const results = searchKnowledgeDatabase(workerData || {})
  parentPort?.postMessage({ ok: true, results })
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error?.message || String(error) })
}
