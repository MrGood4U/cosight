import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Worker } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'

export const KNOWLEDGE_MODES = ['none', 'prompt', 'rag']
export const KNOWLEDGE_SCHEMA_VERSION = 2
export const DEFAULT_KNOWLEDGE_MATCH_COUNT = 5
export const DEFAULT_KNOWLEDGE_MIN_SCORE = 0.2
export const MAX_KNOWLEDGE_SOURCE_CHARS = 500_000
export const MAX_KNOWLEDGE_SOURCES = 100
export const MAX_KNOWLEDGE_TOTAL_CHARS = 5_000_000
export const MAX_KNOWLEDGE_CHUNKS = 20_000
export const MAX_KNOWLEDGE_VECTOR_DIMENSION = 4096
export const KNOWLEDGE_CHUNK_CHARS = 2_400
export const KNOWLEDGE_CHUNK_OVERLAP = 300

function text(value, max = MAX_KNOWLEDGE_SOURCE_CHARS) {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : ''
}

function hash(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex')
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return
  const error = new Error('知识库重建已取消。')
  error.name = 'AbortError'
  throw error
}

function openDatabase(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS knowledge_sources (
      source_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      character_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      chunk_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      character_count INTEGER NOT NULL DEFAULT 0,
      embedding_model_id TEXT NOT NULL,
      embedding_dimension INTEGER NOT NULL,
      embedding BLOB NOT NULL,
      FOREIGN KEY (source_id) REFERENCES knowledge_sources(source_id)
    );
    CREATE INDEX IF NOT EXISTS knowledge_chunks_source_idx ON knowledge_chunks(source_id, chunk_index);
  `)
  return db
}

function setMeta(db, key, value) {
  db.prepare(`
    INSERT INTO knowledge_meta(key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value ?? ''))
}

function getMeta(db) {
  const result = {}
  for (const row of db.prepare('SELECT key, value FROM knowledge_meta').all()) result[row.key] = row.value
  return result
}

export function normalizeKnowledgeMode(value) {
  return KNOWLEDGE_MODES.includes(value) ? value : 'prompt'
}

export function contentHash(value) {
  return hash(value)
}

export function knowledgeSourceFingerprint(value = {}) {
  const files = (Array.isArray(value?.knowledgeFiles) ? value.knowledgeFiles : []).map((file) => ({
    id: file?.id || '',
    name: file?.name || '',
    size: Number(file?.size) || 0,
    hash: file?.hash || '',
  }))
  return hash(JSON.stringify({
    knowledgeText: typeof value?.knowledgeText === 'string' ? value.knowledgeText : '',
    knowledgeFiles: files,
  }))
}

export function chunkKnowledgeText(value, maxChars = KNOWLEDGE_CHUNK_CHARS, overlap = KNOWLEDGE_CHUNK_OVERLAP) {
  const source = text(value)
  if (!source) return []
  const chunks = []
  let cursor = 0
  while (cursor < source.length) {
    let end = Math.min(source.length, cursor + maxChars)
    if (end < source.length) {
      const boundary = Math.max(cursor + Math.floor(maxChars * 0.55), source.lastIndexOf('\n\n', end))
      const lineBoundary = source.lastIndexOf('\n', end)
      if (boundary > cursor) end = boundary
      else if (lineBoundary > cursor) end = lineBoundary
    }
    const content = source.slice(cursor, end).trim()
    if (content) chunks.push(content)
    if (end >= source.length) break
    cursor = Math.max(cursor + 1, end - Math.min(overlap, Math.floor(maxChars / 3)))
  }
  return chunks
}

export function vectorToBlob(vector) {
  if (!Array.isArray(vector) && !(vector instanceof Float32Array)) throw new Error('Embedding 返回值不是向量数组。')
  const values = Array.from(vector, Number)
  if (!values.length || values.length > MAX_KNOWLEDGE_VECTOR_DIMENSION || values.some((value) => !Number.isFinite(value))) throw new Error('Embedding 向量包含无效数值。')
  return Buffer.from(new Float32Array(values).buffer)
}

export function blobToVector(blob) {
  if (!blob || blob.byteLength % 4 !== 0) return []
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob)
  return Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4))
}

export function cosineSimilarity(left, right) {
  if (!left.length || left.length !== right.length) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }
  if (!leftNorm || !rightNorm) return 0
  return dot / Math.sqrt(leftNorm * rightNorm)
}

export function getKnowledgeStatus(dbPath) {
  if (!dbPath || !existsSync(dbPath)) return {
    status: 'not_indexed',
    sourceCount: 0,
    chunkCount: 0,
    embeddingModelId: '',
    embeddingFingerprint: '',
    embeddingDimension: 0,
    knowledgeSourceFingerprint: '',
    error: '',
  }
  let db
  try {
    db = openDatabase(dbPath)
    const meta = getMeta(db)
    const sourceCount = Number(db.prepare('SELECT COUNT(*) AS count FROM knowledge_sources').get().count || 0)
    const chunkCount = Number(db.prepare('SELECT COUNT(*) AS count FROM knowledge_chunks').get().count || 0)
    return {
      status: meta.status || (chunkCount ? 'ready' : 'empty'),
      sourceCount,
      chunkCount,
      embeddingModelId: meta.embeddingModelId || '',
      embeddingFingerprint: meta.embeddingFingerprint || '',
      embeddingDimension: Number(meta.embeddingDimension || 0),
      knowledgeSourceFingerprint: meta.knowledgeSourceFingerprint || '',
      error: meta.error || '',
      updatedAt: meta.updatedAt || '',
    }
  } catch (error) {
    return { status: 'error', sourceCount: 0, chunkCount: 0, embeddingModelId: '', embeddingFingerprint: '', embeddingDimension: 0, knowledgeSourceFingerprint: '', error: error.message }
  } finally {
    db?.close()
  }
}

export function updateKnowledgeStatus(dbPath, status, details = {}) {
  let db
  try {
    db = openDatabase(dbPath)
    setMeta(db, 'status', status)
    if (details.error !== undefined) setMeta(db, 'error', details.error)
    if (details.embeddingModelId !== undefined) setMeta(db, 'embeddingModelId', details.embeddingModelId)
    if (details.embeddingFingerprint !== undefined) setMeta(db, 'embeddingFingerprint', details.embeddingFingerprint)
    if (details.embeddingDimension !== undefined) setMeta(db, 'embeddingDimension', details.embeddingDimension)
    if (details.knowledgeSourceFingerprint !== undefined) setMeta(db, 'knowledgeSourceFingerprint', details.knowledgeSourceFingerprint)
    setMeta(db, 'updatedAt', new Date().toISOString())
  } finally {
    db?.close()
  }
  return getKnowledgeStatus(dbPath)
}

export async function rebuildKnowledgeDatabase({ dbPath, roleId, embeddingModelId, embeddingFingerprint = '', knowledgeSourceFingerprint: sourceFingerprint = '', sources, embed, sourceErrors = [], canPublish, signal, onProgress }) {
  throwIfAborted(signal)
  if (!dbPath) throw new Error('知识库路径不能为空。')
  if (typeof embed !== 'function') throw new Error('未提供 Embedding 生成器。')
  const normalizedSources = (Array.isArray(sources) ? sources : [])
    .map((source, sourceIndex) => ({
      id: text(source?.id, 160) || `source-${sourceIndex + 1}`,
      name: text(source?.name, 240) || `Knowledge ${sourceIndex + 1}`,
      type: text(source?.type, 40) || extname(text(source?.name, 240)).slice(1) || 'text',
      content: text(source?.content),
    }))
    .filter((source) => source.content)
  if (normalizedSources.length > MAX_KNOWLEDGE_SOURCES) {
    throw new Error(`知识来源超过 ${MAX_KNOWLEDGE_SOURCES} 个的上限。`)
  }
  const totalCharacters = normalizedSources.reduce((total, source) => total + source.content.length, 0)
  if (totalCharacters > MAX_KNOWLEDGE_TOTAL_CHARS) {
    throw new Error(`知识库内容超过 ${MAX_KNOWLEDGE_TOTAL_CHARS.toLocaleString()} 个字符的上限。`)
  }
  const pendingChunks = normalizedSources.flatMap((source) => chunkKnowledgeText(source.content).map((content, index) => ({
    source,
    index,
    content,
  })))
  if (pendingChunks.length > MAX_KNOWLEDGE_CHUNKS) {
    throw new Error(`知识库片段超过 ${MAX_KNOWLEDGE_CHUNKS.toLocaleString()} 个的上限。`)
  }
  const reportProgress = (progress, processedChunks = 0) => {
    if (typeof onProgress !== 'function') return
    try {
      onProgress({
        progress: Math.max(0, Math.min(95, Math.round(Number(progress) || 0))),
        processedChunks,
        totalChunks: pendingChunks.length,
      })
    } catch {
      // Progress reporting must never interrupt the knowledge build.
    }
  }
  reportProgress(0)
  const vectors = []
  for (let index = 0; index < pendingChunks.length; index += 16) {
    throwIfAborted(signal)
    const batch = pendingChunks.slice(index, index + 16)
    const batchVectors = await embed(batch.map((item) => item.content), { signal })
    throwIfAborted(signal)
    if (!Array.isArray(batchVectors) || batchVectors.length !== batch.length) {
      throw new Error(`Embedding 返回数量异常：期望 ${batch.length}，实际 ${batchVectors?.length || 0}。`)
    }
    vectors.push(...batchVectors)
    const processedChunks = Math.min(index + batch.length, pendingChunks.length)
    reportProgress(pendingChunks.length ? (processedChunks / pendingChunks.length) * 95 : 95, processedChunks)
  }
  const dimension = vectors[0]?.length || 0
  if (vectors.some((vector) => !Array.isArray(vector) || vector.length !== dimension)) {
    throw new Error('Embedding 返回的向量维度不一致。')
  }
  let db
  try {
    throwIfAborted(signal)
    if (typeof canPublish === 'function' && !canPublish()) return null
    db = openDatabase(dbPath)
    db.exec('BEGIN IMMEDIATE')
    db.exec('DELETE FROM knowledge_chunks; DELETE FROM knowledge_sources;')
    const insertSource = db.prepare('INSERT INTO knowledge_sources(source_id, name, source_type, source_hash, character_count) VALUES (?, ?, ?, ?, ?)')
    for (const source of normalizedSources) insertSource.run(source.id, source.name, source.type, hash(source.content), source.content.length)
    const insertChunk = db.prepare('INSERT INTO knowledge_chunks(chunk_id, source_id, chunk_index, content, character_count, embedding_model_id, embedding_dimension, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    pendingChunks.forEach((item, index) => insertChunk.run(
      `${item.source.id}:${item.index}`,
      item.source.id,
      item.index,
      item.content,
      item.content.length,
      embeddingModelId,
      dimension,
      vectorToBlob(vectors[index]),
    ))
    setMeta(db, 'schemaVersion', KNOWLEDGE_SCHEMA_VERSION)
    setMeta(db, 'roleId', roleId)
    setMeta(db, 'embeddingModelId', embeddingModelId)
    setMeta(db, 'embeddingFingerprint', embeddingFingerprint)
    setMeta(db, 'knowledgeSourceFingerprint', sourceFingerprint)
    setMeta(db, 'embeddingDimension', dimension)
    setMeta(db, 'status', sourceErrors.length ? 'ready_with_errors' : (pendingChunks.length ? 'ready' : 'empty'))
    setMeta(db, 'error', sourceErrors.join('；'))
    setMeta(db, 'updatedAt', new Date().toISOString())
    db.exec('COMMIT')
    return getKnowledgeStatus(dbPath)
  } catch (error) {
    try { db?.exec('ROLLBACK') } catch { /* Preserve the original error. */ }
    throw error
  } finally {
    db?.close()
  }
}

export function searchKnowledgeDatabaseAsync(options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    const unpackedWorker = typeof process.resourcesPath === 'string'
      ? join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'knowledge-search-worker.mjs')
      : ''
    const workerUrl = unpackedWorker && existsSync(unpackedWorker)
      ? pathToFileURL(unpackedWorker)
      : new URL('./knowledge-search-worker.mjs', import.meta.url)
    const worker = new Worker(workerUrl, {
      workerData: options,
    })
    const finish = (error, value) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve(value)
      void worker.terminate()
    }
    worker.once('message', (message) => {
      if (message?.ok) finish(null, Array.isArray(message.results) ? message.results : [])
      else finish(new Error(message?.error || '知识库检索线程失败。'))
    })
    worker.once('error', (error) => finish(error))
    worker.once('exit', (code) => {
      if (!settled && code !== 0) finish(new Error(`知识库检索线程退出（${code}）。`))
    })
  })
}

export function searchKnowledgeDatabase({
  dbPath,
  queryVector,
  limit = DEFAULT_KNOWLEDGE_MATCH_COUNT,
  minScore = DEFAULT_KNOWLEDGE_MIN_SCORE,
  expectedEmbeddingModelId,
  expectedEmbeddingFingerprint,
  expectedEmbeddingDimension,
}) {
  if (!dbPath || !existsSync(dbPath)) return []
  const vector = Array.isArray(queryVector) ? queryVector : []
  if (!vector.length) return []
  let db
  try {
    db = openDatabase(dbPath)
    const meta = getMeta(db)
    if (!['ready', 'ready_with_errors'].includes(meta.status)) return []
    if (expectedEmbeddingModelId !== undefined && meta.embeddingModelId !== String(expectedEmbeddingModelId || '')) return []
    if (expectedEmbeddingFingerprint !== undefined && meta.embeddingFingerprint !== String(expectedEmbeddingFingerprint || '')) return []
    const storedDimension = Number(meta.embeddingDimension || 0)
    if (expectedEmbeddingDimension !== undefined && storedDimension !== Number(expectedEmbeddingDimension || 0)) return []
    if (storedDimension <= 0 || vector.length !== storedDimension) return []
    const maximum = Math.max(1, Math.min(20, Number(limit) || DEFAULT_KNOWLEDGE_MATCH_COUNT))
    const threshold = Number.isFinite(Number(minScore)) ? Number(minScore) : DEFAULT_KNOWLEDGE_MIN_SCORE
    const results = []
    const rows = db.prepare(`
      SELECT chunks.chunk_id AS chunkId, chunks.source_id AS sourceId, sources.name AS document,
        chunks.chunk_index AS chunkIndex, chunks.content, chunks.embedding
      FROM knowledge_chunks AS chunks
      JOIN knowledge_sources AS sources ON sources.source_id = chunks.source_id
    `).iterate()
    for (const row of rows) {
      const rowVector = blobToVector(row.embedding)
      if (rowVector.length !== storedDimension) continue
      const score = cosineSimilarity(vector, rowVector)
      if (score < threshold) continue
      results.push({
        chunkId: row.chunkId,
        sourceId: row.sourceId,
        document: row.document,
        chunkIndex: row.chunkIndex,
        content: row.content,
        score,
      })
      results.sort((left, right) => right.score - left.score)
      if (results.length > maximum) results.pop()
    }
    return results
  } finally {
    db?.close()
  }
}
