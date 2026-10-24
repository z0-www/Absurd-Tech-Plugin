/**
 * Inline the letter into `client.js`.
 *
 * A published bundle is served to the browser as one file, so the notice cannot
 * be a sibling asset: a Client half that reached for `/some/route` would depend on
 * the Host half having registered that route before the page asked for it, and on
 * the page's origin matching the Host's. A data URI has neither failure mode.
 *
 * The price is that `client.js` is generated, so the source of truth is
 * `assets/notice.webp` and this script is the only writer of that one block.
 *
 * Usage:
 *   node scripts/build-notice.mjs                  # rewrite client.js in place
 *   node scripts/build-notice.mjs --check          # exit 1 when it is out of date
 *   node scripts/build-notice.mjs --source a.jpg   # inline a different image
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

/** The one region of `client.js` this script owns. */
const BEGIN = '/* @notice-image:begin */'
const END = '/* @notice-image:end */'

/** Where the untouched artwork lives. */
const DEFAULT_SOURCE = 'assets/notice.webp'

/** MIME types a browser will render from a data URI without help. */
const MIME = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
}

/** The one line inside the block, kept short so the generated file stays readable. */
const ASSIGNMENT = /^const NOTICE_IMAGE = '.*'$/m

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
const check = argv.includes('--check')
const source = resolve(optionOf(argv, '--source') ?? DEFAULT_SOURCE)
const target = resolve('client.js')

let bytes
try {
  bytes = readFileSync(source)
} catch (error) {
  console.error(`build-notice: cannot read ${source}: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const mime = MIME[extname(source).toLowerCase()]
if (mime === undefined) {
  console.error(`build-notice: ${extname(source)} is not an image a browser renders from a data URI`)
  process.exit(1)
}

const dataUri = `data:${mime};base64,${bytes.toString('base64')}`
const current = readFileSync(target, 'utf8')

const begin = current.indexOf(BEGIN)
const end = current.indexOf(END)
if (begin === -1 || end === -1 || end < begin) {
  console.error(`build-notice: ${target} no longer contains the ${BEGIN} ... ${END} block`)
  process.exit(1)
}

const block = current.slice(begin, end + END.length)
if (!ASSIGNMENT.test(block)) {
  console.error('build-notice: the notice block has no `const NOTICE_IMAGE = ...` line to rewrite')
  process.exit(1)
}

const replacement = block.replace(ASSIGNMENT, `const NOTICE_IMAGE = '${dataUri}'`)
const next = current.slice(0, begin) + replacement + current.slice(end + END.length)

if (next === current) {
  console.log(`build-notice: up to date (${String(bytes.length)} bytes from ${source})`)
  process.exit(0)
}

if (check) {
  console.error(`build-notice: client.js is out of date; run \`npm run notice\` to inline ${source}`)
  process.exit(1)
}

writeFileSync(target, next)
console.log(`build-notice: inlined ${String(bytes.length)} bytes from ${source} into client.js`)
