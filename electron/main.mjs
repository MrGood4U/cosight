import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, safeStorage, screen, session } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const configPath = join(app.getPath('userData'), 'cosight-config.json')
const sampleRolesPath = isDev
  ? join(__dirname, '..', 'data', 'sample-roles.json')
  : join(process.resourcesPath, 'data', 'sample-roles.json')
const ROLE_ABILITY_IDS = ['screenVision', 'listening', 'speaking', 'drawing', 'writing', 'initiative']
const ROLE_ABILITY_ALIASES = { subtitles: 'writing' }
// Voices currently documented for the Qwen3.5-Omni and Qwen3.5-Omni-Realtime
// series. Older configurations may contain Cherry/Chelsie; those values are
// deliberately normalized to the model default before they reach the UI.
const QWEN35_VOICE_VALUES = new Set([
  'Tina', 'Cindy', 'Liora Mira', 'Sunnybobi', 'Raymond', 'Ethan', 'Theo Calm',
  'Serena', 'Harvey', 'Maia', 'Evan', 'Qiao', 'Momo', 'Wil', 'Angel', 'Li Cassian',
  'Mia', 'Joyner', 'Gold', 'Katerina', 'Ryan', 'Jennifer', 'Aiden', 'Mione', 'Sunny',
  'Dylan', 'Eric', 'Peter', 'Joseph Chen', 'Marcus', 'Li', 'Kiki', 'Rocky', 'Sohee',
  'Lenn', 'Ono Anna', 'Sonrisa', 'Bodega', 'Emilien', 'Andre', 'Radio Gol', 'Alek',
  'Rizky', 'Roya', 'Arda', 'Hana', 'Dolce', 'Jakub', 'Griet', 'Eliška', 'Marina',
  'Siiri', 'Ingrid', 'Sigga', 'Bea', 'Chloe',
])
const DEFAULT_INITIATIVE_TIMEOUT_SECONDS = 10
const DEFAULT_REALTIME_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime'
const SESSION_ARTIFACT_FORMAT = 'cosight-session'
const SESSION_ARTIFACT_VERSION = 1
const MAX_SESSION_ARTIFACT_BYTES = 10 * 1024 * 1024
const MAX_SESSION_MESSAGES = 5000
const MAX_SESSION_EVENTS = 5000
let mainWindow
let bridgeProcess
let bridgeBuffer = ''
let bridgeStdoutDecoder
let bridgeStderrDecoder
let selectedDisplaySourceId = ''
let electronLogPath
let overlayWindow
let overlayReady = false
let overlaySource
let bundledSampleRolesCache

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Some Windows machines cannot start Electron's GPU process after the app is
// installed (the renderer then opens as a blank window). The packaged client
// does not depend on GPU acceleration for its UI or desktop capture, so use
// Chromium's software renderer there for a reliable first launch.
if (process.platform === 'win32' && app.isPackaged) {
  app.disableHardwareAcceleration()
}

function serializeError(error) {
  if (!error) return { message: 'Unknown error' }
  return {
    name: error.name,
    message: error.message || String(error),
    stack: error.stack,
  }
}

function getElectronLogPath() {
  if (electronLogPath) return electronLogPath
  try {
    electronLogPath = join(app.getPath('userData'), 'logs', 'electron.log')
  } catch {
    electronLogPath = join(__dirname, '..', 'logs', 'electron.log')
  }
  return electronLogPath
}

function debugLog(kind, payload = {}) {
  try {
    const logPath = getElectronLogPath()
    mkdirSync(dirname(logPath), { recursive: true })
    appendFileSync(logPath, `${JSON.stringify({ time: new Date().toISOString(), kind, payload })}\n`, 'utf8')
  } catch {
    // Diagnostics must never interfere with the Electron process.
  }
}

process.on('uncaughtExceptionMonitor', (error, origin) => {
  debugLog('electron.uncaught_exception', { origin, error: serializeError(error) })
})

process.on('unhandledRejection', (reason) => {
  debugLog('electron.unhandled_rejection', {
    reason: reason instanceof Error ? serializeError(reason) : String(reason),
  })
})

// Some Windows systems fail inside Chromium's Windows Graphics Capture path
// with "Source is not capturable". Prefer the legacy desktop capturer for
// this client until WGC is reliable across the user's display/GPU setup.
if (process.platform === 'win32') {
  app.commandLine.appendSwitch(
    'disable-features',
    'AllowWgcScreenCapturer,AllowWgcWindowCapturer,WebRtcAllowWgcDesktopCapturer,WebRtcAllowWgcScreenCapturer,WebRtcAllowWgcWindowCapturer',
  )
}

function readConfig() {
  if (!existsSync(configPath)) return {}
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    return {}
  }
}

function writeConfig(config) {
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
}

function configuredModels(config) {
  if (Array.isArray(config.models)) return config.models
  if (config.apiKey) {
    return [{
      id: 'legacy-qwen-omni',
      name: 'Qwen Omni Realtime',
      url: DEFAULT_REALTIME_URL,
      apiKey: config.apiKey,
      encrypted: config.encrypted !== false,
    }]
  }
  return []
}

function publicModel(model) {
  return {
    id: model.id,
    alias: typeof model.alias === 'string' ? model.alias : '',
    name: model.name,
    url: model.url,
    hasApiKey: Boolean(model.apiKey),
  }
}

function safeSessionPayload(value, depth = 0) {
  if (depth > 8) return '[truncated]'
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'string' ? value.slice(0, 20000) : value
  }
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => safeSessionPayload(item, depth + 1))
  if (!value || typeof value !== 'object') return undefined
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    // A session archive is deliberately text/metadata-only. Drop common
    // media and local-file fields even if an untrusted renderer payload sends
    // them by mistake.
    const lowerKey = key.toLowerCase()
    if (/^(data|image|audio|video|thumbnail|avatar|media|blob)$/i.test(lowerKey) || lowerKey.includes('base64') || lowerKey.includes('filepath') || lowerKey.endsWith('path')) continue
    const safeValue = safeSessionPayload(item, depth + 1)
    if (safeValue !== undefined) result[key] = safeValue
  }
  return result
}

function normalizeSessionArtifact(value) {
  if (!value || typeof value !== 'object' || value.format !== SESSION_ARTIFACT_FORMAT || value.version !== SESSION_ARTIFACT_VERSION) {
    return { ok: false, error: '文件不是受支持的 Cosight 会话档案。' }
  }
  if (!Array.isArray(value.messages)) return { ok: false, error: '会话档案缺少有效的消息列表。' }
  const messages = value.messages.slice(0, MAX_SESSION_MESSAGES).map((item) => ({
    id: typeof item?.id === 'string' ? item.id.slice(0, 160) : randomUUID(),
    time: typeof item?.time === 'string' ? item.time.slice(0, 32) : '00:00',
    timestamp: typeof item?.timestamp === 'string' ? item.timestamp.slice(0, 80) : '',
    speaker: item?.speaker === 'You' ? 'You' : 'Cosight',
    text: typeof item?.text === 'string' ? item.text.trim().slice(0, 20000) : '',
    final: item?.final !== false,
    sessionId: typeof item?.sessionId === 'string' ? item.sessionId.slice(0, 160) : '',
  })).filter((item) => item.text)
  const capabilityCalls = Array.isArray(value.capabilityCalls)
    ? value.capabilityCalls.slice(0, MAX_SESSION_EVENTS).map((item) => ({
        id: typeof item?.id === 'string' ? item.id.slice(0, 160) : randomUUID(),
        time: typeof item?.time === 'string' ? item.time.slice(0, 32) : '00:00',
        timestamp: typeof item?.timestamp === 'string' ? item.timestamp.slice(0, 80) : '',
        type: typeof item?.type === 'string' ? item.type.slice(0, 80) : 'ability.event',
        payload: safeSessionPayload(item?.payload || {}),
      }))
    : []
  const role = value.role && typeof value.role === 'object'
    ? {
        id: typeof value.role.id === 'string' ? value.role.id.slice(0, 160) : '',
        name: typeof value.role.name === 'string' ? value.role.name.slice(0, 200) : '',
        identity: typeof value.role.identity === 'string' ? value.role.identity.slice(0, 20000) : '',
        goal: typeof value.role.goal === 'string' ? value.role.goal.slice(0, 20000) : '',
        corePrinciples: typeof value.role.corePrinciples === 'string' ? value.role.corePrinciples.slice(0, 20000) : '',
        behavior: typeof value.role.behavior === 'string' ? value.role.behavior.slice(0, 20000) : '',
        workflow: typeof value.role.workflow === 'string' ? value.role.workflow.slice(0, 20000) : '',
        constraints: typeof value.role.constraints === 'string' ? value.role.constraints.slice(0, 20000) : '',
        language: typeof value.role.language === 'string' ? value.role.language.slice(0, 32) : 'auto',
        voice: typeof value.role.voice === 'string' ? value.role.voice.slice(0, 80) : '',
        abilities: Array.isArray(value.role.abilities) ? value.role.abilities.filter((item) => typeof item === 'string').slice(0, 32) : [],
        drawingPolicy: typeof value.role.drawingPolicy === 'string' ? value.role.drawingPolicy.slice(0, 20000) : '',
        writingPolicy: typeof value.role.writingPolicy === 'string' ? value.role.writingPolicy.slice(0, 20000) : '',
        initiativeTimeoutSec: value.role.initiativeTimeoutSec ?? '',
        initiativePrompt: typeof value.role.initiativePrompt === 'string' ? value.role.initiativePrompt.slice(0, 20000) : '',
        knowledgeText: typeof value.role.knowledgeText === 'string' ? value.role.knowledgeText.slice(0, 50000) : '',
        knowledgeFiles: Array.isArray(value.role.knowledgeFiles)
          ? value.role.knowledgeFiles.slice(0, 100).map((file) => ({
              id: typeof file?.id === 'string' ? file.id.slice(0, 160) : '',
              name: typeof file?.name === 'string' ? file.name.slice(0, 200) : '',
              size: Number.isFinite(file?.size) ? file.size : 0,
              type: typeof file?.type === 'string' ? file.type.slice(0, 120) : '',
            }))
          : [],
      }
    : null
  return {
    ok: true,
    artifact: {
      format: SESSION_ARTIFACT_FORMAT,
      version: SESSION_ARTIFACT_VERSION,
      exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt.slice(0, 80) : '',
      session: value.session && typeof value.session === 'object' ? {
        id: typeof value.session.id === 'string' ? value.session.id.slice(0, 160) : '',
        elapsedSeconds: Number.isFinite(value.session.elapsedSeconds) ? value.session.elapsedSeconds : 0,
      } : { id: '', elapsedSeconds: 0 },
      role,
      model: value.model && typeof value.model === 'object' ? {
        id: typeof value.model.id === 'string' ? value.model.id.slice(0, 160) : '',
        alias: typeof value.model.alias === 'string' ? value.model.alias.slice(0, 120) : '',
        name: typeof value.model.name === 'string' ? value.model.name.slice(0, 200) : '',
        url: typeof value.model.url === 'string' ? value.model.url.slice(0, 1000) : '',
      } : { id: '', name: '', url: '' },
      capabilities: safeSessionPayload(value.capabilities || {}),
      messages,
      capabilityCalls,
    },
  }
}

function configuredRoles(config) {
  return Array.isArray(config.roles) ? config.roles : []
}

function bundledSampleRoles() {
  if (bundledSampleRolesCache) return bundledSampleRolesCache
  try {
    const parsed = JSON.parse(readFileSync(sampleRolesPath, 'utf8'))
    bundledSampleRolesCache = Array.isArray(parsed.roles)
      ? parsed.roles
        .filter((role) => role && typeof role === 'object' && typeof role.id === 'string' && role.id)
        .map((role) => ({ ...role, isBuiltin: true }))
      : []
  } catch (error) {
    bundledSampleRolesCache = []
    debugLog('roles.sample_load_error', { sampleRolesPath, error: serializeError(error) })
  }
  return bundledSampleRolesCache
}

function allRoles(config) {
  const localRoles = configuredRoles(config)
  const localIds = new Set(localRoles.map((role) => role?.id).filter(Boolean))
  return [
    ...localRoles,
    ...bundledSampleRoles().filter((role) => !localIds.has(role.id)),
  ]
}

function normalizeRoleAbilities(value) {
  const result = []
  for (const ability of Array.isArray(value) ? value : []) {
    const normalized = ROLE_ABILITY_ALIASES[ability] || ability
    if (ROLE_ABILITY_IDS.includes(normalized) && !result.includes(normalized)) result.push(normalized)
  }
  return result
}

function publicRole(role) {
  const abilities = normalizeRoleAbilities(role.abilities)
  const initiativeEnabled = abilities.includes('initiative')
  return {
    id: role.id,
    isBuiltin: Boolean(role.isBuiltin),
    name: role.name,
    identity: role.identity || '',
    goal: role.goal || '',
    corePrinciples: role.corePrinciples || '',
    behavior: role.behavior || '',
    workflow: role.workflow || '',
    constraints: role.constraints || '',
    language: role.language || 'auto',
    voice: normalizeRoleVoice(role.voice),
    avatar: typeof role.avatar === 'string' && role.avatar.startsWith('data:image/') ? role.avatar : '',
    avatarName: role.avatarName || '',
    abilities,
    drawingPolicy: abilities.includes('drawing') ? normalizeRoleText(role.drawingPolicy, 20000) : '',
    writingPolicy: abilities.includes('writing') ? normalizeRoleText(role.writingPolicy || role.subtitlesPolicy, 20000) : '',
    initiativeTimeoutSec: initiativeEnabled ? normalizeInitiativeTimeout(role.initiativeTimeoutSec) : '',
    initiativePrompt: initiativeEnabled ? normalizeRoleText(role.initiativePrompt, 20000) : '',
    knowledgeText: role.knowledgeText || '',
    knowledgeFiles: Array.isArray(role.knowledgeFiles)
      ? role.knowledgeFiles.map(({ id, name, size, type }) => ({ id, name, size, type }))
      : [],
  }
}

function normalizeAvatarData(value) {
  if (typeof value !== 'string' || !value.startsWith('data:image/')) return ''
  return value.length <= 5_000_000 ? value : ''
}

function avatarMimeType(filePath) {
  const extension = String(filePath).toLowerCase().split('.').pop()
  return {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
  }[extension] || ''
}

function normalizeRoleText(value, maxLength = 20000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeRoleVoice(value) {
  const voice = normalizeRoleText(value, 80)
  return QWEN35_VOICE_VALUES.has(voice) ? voice : ''
}

function normalizeInitiativeTimeout(value) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_INITIATIVE_TIMEOUT_SECONDS
  return Math.min(300, Math.max(5, parsed))
}

function normalizeRoleForRuntime(role) {
  if (!role || typeof role !== 'object') return null
  const abilities = normalizeRoleAbilities(role.abilities)
  return {
    ...role,
    abilities,
    writingPolicy: normalizeRoleText(role.writingPolicy || role.subtitlesPolicy, 20000),
    voice: normalizeRoleVoice(role.voice),
  }
}

function runPromptPreview(roleInput) {
  const config = readConfig()
  const storedRole = allRoles(config).find((role) => role.id === roleInput?.id)
  const storedFiles = new Map((Array.isArray(storedRole?.knowledgeFiles) ? storedRole.knowledgeFiles : []).map((file) => [file.id, file]))
  const role = {
    ...(roleInput && typeof roleInput === 'object' ? roleInput : {}),
    knowledgeFiles: Array.isArray(roleInput?.knowledgeFiles)
      ? roleInput.knowledgeFiles.map((file) => ({
        ...file,
        path: file?.path || storedFiles.get(file?.id)?.path || '',
      }))
      : [],
  }
  role.abilities = normalizeRoleAbilities(role.abilities)
  role.writingPolicy = normalizeRoleText(role.writingPolicy || role.subtitlesPolicy, 20000)
  const abilities = new Set(role.abilities)
  const payload = JSON.stringify({
    role,
    canvasEnabled: abilities.has('drawing'),
    writingEnabled: abilities.has('writing'),
    screenVisionEnabled: abilities.has('screenVision'),
    listeningEnabled: abilities.has('listening'),
    speakingEnabled: abilities.has('speaking'),
    initiativeEnabled: abilities.has('initiative') && abilities.has('listening') && abilities.has('speaking'),
  })
  const { command, args, cwd, packaged } = pythonCommand('cosight-prompt-preview')
  const script = join(__dirname, '..', 'python', 'prompt_preview.py')
  const invocationArgs = packaged ? args : [...args, '-u', script]
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    let previewProcess
    try {
      previewProcess = spawn(command, invocationArgs, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env },
      })
    } catch (error) {
      finish({ ok: false, error: error.message })
      return
    }
    previewProcess.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    previewProcess.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    previewProcess.on('error', (error) => finish({ ok: false, error: error.message }))
    previewProcess.on('close', (code) => {
      try {
        const result = JSON.parse(stdout)
        if (result?.ok) finish({ ok: true, prompt: result.prompt || '' })
        else finish({ ok: false, error: result?.error || stderr.trim() || `Prompt preview exited with code ${code}.` })
      } catch {
        finish({ ok: false, error: stderr.trim() || `Prompt preview exited with code ${code}.` })
      }
    })
    previewProcess.stdin.end(payload)
  })
}

function roleKnowledgeDirectory(roleId) {
  return join(app.getPath('userData'), 'roles', roleId, 'knowledge')
}

function safeKnowledgeFileName(value) {
  const name = basename(String(value || 'knowledge.txt'))
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'knowledge.txt'
}

function persistRoleFiles(roleId, incomingFiles, existingFiles) {
  const directory = roleKnowledgeDirectory(roleId)
  mkdirSync(directory, { recursive: true })
  const previous = new Map((Array.isArray(existingFiles) ? existingFiles : []).map((file) => [file.id, file]))
  const savedFiles = []
  for (const file of Array.isArray(incomingFiles) ? incomingFiles : []) {
    const id = typeof file?.id === 'string' && file.id ? file.id : randomUUID()
    const previousFile = previous.get(id)
    const sourcePath = typeof file?.path === 'string' ? file.path : ''
    const storedPath = typeof previousFile?.path === 'string' ? previousFile.path : ''
    const destination = storedPath && existsSync(storedPath)
      ? storedPath
      : join(directory, `${id}-${safeKnowledgeFileName(file?.name)}`)
    try {
      if (sourcePath && existsSync(sourcePath) && sourcePath !== destination) copyFileSync(sourcePath, destination)
      if (!existsSync(destination)) continue
      const size = statSync(destination).size
      savedFiles.push({
        id,
        name: typeof file?.name === 'string' && file.name ? file.name : basename(destination),
        path: destination,
        size,
        type: typeof file?.type === 'string' ? file.type : '',
      })
    } catch (error) {
      debugLog('role.knowledge_file.save_error', { name: file?.name, error: serializeError(error) })
    }
  }
  return savedFiles
}

function saveModels(config, models, selectedModelId) {
  const nextConfig = { ...config, models, selectedModelId }
  delete nextConfig.apiKey
  delete nextConfig.encrypted
  writeConfig(nextConfig)
  return nextConfig
}

function getOverlayDisplay(source) {
  const displays = screen.getAllDisplays()
  const displayId = source?.displayId ? String(source.displayId) : ''
  return displays.find((display) => String(display.id) === displayId) || screen.getPrimaryDisplay()
}

function overlaySourceKind(source) {
  if (source?.captureKind === 'screen' || source?.type === 'screen' || source?.kind === 'screen') return 'screen'
  return String(source?.id || '').startsWith('screen:') ? 'screen' : 'window'
}

async function ensureOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayReady) return overlayWindow
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    await new Promise((resolve) => overlayWindow.webContents.once('did-finish-load', resolve))
    overlayReady = true
    return overlayWindow
  }

  overlayReady = false
  overlayWindow = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    // Make the overlay content size match the selected display bounds exactly.
    // This keeps normalized drawing coordinates aligned with the captured frame
    // on Windows displays using non-100% scaling.
    useContentSize: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'overlay-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setIgnoreMouseEvents(true)
  overlayWindow.setContentProtection(true)
  overlayWindow.on('closed', () => {
    debugLog('overlay.window.closed')
    overlayWindow = undefined
    overlayReady = false
    overlaySource = undefined
  })
  await overlayWindow.loadFile(join(__dirname, 'overlay.html'))
  overlayReady = true
  debugLog('overlay.window.ready', { id: overlayWindow.id })
  return overlayWindow
}

async function showOverlay(source) {
  if (!source?.id) return { ok: false, error: '缺少屏幕来源。' }
  const sourceKind = overlaySourceKind(source)
  // Electron does not expose reliable window bounds for a desktopCapturer
  // window source. Its video coordinates are window-local, while a full
  // display overlay would be display-global and therefore necessarily drift.
  // Refuse this path instead of drawing at a plausible but wrong location.
  if (sourceKind !== 'screen') {
    return { ok: false, error: '窗口捕获不支持透明画布覆盖层，请选择整屏来源。' }
  }
  const display = getOverlayDisplay(source)
  const window = await ensureOverlayWindow()
  overlaySource = { id: source.id, name: source.name, displayId: source.displayId, captureKind: sourceKind }
  window.setBounds(display.bounds)
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setIgnoreMouseEvents(true)
  window.webContents.send('overlay:clear')
  window.showInactive()
  debugLog('overlay.show', {
    sourceId: source.id,
    sourceName: source.name,
    sourceKind,
    displayId: String(display.id),
    bounds: display.bounds,
  })
  return { ok: true, sourceKind, bounds: display.bounds }
}

function hideOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.webContents.send('overlay:clear')
  overlayWindow.hide()
  debugLog('overlay.hide')
}

function drawOnOverlay(payload) {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayReady || !overlayWindow.isVisible()) {
    return { ok: false, error: '透明画布窗口尚未准备好。' }
  }
  overlayWindow.webContents.send('overlay:draw', payload)
  return { ok: true }
}

function showCaptionOnOverlay(payload) {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayReady || !overlayWindow.isVisible()) {
    return { ok: false, error: '透明文字层尚未准备好。' }
  }
  overlayWindow.webContents.send('overlay:caption', payload)
  return { ok: true }
}

function refreshOverlayBounds() {
  if (!overlaySource || !overlayWindow || overlayWindow.isDestroyed() || !overlayWindow.isVisible()) return
  const display = getOverlayDisplay(overlaySource)
  overlayWindow.setBounds(display.bounds)
  debugLog('overlay.reposition', { displayId: String(display.id), bounds: display.bounds })
}

function emit(payload) {
  mainWindow?.webContents.send('qwen:event', payload)
}

function sendBridge(command) {
  const type = command?.type || 'unknown'
  if (!bridgeProcess?.stdin?.writable) {
    if (!['audio', 'video'].includes(type)) debugLog('bridge.command.not_sent', { type, reason: 'stdin_not_writable' })
    return false
  }
  try {
    bridgeProcess.stdin.write(`${JSON.stringify(command)}\n`)
    if (!['audio', 'video'].includes(type)) {
      debugLog('bridge.command.sent', {
        type,
        pid: bridgeProcess.pid,
        callId: command.callId,
        model: command.model,
        url: command.url,
        canvasEnabled: command.canvasEnabled,
        outputType: typeof command.output,
        outputLength: typeof command.output === 'string' ? command.output.length : undefined,
      })
    }
    return true
  } catch (error) {
    debugLog('bridge.command.send_error', { type, error: serializeError(error) })
    return false
  }
}

function pythonCommand(entryPoint = 'cosight-bridge') {
  if (app.isPackaged) {
    const executable = process.platform === 'win32' ? `${entryPoint}.exe` : entryPoint
    return {
      command: join(process.resourcesPath, 'python', entryPoint, executable),
      args: [],
      cwd: join(process.resourcesPath, 'python', entryPoint),
      packaged: true,
    }
  }
  const configured = process.env.COSIGHT_PYTHON
  if (configured) return { command: configured, args: [], cwd: join(__dirname, '..'), packaged: false }
  return {
    command: process.platform === 'win32' ? 'python' : 'python3',
    args: [],
    cwd: join(__dirname, '..'),
    packaged: false,
  }
}

function startBridge(config, modelProfile, apiKey) {
  if (bridgeProcess) {
    debugLog('bridge.start.reused', { pid: bridgeProcess.pid, model: modelProfile?.name })
    return { ok: true, reused: true }
  }
  if (!apiKey) {
    debugLog('bridge.start.rejected', { reason: 'missing_api_key', model: modelProfile?.name })
    return { ok: false, error: '请先在 Settings 中填写 API Key。' }
  }

  const { command, args, cwd, packaged } = pythonCommand('cosight-bridge')
  const script = join(__dirname, '..', 'python', 'qwen_bridge.py')
  const invocationArgs = packaged ? args : [...args, '-u', script]
  bridgeProcess = spawn(command, invocationArgs, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      DASHSCOPE_API_KEY: apiKey,
      COSIGHT_DEBUG_LOG: join(app.getPath('userData'), 'logs', 'qwen-bridge.log'),
    },
  })
  debugLog('bridge.process.spawned', {
    pid: bridgeProcess.pid,
    command,
    args: invocationArgs,
    model: modelProfile.name,
    url: modelProfile.url,
    screenVisionEnabled: Boolean(config?.screenVisionEnabled),
    listeningEnabled: Boolean(config?.listeningEnabled),
    speakingEnabled: Boolean(config?.speakingEnabled),
    initiativeEnabled: Boolean(config?.initiativeEnabled),
    roleId: config?.role?.id,
    canvasEnabled: Boolean(config?.canvasEnabled),
    writingEnabled: Boolean(config?.writingEnabled ?? config?.captionsEnabled),
    subtitlesEnabled: Boolean(config?.subtitlesEnabled),
  })
  bridgeBuffer = ''
  bridgeStdoutDecoder = new StringDecoder('utf8')
  bridgeStderrDecoder = new StringDecoder('utf8')

  bridgeProcess.stdout.on('data', (chunk) => {
    bridgeBuffer += bridgeStdoutDecoder.write(chunk)
    const lines = bridgeBuffer.split(/\r?\n/)
    bridgeBuffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        emit(JSON.parse(line))
      } catch {
        debugLog('bridge.stdout.parse_error', { line: line.slice(0, 1000) })
        emit({ type: 'bridge.log', message: line })
      }
    }
  })
  bridgeProcess.stderr.on('data', (chunk) => {
    const message = bridgeStderrDecoder.write(chunk).trim()
    if (message) {
      debugLog('bridge.stderr', { message: message.slice(0, 4000) })
      emit({ type: 'bridge.log', message })
    }
  })
  bridgeProcess.on('error', (error) => {
    debugLog('bridge.process.error', { pid: bridgeProcess?.pid, error: serializeError(error) })
    emit({ type: 'bridge.error', message: `Python bridge 启动失败：${error.message}` })
    bridgeProcess = undefined
  })
  bridgeProcess.on('exit', (code) => {
    debugLog('bridge.process.exit', { code, pid: bridgeProcess?.pid })
    bridgeBuffer += bridgeStdoutDecoder?.end() || ''
    const lines = bridgeBuffer.split(/\r?\n/)
    bridgeBuffer = ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        emit(JSON.parse(line))
      } catch {
        debugLog('bridge.stdout.parse_error', { line: line.slice(0, 1000) })
        emit({ type: 'bridge.log', message: line })
      }
    }
    const stderrMessage = bridgeStderrDecoder?.end().trim()
    if (stderrMessage) {
      debugLog('bridge.stderr', { message: stderrMessage.slice(0, 4000) })
      emit({ type: 'bridge.log', message: stderrMessage })
    }
    emit({ type: 'bridge.closed', code })
    bridgeProcess = undefined
  })

  sendBridge({
    type: 'start',
    model: modelProfile.name,
    url: modelProfile.url,
    voice: config?.voice || config?.role?.voice,
    role: config?.role || null,
    screenVisionEnabled: Boolean(config?.screenVisionEnabled),
    listeningEnabled: Boolean(config?.listeningEnabled),
    speakingEnabled: Boolean(config?.speakingEnabled),
    initiativeEnabled: Boolean(config?.initiativeEnabled),
    canvasEnabled: Boolean(config?.canvasEnabled),
    writingEnabled: Boolean(config?.writingEnabled ?? config?.captionsEnabled),
    importedContext: config?.importedContext || null,
  })
  return { ok: true }
}

function stopBridge() {
  if (!bridgeProcess) {
    debugLog('bridge.stop.ignored', { reason: 'not_running' })
    return
  }
  const pid = bridgeProcess.pid
  debugLog('bridge.stop.requested', { pid })
  sendBridge({ type: 'stop' })
  try {
    const killed = bridgeProcess.kill()
    debugLog('bridge.process.kill', { pid, killed })
  } catch (error) {
    debugLog('bridge.process.kill_error', { pid, error: serializeError(error) })
  }
  bridgeProcess = undefined
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#0d1117',
    title: 'Cosight',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Register diagnostics before loading the renderer. A load failure can
  // happen before loadFile/loadURL resolves, so registering these afterwards
  // loses the only useful error details for packaged builds.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    debugLog('renderer.process_gone', details)
  })
  mainWindow.webContents.on('unresponsive', () => {
    debugLog('renderer.unresponsive')
  })
  mainWindow.webContents.on('responsive', () => {
    debugLog('renderer.responsive')
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    debugLog('renderer.load_failed', { errorCode, errorDescription, validatedURL, isMainFrame })
  })
  mainWindow.webContents.on('did-finish-load', () => {
    debugLog('renderer.load_finished', { url: mainWindow.webContents.getURL() })
  })
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    debugLog('renderer.console', { level, message, line, sourceId })
  })

  if (isDev) {
    await mainWindow.loadURL('http://127.0.0.1:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(async () => {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'], fetchWindowIcons: false }).then((sources) => {
      const selected = sources.find((source) => source.id === selectedDisplaySourceId)
      selectedDisplaySourceId = ''
      callback(selected ? { video: selected } : {})
    }).catch(() => {
      selectedDisplaySourceId = ''
      callback({})
    })
  })

  ipcMain.handle('settings:get', () => {
    const config = readConfig()
    const models = configuredModels(config)
    const roles = allRoles(config)
    const selectedModelId = models.some((model) => model.id === config.selectedModelId)
      ? config.selectedModelId
      : models[0]?.id || ''
    const selectedRoleId = roles.some((role) => role.id === config.selectedRoleId)
      ? config.selectedRoleId
      : ''
    return { models: models.map(publicModel), selectedModelId, roles: roles.map(publicRole), selectedRoleId }
  })
  ipcMain.handle('roles:pick-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Knowledge files', extensions: ['txt', 'md', 'csv', 'json', 'pdf', 'docx'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (result.canceled) return { ok: true, files: [] }
    const files = result.filePaths.map((filePath) => {
      let size = 0
      try { size = statSync(filePath).size } catch { /* The save step will validate it again. */ }
      return { id: randomUUID(), name: basename(filePath), path: filePath, size, type: '' }
    })
    return { ok: true, files }
  })
  ipcMain.handle('roles:pick-avatar', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Avatar image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: true, avatar: '' }
    const filePath = result.filePaths[0]
    const mimeType = avatarMimeType(filePath)
    if (!mimeType) return { ok: false, error: '头像文件格式不支持。' }
    try {
      const file = readFileSync(filePath)
      if (file.length > 3_500_000) return { ok: false, error: '头像文件不能超过 3.5 MB。' }
      return { ok: true, avatar: `data:${mimeType};base64,${file.toString('base64')}`, name: basename(filePath) }
    } catch (error) {
      debugLog('role.avatar.read_error', { filePath, error: serializeError(error) })
      return { ok: false, error: `头像读取失败：${error.message}` }
    }
  })
  ipcMain.handle('roles:preview-prompt', (_event, roleInput) => runPromptPreview(roleInput))
  ipcMain.handle('roles:save', (_event, roleInput) => {
    if (!roleInput || typeof roleInput !== 'object') return { ok: false, error: '角色配置无效。' }
    const name = normalizeRoleText(roleInput.name, 80)
    if (!name) return { ok: false, error: '角色名称不能为空。' }
    if (roleInput.isBuiltin) {
      return { ok: false, error: '官方示例角色不可编辑，请新增一个角色进行修改。' }
    }
    const config = readConfig()
    const roles = configuredRoles(config)
    const existingIndex = roles.findIndex((role) => role.id === roleInput.id)
    const existing = existingIndex >= 0 ? roles[existingIndex] : undefined
    const id = existing?.id || randomUUID()
    const abilities = normalizeRoleAbilities(roleInput.abilities)
    const initiativeEnabled = abilities.includes('initiative')
    const nextRole = {
      id,
      name,
      identity: normalizeRoleText(roleInput.identity),
      goal: normalizeRoleText(roleInput.goal),
      corePrinciples: normalizeRoleText(roleInput.corePrinciples),
      behavior: normalizeRoleText(roleInput.behavior),
      workflow: normalizeRoleText(roleInput.workflow),
      constraints: normalizeRoleText(roleInput.constraints),
      language: ['auto', 'zh-CN', 'en-US'].includes(roleInput.language) ? roleInput.language : 'auto',
      voice: normalizeRoleVoice(roleInput.voice),
      avatar: roleInput.avatarRemoved ? '' : (normalizeAvatarData(roleInput.avatar) || normalizeAvatarData(existing?.avatar)),
      avatarName: roleInput.avatarRemoved ? '' : (normalizeRoleText(roleInput.avatarName, 160) || existing?.avatarName || ''),
      abilities,
      drawingPolicy: abilities.includes('drawing') ? normalizeRoleText(roleInput.drawingPolicy, 20000) : '',
      writingPolicy: abilities.includes('writing') ? normalizeRoleText(roleInput.writingPolicy || roleInput.subtitlesPolicy, 20000) : '',
      initiativeTimeoutSec: initiativeEnabled ? normalizeInitiativeTimeout(roleInput.initiativeTimeoutSec) : '',
      initiativePrompt: initiativeEnabled ? normalizeRoleText(roleInput.initiativePrompt, 20000) : '',
      knowledgeText: normalizeRoleText(roleInput.knowledgeText, 50000),
      knowledgeFiles: persistRoleFiles(id, roleInput.knowledgeFiles, existing?.knowledgeFiles),
    }
    const nextRoles = [nextRole, ...roles.filter((_role, index) => index !== existingIndex)]
    const nextConfig = { ...config, roles: nextRoles }
    delete nextConfig.apiKey
    delete nextConfig.encrypted
    writeConfig(nextConfig)
    debugLog('role.saved', { roleId: id, name, knowledgeFiles: nextRole.knowledgeFiles.length })
    return { ok: true, role: publicRole(nextRole), selectedRoleId: nextConfig.selectedRoleId || '' }
  })
  ipcMain.handle('roles:select', (_event, roleId) => {
    const config = readConfig()
    const roles = allRoles(config)
    const nextSelectedRoleId = typeof roleId === 'string' && roles.some((role) => role.id === roleId) ? roleId : ''
    writeConfig({ ...config, selectedRoleId: nextSelectedRoleId })
    return { ok: true, selectedRoleId: nextSelectedRoleId }
  })
  ipcMain.handle('roles:delete', (_event, roleId) => {
    const config = readConfig()
    const roles = configuredRoles(config)
    const role = roles.find((item) => item.id === roleId)
    if (!role && bundledSampleRoles().some((item) => item.id === roleId)) {
      return { ok: false, error: '官方示例角色不可删除。' }
    }
    if (!role) return { ok: false, error: '找不到这个角色。' }
    const nextRoles = roles.filter((item) => item.id !== roleId)
    const nextConfig = { ...config, roles: nextRoles, selectedRoleId: config.selectedRoleId === roleId ? '' : config.selectedRoleId }
    writeConfig(nextConfig)
    try { rmSync(join(app.getPath('userData'), 'roles', roleId), { recursive: true, force: true }) } catch { /* Role deletion should not fail because cleanup is unavailable. */ }
    debugLog('role.deleted', { roleId, name: role.name })
    return { ok: true, selectedRoleId: nextConfig.selectedRoleId || '' }
  })
  ipcMain.handle('settings:save-model', (_event, modelInput) => {
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: '系统安全存储不可用。' }
    if (!modelInput || typeof modelInput !== 'object') return { ok: false, error: '模型配置无效。' }
    const name = typeof modelInput.name === 'string' ? modelInput.name.trim() : ''
    const alias = typeof modelInput.alias === 'string' ? modelInput.alias.trim().slice(0, 120) : ''
    const url = typeof modelInput.url === 'string' ? modelInput.url.trim() : ''
    const apiKey = typeof modelInput.apiKey === 'string' ? modelInput.apiKey.trim() : ''
    if (!name) return { ok: false, error: 'Model name 不能为空。' }
    if (!url) return { ok: false, error: 'URL 不能为空。' }
    try {
      new URL(url)
    } catch {
      return { ok: false, error: 'URL 格式无效。' }
    }

    const config = readConfig()
    const models = configuredModels(config)
    const existingIndex = models.findIndex((model) => model.id === modelInput.id)
    const existing = existingIndex >= 0 ? models[existingIndex] : undefined
    if (!apiKey && !existing?.apiKey) return { ok: false, error: 'API Key 不能为空。' }
    const nextModel = {
      id: existing?.id || randomUUID(),
      alias,
      name,
      url,
      apiKey: apiKey ? safeStorage.encryptString(apiKey).toString('base64') : existing.apiKey,
      encrypted: true,
    }
    if (existingIndex >= 0) models[existingIndex] = nextModel
    else models.push(nextModel)
    const selectedModelId = config.selectedModelId && models.some((model) => model.id === config.selectedModelId)
      ? config.selectedModelId
      : nextModel.id
    saveModels(config, models, selectedModelId)
    return { ok: true, model: publicModel(nextModel), selectedModelId }
  })
  ipcMain.handle('settings:select-model', (_event, modelId) => {
    const config = readConfig()
    const models = configuredModels(config)
    if (!models.some((model) => model.id === modelId)) return { ok: false, error: '找不到这个模型配置。' }
    saveModels(config, models, modelId)
    return { ok: true, selectedModelId: modelId }
  })
  ipcMain.handle('settings:delete-model', (_event, modelId) => {
    const config = readConfig()
    const models = configuredModels(config).filter((model) => model.id !== modelId)
    if (models.length === configuredModels(config).length) return { ok: false, error: '找不到这个模型配置。' }
    const selectedModelId = config.selectedModelId === modelId ? models[0]?.id || '' : config.selectedModelId
    saveModels(config, models, selectedModelId)
    stopBridge()
    return { ok: true, selectedModelId }
  })
  ipcMain.handle('desktop:list-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
      fetchWindowIcons: false,
    })
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      captureKind: overlaySourceKind(source),
      displayId: source.display_id,
      thumbnail: source.thumbnail.toDataURL(),
    }))
  })
  ipcMain.handle('session:export', async (_event, artifactInput) => {
    const normalized = normalizeSessionArtifact(artifactInput)
    if (!normalized.ok) return normalized
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Cosight session',
      defaultPath: join(app.getPath('documents'), `cosight-session-${stamp}.json`),
      filters: [{ name: 'Cosight session archive', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    try {
      const serialized = JSON.stringify(normalized.artifact, null, 2)
      if (Buffer.byteLength(serialized, 'utf8') > MAX_SESSION_ARTIFACT_BYTES) {
        return { ok: false, error: '会话档案过大，无法导出。' }
      }
      writeFileSync(result.filePath, serialized, 'utf8')
      debugLog('session.exported', {
        fileName: basename(result.filePath),
        messageCount: normalized.artifact.messages.length,
        capabilityEventCount: normalized.artifact.capabilityCalls.length,
      })
      return { ok: true, fileName: basename(result.filePath) }
    } catch (error) {
      debugLog('session.export.error', { error: serializeError(error) })
      return { ok: false, error: `会话档案写入失败：${error.message}` }
    }
  })
  ipcMain.handle('session:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Cosight session context',
      properties: ['openFile'],
      filters: [{ name: 'Cosight session archive', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true }
    const filePath = result.filePaths[0]
    try {
      const stats = statSync(filePath)
      if (stats.size > MAX_SESSION_ARTIFACT_BYTES) return { ok: false, error: '会话档案超过 10 MB，无法导入。' }
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
      const normalized = normalizeSessionArtifact(parsed)
      if (!normalized.ok) return normalized
      debugLog('session.imported', {
        fileName: basename(filePath),
        messageCount: normalized.artifact.messages.length,
        capabilityEventCount: normalized.artifact.capabilityCalls.length,
      })
      return { ok: true, fileName: basename(filePath), artifact: normalized.artifact }
    } catch (error) {
      debugLog('session.import.error', { fileName: basename(filePath), error: serializeError(error) })
      return { ok: false, error: `会话档案读取失败：${error.message}` }
    }
  })
  ipcMain.on('desktop:prepare-source', (event, sourceId) => {
    selectedDisplaySourceId = typeof sourceId === 'string' ? sourceId : ''
    event.returnValue = true
  })
  ipcMain.handle('qwen:start', (_event, config) => {
    debugLog('ipc.qwen.start', {
      modelId: config?.modelId,
      screenVisionEnabled: Boolean(config?.screenVisionEnabled),
      listeningEnabled: Boolean(config?.listeningEnabled),
      speakingEnabled: Boolean(config?.speakingEnabled),
      initiativeEnabled: Boolean(config?.initiativeEnabled),
      roleId: config?.roleId,
      canvasEnabled: Boolean(config?.canvasEnabled),
      writingEnabled: Boolean(config?.writingEnabled ?? config?.captionsEnabled),
      subtitlesEnabled: Boolean(config?.subtitlesEnabled),
    })
    const storedConfig = readConfig()
    const models = configuredModels(storedConfig)
    const roles = allRoles(storedConfig)
    const modelId = config?.modelId || storedConfig.selectedModelId || models[0]?.id
    const modelProfile = models.find((model) => model.id === modelId)
    if (!modelProfile) {
      debugLog('ipc.qwen.start.rejected', { reason: 'model_not_found', modelId })
      return { ok: false, error: '请先添加并选择一个自定义模型。' }
    }
    if (modelProfile.apiKey) {
      try {
        const apiKey = modelProfile.encrypted === false
          ? modelProfile.apiKey
          : safeStorage.decryptString(Buffer.from(modelProfile.apiKey, 'base64'))
        const storedRole = roles.find((item) => item.id === config?.roleId) || null
        const role = normalizeRoleForRuntime(storedRole)
        const sessionConfig = { ...(config || {}), role }
        const result = startBridge(sessionConfig, modelProfile, apiKey)
        debugLog('ipc.qwen.start.result', { ok: result.ok, reused: result.reused, model: modelProfile.name })
        return result
      } catch (error) {
        debugLog('ipc.qwen.start.error', { model: modelProfile.name, error: serializeError(error) })
        return { ok: false, error: `API Key 读取失败：${error.message}` }
      }
    }
    debugLog('ipc.qwen.start.rejected', { reason: 'missing_api_key', model: modelProfile.name })
    return { ok: false, error: '当前模型没有 API Key，请先编辑模型配置。' }
  })
  ipcMain.handle('qwen:stop', () => {
    debugLog('ipc.qwen.stop')
    stopBridge()
    return { ok: true }
  })
  ipcMain.on('qwen:capabilities-update', (_event, capabilities) => {
    const sent = sendBridge({
      type: 'capabilities.update',
      canvasEnabled: Boolean(capabilities?.canvasEnabled),
      writingEnabled: Boolean(capabilities?.writingEnabled),
    })
    debugLog('ipc.qwen.capabilities_update', {
      sent,
      canvasEnabled: Boolean(capabilities?.canvasEnabled),
      writingEnabled: Boolean(capabilities?.writingEnabled),
    })
  })
  ipcMain.handle('qwen:initiative', (_event, instructions) => {
    const prompt = typeof instructions === 'string' ? instructions.trim().slice(0, 20000) : ''
    if (!prompt) return { ok: false, error: '主动触发规则不能为空。' }
    const sent = sendBridge({ type: 'response.create', instructions: prompt })
    debugLog('ipc.qwen.initiative', { sent, instructionsLength: prompt.length })
    return sent ? { ok: true } : { ok: false, error: '实时会话尚未连接。' }
  })
  const normalizeVideoPayload = (payload) => {
    if (typeof payload === 'string') return { data: payload, mode: 'default' }
    return {
      data: typeof payload?.data === 'string' ? payload.data : '',
      mode: typeof payload?.mode === 'string' ? payload.mode : 'default',
    }
  }
  ipcMain.on('qwen:audio', (_event, base64) => sendBridge({ type: 'audio', data: base64 }))
  ipcMain.on('qwen:video', (_event, payload) => {
    const video = normalizeVideoPayload(payload)
    sendBridge({ type: 'video', data: video.data })
  })
  ipcMain.on('qwen:video-flush', (_event, payload) => {
    const video = normalizeVideoPayload(payload)
    sendBridge({ type: 'video.flush', data: video.data, mode: video.mode })
  })
  ipcMain.on('qwen:tool-result', (_event, payload) => {
    if (!payload || typeof payload !== 'object') {
      debugLog('ipc.qwen.tool_result.invalid', { payloadType: typeof payload })
      return
    }
    debugLog('ipc.qwen.tool_result.received', {
      callId: payload.callId,
      outputType: typeof payload.output,
      outputLength: typeof payload.output === 'string' ? payload.output.length : undefined,
    })
    const sent = sendBridge({ type: 'tool.result', callId: payload.callId, output: payload.output })
    debugLog('ipc.qwen.tool_result.forwarded', { callId: payload.callId, sent })
  })

  ipcMain.handle('overlay:show', async (_event, source) => {
    try {
      return await showOverlay(source)
    } catch (error) {
      debugLog('overlay.show.error', { error: serializeError(error) })
      return { ok: false, error: `透明画布窗口启动失败：${error.message}` }
    }
  })
  ipcMain.handle('overlay:hide', () => {
    hideOverlay()
    return { ok: true }
  })
  ipcMain.handle('overlay:draw', (_event, payload) => {
    try {
      return drawOnOverlay(payload)
    } catch (error) {
      debugLog('overlay.draw.error', { error: serializeError(error) })
      return { ok: false, error: `透明画布绘制失败：${error.message}` }
    }
  })
  ipcMain.handle('overlay:caption', (_event, payload) => {
    try {
      return showCaptionOnOverlay(payload)
    } catch (error) {
      debugLog('overlay.caption.error', { error: serializeError(error) })
      return { ok: false, error: `透明文字层显示失败：${error.message}` }
    }
  })

  ipcMain.on('renderer:event', (_event, payload) => {
    if (!payload || typeof payload !== 'object') return
    debugLog('renderer.event', payload)
  })
  ipcMain.on('renderer:error', (_event, payload) => {
    if (!payload || typeof payload !== 'object') return
    debugLog('renderer.error', payload)
  })

  screen.on('display-metrics-changed', refreshOverlayBounds)
  screen.on('display-added', refreshOverlayBounds)
  screen.on('display-removed', refreshOverlayBounds)

  await createWindow()
  mainWindow.on('closed', () => {
    debugLog('electron.window.closed')
    stopBridge()
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy()
    mainWindow = undefined
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
