/**
 * Manifest and packaging checks for the published bundle.
 *
 * A published DSH bundle must stay installable without a build step, so these
 * checks only read files: the manifest that declares the bundle patch and the
 * Client half, the patch that inserts the loader row, the locale files the
 * Plugin Manager reads for display text, and the two assets the README promises
 * to ship.
 *
 * Run with `node scripts/verify-manifests.mjs` or `npm run verify`.
 */

import { readFileSync, statSync } from 'node:fs'

// Imported for one check: every row option the Host half reads must appear in both
// READMEs. Importing the Host module is side-effect free (it only wires things up
// inside `apply`), which is what makes this possible without a second source of truth.
const { projectConfig } = await import('../index.js')

/** Parse one JSON file, failing loudly on a syntax error. */
function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Fail the check with one actionable message. */
function fail(message) {
  console.error(`verify-manifests: ${message}`)
  process.exit(1)
}

const manifest = readJson('package.json')

if (typeof manifest.name !== 'string' || manifest.name === '') fail('package.json must declare a name')
if (typeof manifest.version !== 'string' || manifest.version === '') fail('package.json must declare a version')

// The bundle patch is what makes this package a DSH bundle rather than a plain npm package.
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
  fail('package.json must declare dsh.bundle.patch -> ./cordis.patch.yml')
}

// The Client half is served to the browser through these declarations. The
// overlay must be up before the human can touch the composer, so `immediately`
// is part of the contract, not a preference.
if (manifest.dsh?.client?.platform !== 'web') fail('package.json must declare dsh.client.platform -> web')
if (manifest.dsh?.client?.immediately !== true) fail('package.json must declare dsh.client.immediately -> true')
// `inject` is deliberately ABSENT: naming a package there is the one line in this
// manifest that couples the bundle to a specific DSH package layout, and both seats
// this plugin uses (`shell.overlay`, `sidebar.footer.action`) are declared by the
// shell itself — loaded before any third-party bundle, so the ordering the field
// would buy is already free. See the 1.6.0 entry in the CHANGELOG for the trade.
if (manifest.dsh?.client?.inject !== undefined) {
  fail('package.json must not declare dsh.client.inject: it couples the bundle to one DSH package layout')
}
if (manifest.icon === undefined) fail('package.json must declare an icon')

const requiredExports = {
  '.': './index.js',
  './client': './client.js',
  './package.json': './package.json',
  './cordis.patch.yml': './cordis.patch.yml',
  './locale/*.json': './locale/*.json',
}
for (const [entry, target] of Object.entries(requiredExports)) {
  if (manifest.exports?.[entry] !== target) fail(`package.json must export ${entry} -> ${target}`)
}

// A `prepare` script would make git-hosted installs depend on pnpm allowing a
// build script, which the install flow deliberately blocks until approved.
if (manifest.scripts?.prepare !== undefined) fail('package.json must not declare a prepare script')

// The loader row resolves by package name, so the patch and the manifest must agree.
const patch = readFileSync('cordis.patch.yml', 'utf8')
if (!patch.includes(`name: ${manifest.name}`)) fail(`cordis.patch.yml must insert ${manifest.name}`)
if (!patch.includes('id: cn-prank')) fail('cordis.patch.yml must use the cn-prank row id')

// `locale/en.json` is the file the Plugin Manager probes first: without it the
// whole locale directory is ignored, so both files are required together.
for (const file of ['locale/en.json', 'locale/zh.json']) {
  let meta
  try {
    meta = readJson(file).meta
  } catch (error) {
    fail(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof meta?.title !== 'string' || meta.title === '') fail(`${file} must declare meta.title`)
  if (typeof meta?.description !== 'string' || meta.description === '') {
    fail(`${file} must declare meta.description`)
  }
}

// Both halves are declared, and the Client half must carry an inlined letter
// rather than a path that only resolves on one of the two page origins.
const client = readFileSync('client.js', 'utf8')
if (!client.includes("id: 'dsh-plugin-cn-prank'")) fail('client.js must load under the package id')
if (!client.includes("ctx.slots.inject('shell.overlay'")) fail('client.js must inject into shell.overlay')
if (!/const NOTICE_IMAGE = 'data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+'/.test(client)) {
  fail('client.js must carry an inlined data-URI notice; run `npm run notice`')
}
if (client.includes('__NOTICE_BASE64__')) fail('client.js still holds the placeholder; run `npm run notice`')

// The artwork stays in the repo so the gag can be swapped without reverse
// engineering a 74 KB base64 string.
try {
  const artwork = statSync('assets/notice.webp')
  if (!artwork.isFile() || artwork.size === 0) fail('assets/notice.webp must be a non-empty file')
} catch {
  fail('assets/notice.webp is missing; it is the source of truth for the inlined letter')
}

// The README points at these drawings; a broken image in the first screen of a
// repository is worse than no image at all.
for (const preview of [
  'docs/preview-lockdown.png',
  'docs/preview-verdict.png',
  'docs/preview-beat.png',
  'docs/preview-ban.png',
  'docs/preview-ban-toggle.png',
]) {
  try {
    const file = statSync(preview)
    if (!file.isFile() || file.size === 0) fail(`${preview} must be a non-empty file`)
  } catch {
    fail(`${preview} is missing; run \`node scripts/make-previews.mjs\` to redraw the mock-ups`)
  }
  if (!readFileSync('README.md', 'utf8').includes(preview)) fail(`README.md must reference ${preview}`)
}

// The preview harness is what makes those PNGs reproducible rather than hand-drawn.
try {
  if (statSync('scripts/preview/harness.html').size === 0) fail('scripts/preview/harness.html must not be empty')
} catch {
  fail('scripts/preview/harness.html is missing; the preview script cannot run without it')
}

// The host half must publish its row config under the one global the client reads.
const host = readFileSync('index.js', 'utf8')
if (!host.includes("'webserver/index-inject'")) fail("index.js must push a webserver/index-inject row")
if (!host.includes('__DSH_CN_PRANK__')) fail('index.js must publish the config under __DSH_CN_PRANK__')
if (!client.includes('__DSH_CN_PRANK__')) fail('client.js must read the config from __DSH_CN_PRANK__')

// 暴打 has exactly one animation since 1.7.0: the clip shipped in `assets/`. A
// checkout that deleted it still loads, it simply releases the door immediately —
// so these checks pin the *wiring* (route, URL list, the release path) and only
// report the file.
const VIDEO_ROUTE = '/dsh-cn-prank/beat.mp4'
if (!host.includes(`'${VIDEO_ROUTE}'`)) fail(`index.js must serve ${VIDEO_ROUTE} for the beat video`)
if (!host.includes("'Accept-Ranges'")) fail('index.js must advertise Accept-Ranges for the beat video')
if (!host.includes("'Content-Range'")) fail('index.js must answer Range requests for the beat video')
if (!client.includes(VIDEO_ROUTE)) fail(`client.js must default to ${VIDEO_ROUTE}`)
if (!client.includes('beatVideoUrls')) fail('client.js must read beatVideoUrls from the injected config')
if (!client.includes('failVideo')) fail('client.js must walk the URL list when the beat video fails to load')
if (!client.includes('canPlayVideo')) fail('client.js must release the door when no clip can be played')
// Audio: the clip's own track must not be muted unconditionally, and the refusal path
// has to exist — an animation that stops because sound was blocked is worse than a
// silent one.
if (!client.includes('startVideoAudio')) fail('client.js must play the clip with sound and handle a refusal')
if (!client.includes('beatSoundBlocked')) fail('client.js must say so when autoplay with sound was refused')
if (!client.includes('function createSfx')) fail('client.js must carry the synthesised hit effects')

let videoBytes = 0
try {
  const video = statSync('assets/beat.mp4')
  if (video.isFile()) videoBytes = video.size
} catch {
  /* absent is a legitimate configuration: 暴打 then releases immediately */
}
if (videoBytes > 0 && videoBytes < 1024) fail('assets/beat.mp4 looks truncated')
// Report whether this checkout ships the clip, so a maintainer reading CI output
// knows whether preview-beat.png could have been drawn at all.
if (videoBytes === 0) {
  console.log('verify-manifests: note — no assets/beat.mp4, so 暴打 releases immediately')
} else if (!readFileSync('README.en.md', 'utf8').includes('beat.mp4')) {
  fail('README.en.md must document assets/beat.mp4 when a clip is shipped')
}

// Claude体验模式 is the only part of this plugin that reads the disk, so pin its wiring:
// the route, the bounded scan, the opt-in toggle, and the two seats it needs.
const STATUS_ROUTE = '/dsh-cn-prank/status'
if (!host.includes(`'${STATUS_ROUTE}'`)) fail(`index.js must serve ${STATUS_ROUTE} for Claude体验模式`)
if (!host.includes('function scanForChinese')) fail('index.js must export scanForChinese for its test')
if (!host.includes('banModeMaxFiles')) fail('index.js must bound how many entries one pass may examine')
if (!host.includes('banModeMaxBytes')) fail('index.js must bound how many bytes one file may contribute')
if (!host.includes('banModeRoots')) fail('index.js must let the Claude体验模式 scan be pointed somewhere explicit')
if (!client.includes(STATUS_ROUTE)) fail(`client.js must default to ${STATUS_ROUTE}`)
if (!client.includes("'sidebar.footer.action'")) fail('client.js must register the Claude体验模式 toggle in the sidebar footer')
if (!client.includes('createStatusStore')) fail('client.js must share one status store between the toggle and the overlay')
if (!client.includes('store.suppress()')) fail('client.js must buy the 30-minute silence from the overlay')
// The feature has already been renamed once on screen (封号模式 -> Claude体验模式) while
// its config keys kept their names, so this pins both: the documented *name* and the
// documented *key*. A silent rename that drops either one fails here.
const readmeText = readFileSync('README.md', 'utf8')
const readmeEnglish = readFileSync('README.en.md', 'utf8')
if (!readmeText.includes('Claude体验模式')) fail('README.md must document Claude体验模式')
if (!readmeText.includes('banMode')) fail('README.md must document the banMode config keys')

// Every row option the Host half actually reads must be documented in both READMEs.
// This is the check that would have caught `banMode`'s English description drifting
// into "whether the toggle appears" while the code only ever used it for scanning.
for (const key of Object.keys(projectConfig({}))) {
  // Derived URL lists, not row options: they are computed from `enabled`/`beatVideo`.
  if (key === 'beatVideoUrls' || key === 'statusUrls') continue
  if (!readmeText.includes(`\`${key}\``)) fail(`README.md must document the ${key} option`)
  if (!readmeEnglish.includes(`\`${key}\``)) fail(`README.en.md must document the ${key} option`)
}


console.log(`verify-manifests: ok (${manifest.name}@${manifest.version})`)
