import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const mainSource = await readFile(new URL('../../electron/main.mjs', import.meta.url), 'utf8')

test('screen capture isolates Cosight captions in a protected overlay window', () => {
  assert.match(mainSource, /overlayWindow = createOverlayWindow\(\{ contentProtection: false, kind: 'drawing' \}\)/)
  assert.match(mainSource, /captionOverlayWindow = createOverlayWindow\(\{ contentProtection: true, kind: 'caption' \}\)/)
  assert.match(mainSource, /overlayWindow\.webContents\.send\('overlay:draw', payload\)/)
  assert.match(mainSource, /captionOverlayWindow\.webContents\.send\('overlay:caption', payload\)/)
})
