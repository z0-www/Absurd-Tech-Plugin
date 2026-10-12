# Infinite Balance

中文 | [English](README.md)

> A DSH gag plugin with **no practical use**: once the account balance is above 10, the balance is presented as **∞**.

A Host + Client DSH bundle. The Host half registers the "infinity rule" as a model-callable tool; the Client half keeps one small line under the composer card that flips to `∞` as soon as the balance crosses the threshold. Zero runtime dependencies — it imports no `@deepseek-ai/*` package.

```
Balance ∞        ← balance > 10
Balance ¥3.20     ← balance ≤ 10
```

## What each half does

| Half | File | Responsibility |
|---|---|---|
| Host | `index.js` | Registers the `infinite_balance` tool: pass `amount` to convert one value, omit it to read the real balance of the signed-in account. |
| Client | `client.js` | Renders the badge in the `conversation.composer.dock` seat, reading `ctx.remote.account.getBalance`. |

Both callers therefore agree: with a balance of 12.34 the UI shows `¥∞` and the Agent answers `¥∞`.

## Install

`target` goes through DSH's `parseInstallSpec`, which accepts an **absolute** local path, a git address, a tarball, or an npm package name. Relative paths are refused.

Ask the Agent in DSH to install it, which runs:

```jsonc
plugin_manager { "action": "install_bundle", "target": "github:Z0-www/dsh-plugin-infinite-balance" }
```

| `target` form | Example |
|---|---|
| GitHub shorthand | `github:owner/dsh-plugin-infinite-balance` |
| git address | `git+https://github.com/owner/dsh-plugin-infinite-balance.git` |
| npm name (optionally versioned) | `dsh-plugin-infinite-balance@1.0.0` |
| local directory (absolute only) | `C:\Users\me\dsh-plugin-infinite-balance` |
| tarball | `https://example.com/dsh-plugin-infinite-balance-1.0.0.tgz` |

Do not hand-edit the profile's `package.json` or `cordis.patch.yml`: `install_bundle` performs package installation and bundle selection itself. A new bundle usually activates through HMR; if the plugin page reports `restart-required`, restart DSH.

Uninstall with `plugin_manager { "action": "remove_bundle", "target": "dsh-plugin-infinite-balance" }`.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `threshold` | `10` | Strictly above this amount the balance reads `∞` |
| `currency` | `CNY` | Wallet read and labelled by default |
| `clientVersion` | `0.2.0-rc.2` | Feeds the Platform `x-client-version` header; informational |
| `locale` | `zh` | Platform wire locale, `zh` or `en` |

Your own `cordis.patch.yml` is applied after bundle layers, so overrides survive DSH upgrades:

```yaml
- id: infinite-balance
  name: dsh-plugin-infinite-balance
  config:
    threshold: 100
```

> The Client half carries its own `THRESHOLD` constant at the top of `client.js`. The two halves share no module, so change both.

> **This plugin deliberately declares no `Config` schema.** Declaring one needs `schemastery`, and a third-party bundle installed in a profile resolves no package outside the ones shipped with DSH — importing one would risk breaking on the next DSH release. The cost is that the plugin page renders no config form for this row (`Config.listConfigs` reports `status: absent`); override the options with the YAML above.

## Adapting other balance displays

When a plugin displays the balance, this plugin keeps **its** number at `¥ ∞` too — one rule, several surfaces.

### Why there is no universal hook

DSH has no shared "format the balance" entry point: every plugin ships its own formatter. Rewriting the balance *data* is not an option either — turning it into `∞` or an astronomical number makes other formatters throw (`new Big(...)` cannot parse it) and takes the whole slot down with it. So adaptation is **per target**: one package + one front-end file + one anchor set.

### The target table (`TARGETS` in `balance-patches.js`)

**Adding a target is a declaration, not engine code.** The table ships one entry today: `whale` (`dsh-whale-widget`).

| Property | Behaviour |
|---|---|
| Self-healing | Every mount re-checks the target; after `npm update` overwrites it, the next start re-applies |
| Idempotent | Nothing is written when the patch is current; a changed `threshold` re-patches; an older (v1) patch is reverted and upgraded first |
| Anchor accounting | Every edit must match its declared hit count, otherwise **nothing is written at all** |
| Backup | The pristine file is stored once under `$DSH_HOME/.infinite-balance/backups/` |
| Store safety | Temp file + rename, so the pnpm-store copy behind the hardlink is never modified in place |
| Balance only | For the whale: the injected `fmtBal()` replaces the balance / bonus / recharge sites; "today's usage" keeps calling `fmt()`, so its amount stays real |

### See what is installed: `--discover`

A read-only scan of the active profile's `node_modules`, reporting who displays a balance, which signals matched, the formatter names it guessed, and whether the target is already covered:

```powershell
node balance-patches.js --discover        # human report
node balance-patches.js --discover --json # machine report
```

Findings are **candidates only**. Confirming "this number is the balance" and "these hit counts are right" stays a human step — which is the spirit of the platform rule against reading another plugin's DOM: changes belong on explicit, verifiable anchors, not on guesses.

### Adding a target

1. `--status` for the current state, `--discover` for candidate files and formatter names.
2. Add one entry to `TARGETS`: `package` / `file` / `banner` / `blockEnd` / `block` (the formatter to inject) / `edits` (`find` + `replace` + `count` each).
3. Run `node balance-patches.js --target=<id>`: a drifted anchor is refused with the exact edit, the expected count, and the actual count.

**Covers** any plugin that renders the balance as text (the vast majority). **Does not cover** numbers drawn on canvas/WebGL, balance images, or the **official account page packaged inside `app.asar`** — that is the client's own file, and patching it would be reverted by every app update, so this plugin deliberately leaves it alone.

Turn every adapter off:

```yaml
- id: infinite-balance
  name: dsh-plugin-infinite-balance
  config:
    adapters: false
```

Status, revert, and single-target runs, from the plugin directory:

```powershell
node balance-patches.js --status         # per target: patched / patched-legacy / pristine / absent
node balance-patches.js --revert         # restore pristine files from this plugin's backups
node balance-patches.js --target=whale   # touch one target only
```

> `window.__DSHW_INF_THRESHOLD__ = 20` still overrides a target's threshold for the page (hard refresh to apply); otherwise `config.threshold` is the fallback.

## Why not just rewrite the number on the account page

That number is rendered by the shipped `@deepseek-ai/dsh-client-ui-settings-account`:

```js
function formatBalance(amount, symbol) {
  const value = new Big(amount)                       // big.js
  if (value.eq(0)) return `${symbol}0.00`
  if (value.lt(0)) return `-${symbol}${...}`
  if (value.lt('0.01')) return `<${symbol}0.01`
  return `${symbol}${addCommas(value.round(2, Big.roundDown).toFixed(2))}`
}
```

All three shortcuts are blocked:

1. **No seat to inject into.** The account page is one entry in the `settings.section` list; a list slot only appends, so no plugin can put text inside that page's JSX.
2. **The data cannot be faked.** Returning `"∞"` or `"Infinity"` as a balance makes `new Big(...)` throw and the whole slot entry crashes (`slot entry crashed` in the console), blanking the page.
3. **A huge number cannot fake the glyph.** `formatBalance` always emits `<symbol><digits>.00`; a colossal amount only renders a long `1,000,000,…`, never `∞`.

So this plugin does what DSH prescribes: **register its own seat and render the value itself.** Data comes from the public Client Remote `ctx.remote.account.getBalance(client)` — the same source the account page uses — and the rule runs inside this plugin's own component. It reads no other plugin's DOM, guesses no other plugin's styles, and imports no `@deepseek-ai/dsh-client-*` package. Colors use theme tokens only (`--dsw-alias-label-secondary`, `--dsw-alias-state-success-primary`), so light and dark themes both work and a renamed token degrades appearance without breaking rendering.

The trade-off is placement: the badge lives in the composer dock rather than on the account page. It is visible on every chat, which is arguably better for a gag.

## Moving the badge

Change the seat key in `client.js`; the registration options and the component stay the same:

| Placement | Seat key |
|---|---|
| Below the composer (default) | `conversation.composer.dock` |
| A row in Settings → General | `settings.general.item` |
| A dedicated settings page | `settings.section` |

Also update `dsh.client.inject` in `package.json` to the package that owns the new seat (default: `@deepseek-ai/dsh-client-ui-conversation`).

## Failure posture

- The Client half injects `['slots', 'locale', 'remote', 'remote.account']`, so it stays **pending rather than throwing** in a composition without the account seat.
- The Host half hard-depends on `tools` only, and reads the account service optionally through `ctx.get('deepseekAccount')`.
- Signed out, a failed Platform read, no wallet in that currency, or a non-numeric amount: the badge renders nothing and the tool returns an explicit error. No slot ever crashes.
- Adaptation is a plain file operation: a missing target, drifted anchors, or a locked file only mean "not applied this time", and never affect the plugin or DSH.
- Every registration happens inside `ctx.effect`, so unloading the plugin leaves nothing behind. No new session event types are written.

## Pre-publish checklist

1. Package identity is in place in `package.json`: `author` is 豌豆, and `repository` / `homepage` / `bugs` point at `github.com/Z0-www/dsh-plugin-infinite-balance`. Keep those four together if the repository ever moves.
2. Run the CI checks locally (no dependency install needed): `npm run check` parses the three runtime modules and the test, `npm run verify` validates the manifest, the patch row, every `exports` / `files` / script path and the adapter table's fields, and `npm test` runs the acceptance suite (fixtures are generated on the fly, so CI and a workstation run the same assertions).
3. `git init -b main && git add . && git commit -m "feat: infinite balance 1.2.1"`, then push.
4. Installing it elsewhere — pick one, the two sources conflict: `dsh plugin --profile web add github:Z0-www/dsh-plugin-infinite-balance`, or the npm name once published.
5. Releasing. Preferred: bump `version`, commit, then `git tag v1.2.1 && git push origin v1.2.1`. The [`publish.yml`](.github/workflows/publish.yml) workflow runs the checks, refuses a tag that disagrees with `package.json`, and publishes over npm **Trusted Publishing (OIDC, no token)** with provenance. One-time setup: on npmjs.com, register this repository plus the workflow file `publish.yml` as a trusted publisher. The name `dsh-plugin-infinite-balance` is **not taken**. Manual alternative: `npm login && npm publish` — a `prepublishOnly` hook reruns the checks. A scoped name would also need `--access public`.

## License

[MIT](LICENSE)
