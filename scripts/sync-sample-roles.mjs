import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const defaultSourcePath = process.env.APPDATA
  ? join(process.env.APPDATA, 'cosight', 'cosight-config.json')
  : join(projectRoot, 'cosight-config.json')
const sourcePath = resolve(process.argv[2] || defaultSourcePath)
const targetPath = resolve(process.argv[3] || join(projectRoot, 'data', 'sample-roles.json'))

if (!existsSync(sourcePath)) {
  throw new Error(`Role config was not found: ${sourcePath}`)
}

const config = JSON.parse(readFileSync(sourcePath, 'utf8'))
const sourceRoles = Array.isArray(config.roles) ? config.roles : []
if (sourceRoles.length === 0) {
  throw new Error(`No roles were found in: ${sourcePath}`)
}

const text = (value) => typeof value === 'string' ? value : ''
const sampleRoles = sourceRoles.map((role, index) => ({
  // Keep the source ID stable so an existing local copy can override the
  // bundled sample without producing duplicate cards after an upgrade.
  id: text(role.id) || `builtin-sample-${index + 1}`,
  isBuiltin: true,
  name: text(role.name).trim() || `Sample role ${index + 1}`,
  identity: text(role.identity),
  goal: text(role.goal),
  corePrinciples: text(role.corePrinciples),
  behavior: text(role.behavior),
  workflow: text(role.workflow),
  constraints: text(role.constraints),
  listeningLanguage: text(role.listeningLanguage) || text(role.language) || 'auto',
  outputLanguage: text(role.outputLanguage) || text(role.language) || 'auto',
  voice: text(role.voice),
  avatar: text(role.avatar).startsWith('data:image/') ? role.avatar : '',
  avatarName: text(role.avatarName),
  abilities: Array.isArray(role.abilities) ? role.abilities : [],
  drawingPolicy: text(role.drawingPolicy),
  writingPolicy: text(role.writingPolicy || role.subtitlesPolicy),
  initiativeTimeoutSec: role.initiativeTimeoutSec,
  initiativePrompt: text(role.initiativePrompt),
  knowledgeText: text(role.knowledgeText),
  // Source file paths are intentionally not copied into the distributable.
  // If a bundled role ever needs file knowledge, package those files as
  // explicit app resources and reference them through a separate manifest.
  knowledgeFiles: [],
}))

mkdirSync(join(targetPath, '..'), { recursive: true })
writeFileSync(targetPath, `${JSON.stringify({ version: 1, roles: sampleRoles }, null, 2)}\n`, 'utf8')
console.log(`Wrote ${sampleRoles.length} sample roles to ${targetPath}`)
