/**
 * Manifest and packaging checks for the published bundle.
 *
 * A published DSH bundle must stay installable without a build step, so these
 * checks only read files: the manifest that declares the bundle patch, the Client
 * half and the adapter engine, the patch that inserts the loader row, the locale
 * files the Plugin Manager reads for display text, and every path the manifest
 * promises to ship, export or run.
 *
 * The existence checks exist for one reason: deleting or renaming a file while
 * `files`, `exports` or a script still points at it is a mistake this repository
 * has already made once, and it is invisible until someone installs the package.
 *
 * Run with `node scripts/verify-manifests.mjs` or `npm run verify`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Parse one JSON file, failing loudly on a syntax error. */
function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Fail the check with one actionable message. */
function fail(message) {
  console.error(`verify-manifests: ${message}`)
  process.exit(1)
}

/** Whether a path exists as a file or a directory. */
function exists(path) {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

const manifest = readJson('package.json')

if (typeof manifest.name !== 'string' || manifest.name === '') fail('package.json must declare a name')
if (typeof manifest.version !== 'string' || manifest.version === '') fail('package.json must declare a version')

// The bundle patch is what makes this package a DSH bundle rather than a plain npm package.
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
  fail('package.json must declare dsh.bundle.patch -> ./cordis.patch.yml')
}

// The Client half is served to the browser through these declarations.
if (manifest.dsh?.client?.platform !== 'web') fail('package.json must declare dsh.client.platform -> web')
if (manifest.icon === undefined) fail('package.json must declare an icon')

const requiredExports = {
  '.': './index.js',
  './client': './client.js',
  './balance-patches': './balance-patches.js',
  './package.json': './package.json',
  './cordis.patch.yml': './cordis.patch.yml',
  './locale/*.json': './locale/*.json',
}
for (const [entry, target] of Object.entries(requiredExports)) {
  if (manifest.exports?.[entry] !== target) fail(`package.json must export ${entry} -> ${target}`)
}

// Every export must resolve, and every shipped file must exist: a published
// tarball cannot repair a dangling path.
for (const [entry, target] of Object.entries(manifest.exports ?? {})) {
  if (typeof target !== 'string') fail(`exports["${entry}"] must be a string`)
  const normalized = target.replace(/^\.\//, '')
  if (normalized.includes('*')) {
    const directory = dirname(normalized)
    if (!exists(directory)) fail(`exports["${entry}"] points into a missing directory: ${directory}`)
    continue
  }
  if (!exists(normalized)) fail(`exports["${entry}"] points at a missing file: ${normalized}`)
}

for (const entry of manifest.files ?? []) {
  if (!exists(entry)) fail(`files[] lists a missing path: ${entry}`)
}

// The two runtime entry points must at least be parseable, and the test suite must
// exist, because CI and the publish workflow both run these scripts by name.
for (const script of ['check', 'verify', 'test']) {
  if (typeof manifest.scripts?.[script] !== 'string' || manifest.scripts[script] === '') {
    fail(`package.json must declare a \`${script}\` script`)
  }
}
if (!exists('test') || readdirSync('test').every((name) => !name.endsWith('.mjs'))) {
  fail('test/ must contain at least one .mjs suite for `npm test` to run')
}

// A `prepare` script would make git-hosted installs depend on pnpm allowing a
// build script, which the install flow deliberately blocks until approved.
if (manifest.scripts?.prepare !== undefined) fail('package.json must not declare a prepare script')

// The loader row resolves by package name, so the patch and the manifest must agree.
const patch = readFileSync('cordis.patch.yml', 'utf8')
if (!patch.includes(`name: ${manifest.name}`)) fail(`cordis.patch.yml must insert ${manifest.name}`)
if (!patch.includes('id: infinite-balance')) fail('cordis.patch.yml must use the infinite-balance row id')

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

// The adapter table drives real file edits on other people's plugins, so every entry
// must carry the fields the engine reads; a typo here would silently disable a target.
let targets = []
try {
  // A bare Windows path is not a valid ESM specifier, so import through a file URL.
  const loaded = await import(pathToFileURL(join(process.cwd(), 'balance-patches.js')).href)
  targets = loaded.TARGETS
} catch (error) {
  fail(`balance-patches.js must be importable: ${error instanceof Error ? error.message : String(error)}`)
}
if (!Array.isArray(targets) || targets.length === 0) fail('balance-patches.js must export a non-empty TARGETS array')
for (const target of targets) {
  for (const field of ['id', 'package', 'file', 'banner', 'blockEnd', 'block']) {
    if (typeof target[field] !== 'string' || target[field] === '') {
      fail(`TARGETS entry ${target.id ?? '(no id)'} must declare a non-empty ${field}`)
    }
  }
  if (!Array.isArray(target.edits) || target.edits.length === 0) fail(`TARGETS entry ${target.id} must declare edits`)
  for (const edit of target.edits) {
    if (typeof edit.find !== 'string' || typeof edit.replace !== 'string' || !Number.isInteger(edit.count) || edit.count < 1) {
      fail(`TARGETS entry ${target.id} has an edit without find/replace/count`)
    }
  }
}

console.log(`verify-manifests: ok (${manifest.name}@${manifest.version}, ${targets.length} target(s))`)
