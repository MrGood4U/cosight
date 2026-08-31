import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  blobToVector,
  chunkKnowledgeText,
  cosineSimilarity,
  DEFAULT_KNOWLEDGE_MIN_SCORE,
  getKnowledgeStatus,
  knowledgeSourceFingerprint,
  rebuildKnowledgeDatabase,
  searchKnowledgeDatabase,
  searchKnowledgeDatabaseAsync,
  updateKnowledgeStatus,
  vectorToBlob,
} from '../../electron/knowledge-store.mjs'
import { embeddingModelFingerprint } from '../../electron/embedding-client.mjs'

test('knowledge store chunks text, persists vectors, and retrieves the closest passages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cosight-knowledge-'))
  const dbPath = join(directory, 'knowledge.db')
  const roleSources = {
    knowledgeText: 'pasted reference',
    knowledgeFiles: [{ id: 'doc-a', name: 'alpha.md', size: 32, hash: 'hash-alpha' }],
  }
  const sourceFingerprint = knowledgeSourceFingerprint(roleSources)
  const progressEvents = []
  try {
    const status = await rebuildKnowledgeDatabase({
      dbPath,
      roleId: 'role-1',
      embeddingModelId: 'embed-1',
      knowledgeSourceFingerprint: sourceFingerprint,
      sources: [
        { id: 'doc-a', name: 'alpha.md', type: 'md', content: 'alpha topic and architecture' },
        { id: 'doc-b', name: 'beta.md', type: 'md', content: 'beta topic and database' },
      ],
      embed: async (texts) => texts.map((text) => text.includes('database') ? [0, 1] : [1, 0]),
      onProgress: (progress) => progressEvents.push(progress),
    })
    assert.equal(status.status, 'ready')
    assert.equal(status.sourceCount, 2)
    assert.equal(status.chunkCount, 2)
    assert.equal(getKnowledgeStatus(dbPath).embeddingModelId, 'embed-1')
    assert.equal(getKnowledgeStatus(dbPath).knowledgeSourceFingerprint, sourceFingerprint)
    assert.equal(progressEvents[0].progress, 0)
    assert.equal(progressEvents.at(-1).progress, 95)
    assert.equal(progressEvents.at(-1).processedChunks, 2)
    assert.equal(progressEvents.at(-1).totalChunks, 2)

    const matches = searchKnowledgeDatabase({ dbPath, queryVector: [0, 1], limit: 1 })
    assert.equal(matches.length, 1)
    assert.equal(matches[0].document, 'beta.md')
    assert.ok(matches[0].score > 0.99)
    const asyncMatches = await searchKnowledgeDatabaseAsync({ dbPath, queryVector: [0, 1], limit: 1 })
    assert.equal(asyncMatches[0].document, 'beta.md')
    assert.deepEqual(blobToVector(vectorToBlob([0, 1])), [0, 1])

    updateKnowledgeStatus(dbPath, 'error', { error: 'embedding unavailable' })
    assert.deepEqual(searchKnowledgeDatabase({ dbPath, queryVector: [0, 1], limit: 1 }), [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('knowledge source fingerprints change when configured knowledge changes', () => {
  const base = {
    knowledgeText: 'same reference',
    knowledgeFiles: [{ id: 'doc', name: 'notes.md', size: 10, hash: 'hash-1' }],
  }
  assert.equal(knowledgeSourceFingerprint(base), knowledgeSourceFingerprint({ ...base, knowledgeFiles: [...base.knowledgeFiles] }))
  assert.notEqual(knowledgeSourceFingerprint(base), knowledgeSourceFingerprint({ ...base, knowledgeText: 'new reference' }))
  assert.notEqual(knowledgeSourceFingerprint(base), knowledgeSourceFingerprint({
    ...base,
    knowledgeFiles: [{ ...base.knowledgeFiles[0], hash: 'hash-2' }],
  }))
})

test('knowledge store handles empty input and utility math safely', async () => {
  assert.deepEqual(chunkKnowledgeText(''), [])
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0)
  assert.equal(cosineSimilarity([], [1]), 0)
  const directory = await mkdtemp(join(tmpdir(), 'cosight-knowledge-empty-'))
  try {
    const status = await rebuildKnowledgeDatabase({
      dbPath: join(directory, 'knowledge.db'), roleId: 'role-empty', embeddingModelId: 'embed', sources: [], embed: async () => [],
    })
    assert.equal(status.status, 'empty')
    assert.equal(status.chunkCount, 0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('knowledge store rejects stale model fingerprints, dimensions, and low-score matches', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cosight-knowledge-validation-'))
  const dbPath = join(directory, 'knowledge.db')
  const fingerprint = embeddingModelFingerprint({ id: 'embed-1', type: 'local', name: 'Local', model: 'embed', url: 'http://127.0.0.1:8080/v1', dimensions: 2 })
  try {
    await rebuildKnowledgeDatabase({
      dbPath,
      roleId: 'role-validation',
      embeddingModelId: 'embed-1',
      embeddingFingerprint: fingerprint,
      sources: [{ id: 'doc', name: 'doc.md', content: 'relevant content' }],
      embed: async () => [[1, 0]],
    })
    assert.equal(searchKnowledgeDatabase({ dbPath, queryVector: [1, 0], expectedEmbeddingModelId: 'other', expectedEmbeddingFingerprint: fingerprint, expectedEmbeddingDimension: 1 }).length, 0)
    assert.equal(searchKnowledgeDatabase({ dbPath, queryVector: [1, 0], expectedEmbeddingModelId: 'embed-1', expectedEmbeddingFingerprint: 'stale', expectedEmbeddingDimension: 1 }).length, 0)
    assert.equal(searchKnowledgeDatabase({ dbPath, queryVector: [1], expectedEmbeddingModelId: 'embed-1', expectedEmbeddingFingerprint: fingerprint, expectedEmbeddingDimension: 1 }).length, 0)
    assert.equal(searchKnowledgeDatabase({ dbPath, queryVector: [0, 1], expectedEmbeddingModelId: 'embed-1', expectedEmbeddingFingerprint: fingerprint, expectedEmbeddingDimension: 2 }).length, 0)
    assert.ok(DEFAULT_KNOWLEDGE_MIN_SCORE > 0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('knowledge rebuild does not publish after the role is deleted during embedding', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cosight-knowledge-delete-race-'))
  const dbPath = join(directory, 'knowledge.db')
  let roleStillExists = true
  try {
    const status = await rebuildKnowledgeDatabase({
      dbPath,
      roleId: 'role-delete-race',
      embeddingModelId: 'embed-1',
      sources: [{ id: 'doc', name: 'doc.md', content: 'content' }],
      embed: async () => {
        roleStillExists = false
        return [[1, 0]]
      },
      canPublish: () => roleStillExists,
    })
    assert.equal(status, null)
    assert.equal(existsSync(dbPath), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('knowledge rebuild stops before the next embedding batch when aborted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cosight-knowledge-abort-'))
  const controller = new AbortController()
  let batchCount = 0
  try {
    const content = Array.from({ length: 17 }, (_value, index) => `section ${index}\n${'content '.repeat(400)}`).join('\n\n')
    await assert.rejects(
      rebuildKnowledgeDatabase({
        dbPath: join(directory, 'knowledge.db'),
        roleId: 'role-abort',
        embeddingModelId: 'embed-1',
        sources: [{ id: 'doc', name: 'doc.md', content }],
        signal: controller.signal,
        embed: async (texts, options) => {
          batchCount += 1
          assert.equal(options.signal, controller.signal)
          controller.abort()
          return texts.map(() => [1, 0])
        },
      }),
      (error) => error?.name === 'AbortError',
    )
    assert.equal(batchCount, 1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
