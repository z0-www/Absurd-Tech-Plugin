English | [中文](README.zh.md)

# Absurd Tech Plugins

> A bunch of unhinged `dsh` plugins I made. They're absurd, they're cursed, and now they're on GitHub.

Three real, working **DSH (DeepSeek Harness)** bundles. Each is a Host + Client pair with
**zero runtime dependencies**, no `@deepseek-ai/*` imports and no build step. None of them has
any practical use.

| Plugin | Version | One-liner | Manuals | Package |
|---|---|---|---|---|
| **[Time-Zone Lockdown](dsh-plugin-cn-prank-1.7.0/)** | 1.7.0 | A China time zone locks the harness behind a fake account-suspension letter; only the two doors in its footer let it go. | [中文](dsh-plugin-cn-prank-1.7.0/README.md) · [English](dsh-plugin-cn-prank-1.7.0/README.en.md) | [zip](dsh-plugin-cn-prank-1.7.0/dsh-plugin-cn-prank-1.7.0.zip) |
| **[Infinite Balance](dsh-plugin-infinite-balance-1.2.1/)** | 1.2.1 | Any balance above the threshold is presented as **∞** — in the UI, to the model, and inside other plugins that display it. | [中文](dsh-plugin-infinite-balance-1.2.1/README.md) · [English](dsh-plugin-infinite-balance-1.2.1/README.en.md) | [tgz](dsh-plugin-infinite-balance-1.2.1/dsh-plugin-infinite-balance-1.2.1.tgz) |
| **[An Even Worse Pause](dsh-plugin-pause-prank-1.0.0/)** | 1.0.0 | The stop button opens a cute pause confirmation; its "cruel ending" hides a second page where the giant "goodbye" continues the turn and only the tiny "cruel end" really stops it. | [中文](dsh-plugin-pause-prank-1.0.0/README.md) · [English](dsh-plugin-pause-prank-1.0.0/README.en.md) | [tgz](dsh-plugin-pause-prank-1.0.0/dsh-plugin-pause-prank-1.0.0.tgz) |

## Start here

- **These are prank plugins.** The "suspension notice" is a forged image and "the Humanitarian Association's Safeguard Team" does not exist. None of these plugins suspends an account, uploads anything, or writes persistent state.
- **Install from a path you intend to keep.** A local install is recorded as a pnpm `link:`, so moving or deleting the plugin folder breaks the plugin.
- **Nothing here phones home.** None of the plugins makes a network request; there is no `fetch`, `XMLHttpRequest` or `WebSocket` in any Client half.
- **Host-half changes need a full DSH restart.** A page refresh is not enough, and toggling the bundle off and on is not enough either.
- **Only arm Time-Zone Lockdown on your own machine.** It is designed to be annoying on purpose; that is a decision its owner gets to make, not their colleague.
- **Not affiliated with DeepSeek or Anthropic.** Community fan work, no official position implied.

## Install

Ask the agent inside DSH to run `plugin_manager install_bundle` with an **absolute path** to the
plugin folder (or to the package archive). Relative paths are refused. `install_bundle` performs
the package installation and bundle selection itself, so never hand-edit the profile's
`package.json` or `cordis.patch.yml`.

| Plugin | `install_bundle` target | `remove_bundle` target |
|---|---|---|
| Time-Zone Lockdown | `C:\path\to\dsh-plugin-cn-prank-1.7.0` | `dsh-plugin-cn-prank` |
| Infinite Balance | `C:\path\to\dsh-plugin-infinite-balance-1.2.1` | `dsh-plugin-infinite-balance` |
| An Even Worse Pause | `C:\path\to\dsh-plugin-pause-prank-1.0.0` | `dsh-plugin-pause-prank` |

```jsonc
plugin_manager { "action": "install_bundle", "target": "C:\\path\\to\\dsh-plugin-pause-prank-1.0.0" }
```

A new bundle usually activates through HMR; if the plugin page reports `restart-required`,
restart DSH. For Time-Zone Lockdown, confirm the escape hatch **before you arm it**: append
`?no-prank=1` to the DSH web UI URL (default `http://127.0.0.1:19387/`).

## The plugins

### Time-Zone Lockdown

<img src="dsh-plugin-cn-prank-1.7.0/docs/preview-lockdown.png" alt="The lockdown letter covering the whole harness" width="640">

*Mock-up, not a screenshot: the letter covers the whole frame, with 原因 (Reason) and 暴打 (Beat up) at the two ends of the same-coloured footer below it.*

The time-zone test is one line: does `Intl.DateTimeFormat().resolvedOptions().timeZone` match one
of the configured China zones? A miss registers no DOM at all — and the test is only consulted
once the master switch is on.

**The letter has no close button.** Leaving means picking a door in the footer underneath it:

- **原因 (Reason)** — reads real machine facts once (cores, screen, GPU, locale, time zone, …), narrates them as a fake audit log, then hands down one of 18 Chinese / 12 English verdict templates that quote a real number and conclude something impossible.
- **暴打 (Beat up)** — plays the bundled `assets/beat.mp4` (the whale girl takes a frying pan to the head). Skippable at any moment; `Esc` three times also gets you out.

Two controls appear in the sidebar footer: **Claude体验模式** is the master switch (off by
default, memory only), and a number box re-checks the time zone every 1–60 minutes. With the
switch on, the Host half also scans registered DSH workspaces for Chinese text every 10 seconds;
a hit re-pops the letter with a red strip naming the file and the count. The scan is read-only
and bounded (400 entries, 64 KB per file, four levels deep).

<img src="dsh-plugin-cn-prank-1.7.0/docs/preview-verdict.png" alt="The fake audit and its absurd verdict" width="560">

Full behavior, every option and every escape hatch:
[中文](dsh-plugin-cn-prank-1.7.0/README.md) · [English](dsh-plugin-cn-prank-1.7.0/README.en.md).

### Infinite Balance

<img src="dsh-plugin-infinite-balance-1.2.1/icon.svg" alt="Infinite Balance icon" width="56">

Once the account balance is above the threshold, the balance is presented as **∞**:

```
Balance ∞          ← balance > 10
Balance ¥3.20      ← balance ≤ 10
```

Both halves agree, so the UI and the Agent never contradict each other:

| Half | File | Responsibility |
|---|---|---|
| Host | `index.js` | Registers the `infinite_balance` tool: pass `amount` to convert one value, omit it to read the real balance of the signed-in account. |
| Client | `client.js` | Renders the badge in the `conversation.composer.dock` seat, reading `ctx.remote.account.getBalance`. |

Options live in the row's `config` block in `cordis.patch.yml`:

| Field | Default | Meaning |
|---|---|---|
| `threshold` | `10` | Strictly above this amount the balance reads `∞` |
| `currency` | `CNY` | Wallet read and labelled by default |
| `clientVersion` | `0.2.0-rc.2` | Feeds the Platform `x-client-version` header; informational |
| `locale` | `zh` | Platform wire locale, `zh` or `en` |

Its optional adapters also rewrite other plugins' balance displays (today: `dsh-whale-widget`),
keeping pristine backups and refusing to write when an anchor no longer matches. `adapters: false`
turns every adapter off.

Full manual: [中文](dsh-plugin-infinite-balance-1.2.1/README.md) ·
[English](dsh-plugin-infinite-balance-1.2.1/README.en.md).

### An Even Worse Pause

<img src="dsh-plugin-pause-prank-1.0.0/docs/preview-dialog.png" alt="The first page of the pause dialog" width="620">

*The stop button does not stop on the first click.*

Hitting the composer's stop button while a turn is running gives you a two-stage fake-out:

| Choice | What really happens |
|---|---|
| **再想想** (think again) | Closes the dialog; **the turn keeps running.** |
| **残忍结束** (cruel ending) | Does not end anything — it flips to the second page. |
| **我要吐槽** (complain) | Shows a toast. Nothing stops. |
| **Esc** | Closes the dialog; nothing stops. |

The second page is the actual trap:

<img src="dsh-plugin-pause-prank-1.0.0/docs/preview-stage2.png" alt="The second page: a giant goodbye and a tiny cruel end" width="620">

- the **giant 再见 ("goodbye")** button closes the dialog and **lets the turn continue**;
- the **tiny 狠心结束 ("cruel end")** link is the only thing that actually stops — it
  re-dispatches the click to DSH's real stop button.

The portrait is hot-swappable: the Host half serves `assets/persona.png` at
`/dsh-pause-prank/image` and re-reads it on every open, so replacing the file (or pointing
`imagePath` elsewhere) takes effect on the next pause — no restart. The bubble copy and the
complaint toast are config fields; if the picture is missing, the dialog falls back to a
light-blue 🐟 placeholder and the buttons still work.

Self-check: `GET /dsh-pause-prank/status` reports the resolved portrait path, whether it exists,
its size and mtime. Full manual: [中文](dsh-plugin-pause-prank-1.0.0/README.md) ·
[English](dsh-plugin-pause-prank-1.0.0/README.en.md).

## Repository layout

```
.
├─ README.md / README.zh.md               # this page, English and Chinese
├─ LICENSE                                # MIT, the whole collection
├─ .github/workflows/ci.yml               # syntax + unit tests on push
├─ dsh-plugin-cn-prank-1.7.0/             # source, manuals, assets, docs
│  ├─ index.js / client.js
│  ├─ assets/ docs/ locale/ scripts/
│  ├─ README.md / README.en.md
│  └─ dsh-plugin-cn-prank-1.7.0.zip       # the same plugin, packed
├─ dsh-plugin-infinite-balance-1.2.1/
│  ├─ index.js / client.js
│  ├─ balance-patches.js                  # other plugins' balance displays
│  ├─ locale/ scripts/ test/
│  ├─ README.md / README.en.md
│  └─ dsh-plugin-infinite-balance-1.2.1.tgz
└─ dsh-plugin-pause-prank-1.0.0/
   ├─ index.js / client.js
   ├─ assets/persona.png                  # default portrait, replace me
   ├─ cordis.patch.yml
   ├─ docs/ test/
   ├─ README.md / README.en.md
   └─ dsh-plugin-pause-prank-1.0.0.tgz
```

## Requirements

- A DSH build that provides the `plugin_manager` tool and the points these plugins hook into:
  `shell.overlay` for the letter, `conversation.composer.dock` for the balance badge, and the
  composer's `[data-composer-card]` marker for the pause button.
- No package installation, no build step, no runtime dependencies.
- All three bundles deliberately declare **no `Config` schema** — importing `schemastery` is not
  resolvable from inside a third-party bundle, so the config form is empty on the plugin page by
  design. Override the row in your own `cordis.patch.yml` instead.

## Privacy

Everything Time-Zone Lockdown's audit reads is something any web page can already read, and all of
it stays on your machine. The scan reads the head of a file, counts CJK characters, and stores
neither the bytes nor any copy of them; the popup shows a path and a count. Its switches live in
memory only, so restarting DSH returns them to off.

Infinite Balance reads your balance through the public Client Remote
`ctx.remote.account.getBalance` — the same source the account page uses. Its optional adapters
patch other plugins' local files, keep pristine backups and never touch the official account page
packaged inside `app.asar`.

An Even Worse Pause makes no request at all: its portrait route reads a local file only when the
dialog opens, and nothing is stored.

## License

MIT © 2026 豌豆 ([z0-www](https://github.com/z0-www)). The collection's license is in
[`LICENSE`](LICENSE); each plugin also ships its own `LICENSE` file.
