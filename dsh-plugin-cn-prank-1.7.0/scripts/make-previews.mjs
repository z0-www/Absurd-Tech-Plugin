/**
 * Redraw the README previews.
 *
 * The three PNGs in `docs/` are **real browser renders**, not hand-drawn
 * approximations: `scripts/preview/harness.html` reproduces the overlay's markup
 * and the `client.js` style table, and this script screenshots it with headless
 * Edge at three different states. That keeps the previews honest — whatever the
 * harness shows is what the same CSS and SVG produce in the real overlay.
 *
 * The cost is a Chromium-family browser on the machine, which is why this is a
 * manual step: CI checks that the PNGs exist and are non-empty, never that they
 * are current.
 *
 * Usage:
 *   node scripts/make-previews.mjs
 *   node scripts/make-previews.mjs --browser "C:\\path\\to\\chrome.exe"
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Browsers tried in order when `--browser` names none. */
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

/**
 * One screenshot per entry, in the order they are taken.
 *
 * `preview-beat.png` shows the clip that ships in `assets/beat.mp4` — since 1.7.0
 * that is the only 暴打 there is, so a missing clip is a hard error here rather
 * than a reason to draw something else.
 */
const SHOTS = [
  { file: 'preview-lockdown.png', query: 'state=notice' },
  { file: 'preview-verdict.png', query: 'state=verdict' },
  { file: 'preview-ban.png', query: 'state=ban' },
  // A close-up of the sidebar foot: under the overlay's 86% scrim the toggle is
  // barely legible, so the state light gets a shot of its own.
  { file: 'preview-ban-toggle.png', query: 'state=sidebar', size: '420,300' },
]

/** Matches the harness's centred card with room for the fake app around it. */
const WIDTH = 1440
const HEIGHT = 900

/**
 * Read one `--flag value` pair off the command line.
 * @param argv - process arguments after the script name.
 * @param flag - the flag to look for.
 * @returns the following argument, or `undefined`.
 */
function optionOf(argv, flag) {
  const index = argv.indexOf(flag)
  if (index === -1) return undefined
  const value = argv[index + 1]
  return value === undefined || value.startsWith('--') ? undefined : value
}

const argv = process.argv.slice(2)
const browser = optionOf(argv, '--browser') ?? BROWSERS.find((path) => existsSync(path))

if (browser === undefined) {
  console.error('make-previews: no Chromium-family browser found; pass --browser <path>')
  process.exit(1)
}

const docs = resolve('docs')
const harness = resolve(join('scripts', 'preview', 'harness.html'))
const profile = resolve('.edge-profile')

if (!existsSync(harness)) {
  console.error(`make-previews: ${harness} is missing`)
  process.exit(1)
}

mkdirSync(docs, { recursive: true })
mkdirSync(profile, { recursive: true })

const clip = existsSync(resolve(join('assets', 'beat.mp4')))
if (!clip) {
  // Not a warning any more: 暴打 has no second animation to fall back to, so
  // preview-beat.png would be a screenshot of an empty frame.
  console.error('make-previews: assets/beat.mp4 is missing — 暴打 has no animation left to preview')
  process.exit(1)
}
// Chromium caches `file://` pages inside the profile directory, so an unchanged
// URL keeps screenshotting the *previous* harness after you edit it — the PNGs
// then look "regenerated" while showing the old markup. Stamping the URL
// with the harness's mtime gives every edit a new URL, which is the whole fix.
const stamp = String(statSync(harness).mtimeMs)
const shots = [...SHOTS, { file: 'preview-beat.png', query: 'state=beatvideo&t=3' }]

for (const shot of shots) {
  const target = join(docs, shot.file)
  // Render to a scratch name and only move it into place once it exists.
  //
  // The obvious order — delete the old PNG, then render — loses the drawing when the
  // browser never launches: `docs/` is left with a hole, and the next `npm run verify`
  // fails with "preview-ban-toggle.png is missing", which points at the wrong problem.
  // A failed render should leave the previous image untouched.
  const scratch = join(docs, shot.file.replace(/\.png$/, '.tmp.png'))
  const url = `${pathToFileURL(harness).href}?${shot.query}&v=${stamp}`
  rmSync(scratch, { force: true })
  const result = spawnSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--disable-extensions',
      '--disable-crash-reporter',
      '--disable-breakpad',
      '--force-device-scale-factor=1',
      '--virtual-time-budget=2000',
      `--user-data-dir=${profile}`,
      `--window-size=${(shot.size ?? `${String(WIDTH)},${String(HEIGHT)}`)}`,
      `--screenshot=${scratch}`,
      url,
    ],
    // inherit stdout (Edge's "bytes written to file" line), drop stderr: a
    // headless Edge on a desktop machine greets every run with a dozen unrelated
    // importer warnings, and this file must also work where capturing a child's
    // stdio through a pipe is denied by policy.
    { stdio: ['ignore', 'inherit', 'ignore'] },
  )
  if (result.error !== undefined) {
    rmSync(scratch, { force: true })
    console.error(`make-previews: could not run ${browser}: ${result.error.message}`)
    process.exit(1)
  }
  if (!existsSync(scratch) || statSync(scratch).size === 0) {
    rmSync(scratch, { force: true })
    console.error(
      `make-previews: ${shot.file} was not written (${shot.query}); browser exit ${String(result.status)} — the previous image is still in place`,
    )
    process.exit(1)
  }
  rmSync(target, { force: true })
  renameSync(scratch, target)
  console.log(`make-previews: wrote docs/${shot.file} (${String(statSync(target).size)} bytes)`)
}
