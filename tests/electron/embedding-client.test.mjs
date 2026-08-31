import assert from 'node:assert/strict'
import test from 'node:test'
import { embedTexts, embeddingModelFingerprint, normalizeEmbeddingModelInput, validateEmbeddingModelUrl } from '../../electron/embedding-client.mjs'

test('embedding client normalizes cloud and local service configuration', () => {
  assert.deepEqual(normalizeEmbeddingModelInput({ type: 'local', name: 'Legacy config name', model: 'embed', url: 'http://127.0.0.1:8080/v1' }), {
    type: 'local', id: '', alias: '', model: 'embed', url: 'http://127.0.0.1:8080/v1', dimensions: 0, apiKey: '',
  })
  assert.equal(normalizeEmbeddingModelInput({ type: 'unknown' }).type, 'cloud')
})

test('embedding endpoints allow HTTP only for local models and require HTTPS for cloud models', () => {
  assert.doesNotThrow(() => validateEmbeddingModelUrl('http://127.0.0.1:8080/v1', 'local'))
  assert.doesNotThrow(() => validateEmbeddingModelUrl('https://example.test/v1', 'cloud'))
  assert.throws(() => validateEmbeddingModelUrl('http://example.test/v1', 'cloud'), /必须使用 HTTPS/u)
  assert.throws(() => validateEmbeddingModelUrl('file:///tmp/embeddings', 'local'), /只支持 HTTP 或 HTTPS/u)
})

test('embedding client sends OpenAI-compatible batched requests and keeps vector order', async () => {
  const calls = []
  const vectors = await embedTexts({
    type: 'cloud', model: 'text-embedding-v4', url: 'https://example.test/v1', apiKey: 'secret',
  }, ['first', 'second'], async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) })
    return { ok: true, async json() { return { data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] } } }
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://example.test/v1/embeddings')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret')
  assert.deepEqual(calls[0].body, { model: 'text-embedding-v4', input: ['first', 'second'] })
  assert.deepEqual(vectors, [[1, 0], [0, 1]])
})

test('embedding client reports provider errors instead of returning partial vectors', async () => {
  await assert.rejects(
    () => embedTexts({ model: 'embed', url: 'https://example.test/v1' }, ['query'], async () => ({
      ok: false,
      status: 401,
      async text() { return 'unauthorized' },
    })),
    /Embedding 请求失败（HTTP 401）/u,
  )
})

test('embedding requests stop promptly when the caller aborts a batch', async () => {
  const controller = new AbortController()
  let started
  const requestStarted = new Promise((resolve) => { started = resolve })
  const pending = embedTexts({ type: 'local', model: 'embed', url: 'http://127.0.0.1:8080/v1' }, ['query'], async (_url, options) => {
    started()
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true })
    })
  }, { signal: controller.signal })
  await requestStarted
  controller.abort()
  await assert.rejects(pending, (error) => error?.name === 'AbortError' && /已取消/u.test(error.message))
})

test('embedding model fingerprint changes when the effective provider configuration changes', () => {
  const base = { id: 'embed-1', type: 'local', model: 'embed-v1', url: 'http://127.0.0.1:8080/v1', dimensions: 768 }
  assert.notEqual(embeddingModelFingerprint(base), embeddingModelFingerprint({ ...base, url: 'http://127.0.0.1:8081/v1' }))
  assert.notEqual(embeddingModelFingerprint(base), embeddingModelFingerprint({ ...base, dimensions: 1024 }))
  assert.equal(embeddingModelFingerprint({ ...base, apiKey: 'one' }), embeddingModelFingerprint({ ...base, apiKey: 'two' }))
})
