import { createHash } from 'node:crypto'

export const MAX_BATCH_SIZE = 32
export const EMBEDDING_REQUEST_TIMEOUT_MS = 20_000
export const MAX_EMBEDDING_INPUT_CHARS = 50_000
export const MAX_EMBEDDING_RESPONSE_BYTES = 10 * 1024 * 1024
export const MAX_EMBEDDING_DIMENSIONS = 4096

export function validateEmbeddingModelUrl(url, type = 'cloud') {
  const value = String(url || '').trim()
  if (!value) throw new Error('Embedding 模型 URL 不能为空。')
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('Embedding 服务 URL 格式无效。')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Embedding 服务 URL 只支持 HTTP 或 HTTPS。')
  }
  if (type !== 'local' && parsed.protocol !== 'https:') {
    throw new Error('云端 Embedding 模型必须使用 HTTPS。')
  }
  return parsed
}

function normalizeEndpoint(url, type = 'cloud') {
  const parsed = validateEmbeddingModelUrl(url, type)
  const value = parsed.toString().replace(/\/+$/, '')
  if (value.endsWith('/embeddings')) return value
  return `${value}/embeddings`
}

function responseMessage(body, status) {
  if (body && typeof body === 'object') {
    const message = body.error?.message || body.message || body.error
    if (message) return String(message)
  }
  return `Embedding 请求失败（HTTP ${status}）。`
}

export function normalizeEmbeddingModelInput(value) {
  const type = value?.type === 'local' ? 'local' : 'cloud'
  const alias = typeof value?.alias === 'string' ? value.alias.trim().slice(0, 120) : ''
  const url = typeof value?.url === 'string' ? value.url.trim().slice(0, 1000) : ''
  const model = typeof value?.model === 'string' ? value.model.trim().slice(0, 200) : ''
  const dimensions = Number(value?.dimensions)
  return {
    id: typeof value?.id === 'string' ? value.id : '',
    type,
    alias,
    url,
    model,
    dimensions: Number.isFinite(dimensions) && dimensions > 0 ? Math.min(MAX_EMBEDDING_DIMENSIONS, Math.round(dimensions)) : 0,
    apiKey: typeof value?.apiKey === 'string' ? value.apiKey.trim() : '',
  }
}

export function embeddingModelFingerprint(value) {
  const model = normalizeEmbeddingModelInput(value)
  return createHash('sha256').update(JSON.stringify({
    id: model.id,
    type: model.type,
    model: model.model,
    url: model.url,
    dimensions: model.dimensions,
  }), 'utf8').digest('hex')
}

async function readResponsePayload(response, signal) {
  if (response?.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader()
    const cancel = () => { void reader.cancel() }
    signal?.addEventListener('abort', cancel, { once: true })
    const chunks = []
    let totalBytes = 0
    try {
      while (true) {
        const result = await reader.read()
        if (result.done) break
        const chunk = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value || [])
        totalBytes += chunk.byteLength
        if (totalBytes > MAX_EMBEDDING_RESPONSE_BYTES) {
          try { await reader.cancel() } catch { /* Preserve the size error. */ }
          throw new Error('Embedding 响应过大，已拒绝处理。')
        }
        chunks.push(chunk)
      }
    } finally {
      signal?.removeEventListener('abort', cancel)
    }
    const merged = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }
    try { return JSON.parse(new TextDecoder().decode(merged)) } catch { return null }
  }
  if (typeof response?.text === 'function') {
    const raw = await response.text()
    if (Buffer.byteLength(raw, 'utf8') > MAX_EMBEDDING_RESPONSE_BYTES) {
      throw new Error('Embedding 响应过大，已拒绝处理。')
    }
    try { return JSON.parse(raw) } catch { return null }
  }
  try { return await response.json() } catch { return null }
}

function createAbortError() {
  const error = new Error('Embedding 请求已取消。')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError()
}

async function withTimeout(operation, externalSignal) {
  const controller = new AbortController()
  let externallyAborted = Boolean(externalSignal?.aborted)
  const abortFromOutside = () => {
    externallyAborted = true
    controller.abort()
  }
  if (externalSignal) externalSignal.addEventListener('abort', abortFromOutside, { once: true })
  const timeout = setTimeout(() => controller.abort(), EMBEDDING_REQUEST_TIMEOUT_MS)
  try {
    if (externallyAborted) throw createAbortError()
    const result = await operation(controller.signal)
    if (externallyAborted) throw createAbortError()
    if (controller.signal.aborted) throw new Error(`Embedding 请求超时（${EMBEDDING_REQUEST_TIMEOUT_MS} ms）。`)
    return result
  } catch (error) {
    if (externallyAborted || externalSignal?.aborted) throw createAbortError()
    if (controller.signal.aborted) throw new Error(`Embedding 请求超时（${EMBEDDING_REQUEST_TIMEOUT_MS} ms）。`)
    throw error
  } finally {
    clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', abortFromOutside)
  }
}

export async function embedTexts(model, inputs, fetchImpl = fetch, options = {}) {
  const signal = options?.signal
  throwIfAborted(signal)
  const texts = (Array.isArray(inputs) ? inputs : [inputs])
    .map((item) => String(item || '').trim().slice(0, MAX_EMBEDDING_INPUT_CHARS))
    .filter(Boolean)
  if (!texts.length) return []
  if (!model?.model) throw new Error('Embedding 模型名称不能为空。')
  const endpoint = normalizeEndpoint(model.url, model.type)
  const allEmbeddings = []
  for (let index = 0; index < texts.length; index += MAX_BATCH_SIZE) {
    throwIfAborted(signal)
    const batch = texts.slice(index, index + MAX_BATCH_SIZE)
    const body = { model: model.model, input: batch }
    if (Number.isFinite(Number(model.dimensions)) && Number(model.dimensions) > 0) body.dimensions = Number(model.dimensions)
    const response = await withTimeout((requestSignal) => fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: requestSignal,
    }), signal)
    let payload
    payload = await withTimeout((requestSignal) => readResponsePayload(response, requestSignal), signal)
    throwIfAborted(signal)
    if (!response.ok) throw new Error(responseMessage(payload, response.status))
    const data = Array.isArray(payload?.data) ? payload.data : []
    const ordered = data
      .map((item, itemIndex) => ({ index: Number.isFinite(Number(item?.index)) ? Number(item.index) : itemIndex, embedding: item?.embedding }))
      .sort((left, right) => left.index - right.index)
    const expectedIndexes = ordered.map((item) => item.index)
    if (
      ordered.length !== batch.length
      || ordered.some((item) => !Array.isArray(item.embedding))
      || new Set(expectedIndexes).size !== batch.length
      || expectedIndexes.some((item, itemIndex) => item !== itemIndex)
    ) {
      throw new Error('Embedding 服务返回了无效的向量数据。')
    }
    const normalized = ordered.map((item) => item.embedding.map(Number))
    if (normalized.some((vector) => (
      !vector.length
      || vector.length > MAX_EMBEDDING_DIMENSIONS
      || (Number(model.dimensions) > 0 && vector.length !== Number(model.dimensions))
      || vector.some((value) => !Number.isFinite(value))
    ))) {
      throw new Error('Embedding 服务返回了无效的向量数据。')
    }
    allEmbeddings.push(...normalized)
  }
  return allEmbeddings
}

export async function testEmbeddingModel(model, fetchImpl = fetch) {
  const embeddings = await embedTexts(model, ['Cosight embedding connectivity test'], fetchImpl)
  return { ok: embeddings.length === 1, dimensions: embeddings[0]?.length || 0 }
}
