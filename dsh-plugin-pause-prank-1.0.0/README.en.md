# An Even Worse Pause

中文 | [English](README.md)

> A DSH gag plugin. Hit "stop generating" and the turn does **not** stop — a cute
> confirmation appears instead. Its "cruel ending" hides a second page where the giant
> "goodbye" simply lets the turn continue, and only a tiny "cruel end" really stops it.

![The first page](docs/preview-dialog.png)

## What happens

Clicking the composer's stop button opens the first page:

| Choice | Result |
|---|---|
| **再想想** (think again) | Closes the dialog. **The turn keeps running.** |
| **残忍结束** (cruel ending) | Does *not* end anything — it flips to the second page. |
| **我要吐槽** (complain) | Shows a toast. Nothing stops. |
| **Esc** | Closes the dialog. Nothing stops. |

"残忍结束" leads to the second page — **the most goodbye-looking button is the least goodbye**:

![The second page](docs/preview-stage2.png)

- **A huge 再见 ("goodbye")** — closes the dialog and **continues the turn**.
- **A tiny 狠心结束 ("cruel end")** — this one actually stops: it re-dispatches the click
  to the real stop button and lets DSH cancel the turn.

The portrait, the bubble copy and all three toast lines are configurable, and the picture is
hot-swappable: every time the dialog opens, the Host half reads the file from disk again, so
replacing `assets/persona.png` takes effect on the next pause — no restart, no refresh.

## Install

This plugin lives in the
[Absurd Tech Plugin](https://github.com/z0-www/Absurd-Tech-Plugin) collection, but it is a
standalone bundle and installs like any other:

```jsonc
plugin_manager { "action": "install_bundle", "target": "C:\\path\\to\\dsh-plugin-pause-prank-1.0.0" }
```

```jsonc
// uninstall
plugin_manager { "action": "remove_bundle", "target": "dsh-plugin-pause-prank" }
```

You can also point `install_bundle` at the `dsh-plugin-pause-prank-1.0.0.tgz` shipped next to
this manual. A new bundle usually activates through HMR; if the plugin page says
`restart-required`, restart DSH. Code changes to the Host half only take effect after a restart.

## Swapping the portrait

The default portrait is `assets/persona.png`. Three ways to change it:

| Method | How |
|---|---|
| Overwrite | Save the new picture as `assets/persona.png` |
| Absolute path | Set `imagePath` in `cordis.patch.yml`, e.g. `C:/Users/you/Pictures/me.png` |
| Relative path | `imagePath: '../meme.png'` resolves against the plugin directory; `~/pics/a.png` expands to your home directory |

The dialog crops the portrait to a 27:20 `cover` frame with the subject slightly above centre,
so keep the face in the upper-middle area. If the image fails to load, the dialog shows a
light-blue 🐟 placeholder and the buttons still work.

## Configuration

All fields live in the row's `config` block in `cordis.patch.yml`:

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch. Off only removes the interception; the image route stays. |
| `imagePath` | `''` | Empty = bundled `assets/persona.png`; absolute, relative and `~/` paths are accepted |
| `imageAlt` | `DeepSeek 娘` | Portrait alt text and the dialog's accessible name |
| `kicker` | `🐟 大肥鱼食堂 · 暂停确认` | Small line above the title |
| `title` | `真的要说再见吗？` | Dialog title |
| `subtitle` | `这一轮才刚开始，白饭还没吃完呢……` | Line under the title |
| `cruelSubtitle` | `要把大肥鱼一个人留在这里吗？` | Subtitle on the second page |
| `complainToast` | `已记录你的不满，并转交给了大肥鱼 🐟` | Toast for "我要吐槽" |

Changing configuration requires a plugin reload (profile HMR usually does it; otherwise restart).

## Self-check

Two read-only routes on the local DSH web server:

```
GET /dsh-pause-prank/image    # the portrait, read from disk on every request
GET /dsh-pause-prank/status   # resolved path, exists, size, mtime, current copy
```

If the dialog shows the 🐟 placeholder, open `status` first: it tells you exactly which file
the Host half is looking for. `image` returns a 404 with the same path in its body.

## How it works

The stop button belongs to DSH's composer and has no plugin seat, so the Client half listens
for clicks in the **capture phase** on `window`, stops the React `onClick` from firing, and
opens the dialog. Only "狠心结束" re-dispatches the click to the original button, so the real
cancel logic still runs in DSH — the plugin never touches sessions, models or permissions.

It recognises the button by three signals:

1. it is inside `[data-composer-card]`;
2. its `aria-label` is a localised stop label (`停止生成`, `Stop generating`, …); or
3. its icon is a 10×10 square, and it is not a send/queue button.

Two safeguards keep the prank from breaking itself:

- only **trusted** clicks are intercepted; the programmatic re-dispatch cannot be re-caught;
- one shared runtime on `window` guarantees a single listener set per page, even if DSH's
  client-plugin hot reload applies the bundle twice.

## Limits

- Only mouse clicks (and keyboard activation) of the stop button are intercepted.
  The `Esc Esc` stop shortcut is not, so power users can still stop instantly by keyboard.
- The portrait should be landscape or square-ish; tall images are cropped.
- Interception depends on the composer's `data-composer-card` marker. If a future DSH release
  renames it, the plugin fails safe: the stop button simply works normally.

## Privacy

No network requests are made. The portrait route only reads a local file when the dialog
opens, the dialog never sends anything back, and nothing is persisted. The plugin registers
no tools and changes no DSH settings.

## Development

```bash
node test/host.test.mjs   # Host half: routes, bytes, status, path resolution, defaults
node test/pure.test.mjs   # Client half: bundle shape, stop-button detection
npm test                  # both
```

Browser end-to-end harness (open in Edge/Chrome; no DSH required):

```
test/harness.html?selftest=1      # all paths, with a simulated duplicate mount
test/harness.html?open=1          # first page
test/harness.html?open=1&cruel=1  # second page
test/harness.html?open=1&noimg=1  # portrait fallback
```

## License

MIT © 2026 豌豆 ([z0-www](https://github.com/z0-www)).
