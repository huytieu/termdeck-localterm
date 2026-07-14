# TermDeck

**Your terminal and your notes, in one browser tab.**

TermDeck is a browser-native workspace that fuses two things: a terminal multiplexer where **every tab is a shell**, and a **Markdown knowledge workspace** for reading and writing the notes those shells live next to. Run agents in the terminal on the left, read and edit the docs they touch on the right — same tab, same tool, reachable from any device on your tailnet.

> **TermDeck is a fork of [localterm](https://github.com/monotykamary/localterm)** (MIT, by [@monotykamary](https://github.com/monotykamary)) — all of the terminal foundation is its work. The knowledge/wiki workspace is inspired by [anh-chu/wiki-viewer](https://github.com/anh-chu/wiki-viewer). See [Credits](#credits).

---

## What you get

### Terminal — shell = browser tab _(from localterm)_

- **New tab → new shell.** Close a tab and its shell waits in the session switcher for a short grace window; a shell still producing output or running a foreground program is never reaped mid-command.
- **Live grid** of every session as interactive tiles, a fast session switcher, and reattach-on-reconnect.
- Reachable over your **tailnet** (`https://<node>.ts.net`), a portless local alias, or loopback — no `/etc/hosts` edits.

**TermDeck additions to the terminal:**

- **At-a-glance session status.** A minimal colored glyph per session: `●` amber = running, `●` coral = needs your input, `○` green = idle/done — so you can scan which agent needs you.
- **Hover-to-kill.** A small `✕` on each session row; no trip to the grid.
- **Claude usage quota in the header.** Session (5h) and weekly limits with a bar, % remaining, and reset countdown — read from the same source your statusline uses.

### Wiki — a reading & writing workspace for your vault _(TermDeck)_

- **Browse your vault** as a file tree with persistent expand/collapse, extension filters, hide-dotfiles, and full-text search.
- **A reading surface, not a file dump.** Serif reading typography, a centered measure, a coral accent, and a right-hand info panel (Properties / Location / Stats — word count, blocks, reading time computed live). Toggle **reading mode** to hide all chrome.
- **WYSIWYG editor**, Notion/Obsidian style — headings, lists, tasks, tables, code, links — with a faithful Markdown round-trip (frontmatter preserved verbatim, `[[wikilinks]]` intact). Flip to raw Markdown source anytime.
- **New note** in a click (defaults to `.md`), `[[wikilinks]]`, inline color swatches for hex/rgb values, and syntax-highlighted code (light/dark).
- Light and dark themes across the whole app, with one shared toggle.

---

## Quickstart

```bash
git clone https://github.com/huytieu/termdeck-localterm
cd termdeck-localterm
pnpm install
pnpm build
pnpm start          # boots the daemon and serves TermDeck
pnpm cli status     # shows the active URL
```

Open the URL `pnpm cli status` prints (loopback works with zero setup: `http://localterm.localhost:3417`). `pnpm stop` stops the daemon.

The mental model is **shell = browser tab**; switch to Wiki mode from the left rail to browse and edit your Markdown vault. Full docs live in [`docs/`](docs/).

---

## Screens

A landing page with the full walkthrough lives in [`landing/index.html`](landing/index.html) — open it in any browser. It's self-contained (no build step, no external requests).

---

## Credits

TermDeck stands on other people's work and says so:

- **[localterm](https://github.com/monotykamary/localterm)** by [@monotykamary](https://github.com/monotykamary) — the entire terminal foundation (session model, daemon, tailnet serve, grid). TermDeck is a fork of it.
- **[anh-chu/wiki-viewer](https://github.com/anh-chu/wiki-viewer)** — the inspiration for the in-app Markdown wiki workspace.

TermDeck's own additions: the memo-style reading view, the WYSIWYG editor, the file-tree filters + persistence + new-file flow, session status glyphs, hover-kill, and the usage-quota header.

## License

[MIT](LICENSE) — inherited from localterm. The original copyright and license are preserved unchanged; TermDeck's additions are MIT as well.
