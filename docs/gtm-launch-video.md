# TermDeck — GTM launch video (script + shot list)

A ~50-second product reel for the launch post / README hero / landing embed.
Record against a **sanitized demo vault** (a throwaway folder of generic notes:
`welcome.md`, `q3-roadmap.md`, `meeting-notes.md`, a couple of code files) — never
the real vault. Screen capture at 2× (retina), 30fps, then downscale for the GIF.

**Format:** one continuous screen recording, cut into the beats below. No talking
head. On-screen captions (Public Sans, coral highlight) instead of voiceover so it
autoplays muted on GitHub / X / the landing page.

**Tone:** calm, fast, confident. Matches the app's memo aesthetic — dark `#1e1e1e`,
serif reading, coral accent. No zoom-bounce, no neon.

---

## Beats

| # | Time | On screen | Caption |
|---|------|-----------|---------|
| 1 | 0:00–0:04 | A single browser tab. Type in a shell; open a second tab → a second shell appears in the session list. | **Every tab is a shell.** |
| 2 | 0:04–0:10 | The session list with three sessions; a colored glyph on each (● amber running, ● coral needs-you, ○ green idle). Cursor hovers the coral one. | **See which agent needs you — at a glance.** |
| 3 | 0:10–0:14 | Hover a row → the ✕ appears → click → confirm → it's gone. | **Kill a session without leaving the list.** |
| 4 | 0:14–0:18 | The header quota bars `s:▰▰▱▱▱ 52% ↻2h · w:▰▰▰▰▱ 94% ↻6d`. | **Your usage limits, always in view.** |
| 5 | 0:18–0:24 | Switch to Wiki mode. A note opens in the serif reading view with the right-hand Properties / Stats panel. Scroll slowly. | **The same tab reads your notes.** |
| 6 | 0:24–0:30 | Toggle reading mode → chrome disappears, just the centered column. | **Reading mode. Nothing but the words.** |
| 7 | 0:30–0:40 | Click edit → WYSIWYG. Type `## ` → heading. Type `- ` → a coral-arrow bullet. `/`-free markdown shortcuts. Add a `[[wikilink]]`. Toggle to Markdown source to show it's still clean `.md`. | **Edit like Notion. Save like Markdown.** |
| 8 | 0:40–0:46 | Click `+` → name a note → it opens ready to write. | **New note in a click.** |
| 9 | 0:46–0:50 | Pull back to the full app: terminal + wiki, dark theme. Logo + tagline. | **TermDeck — your terminal and your notes, in one tab.** |

---

## End card

- Wordmark: **Term**`Deck` (coral `Deck`).
- Line: `github.com/huytieu/termdeck-localterm`
- Small: `a fork of localterm (MIT)`

## Assets to produce

1. **`landing-demo.mp4`** — the full reel (for X/LinkedIn, autoplay muted).
2. **`demo.gif`** — beats 5–8 (the wiki story), ≤ 8 MB, for the README hero and landing `.mock` slot.
3. **Stills** — one hero frame (reading view) + one WYSIWYG frame for the launch post.

## Distribution (per the house playbook)

- README hero + `landing/index.html` (swap the CSS mock for `demo.gif`).
- X / LinkedIn launch post with `landing-demo.mp4` (native upload, not a link).
- Show HN / IndieHackers: lead with the "terminal + notes in one tab" framing and the localterm attribution up front.
