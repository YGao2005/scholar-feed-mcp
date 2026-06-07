# Demo Cast Script (15 to 30 seconds)

A short terminal demo for the README, the launch posts, and the docs. The goal: show that install is one command and that the first real query returns ranked papers with novelty scores, all inside an MCP client. Keep it under 30 seconds; people scrub away after that.

## Tooling

Two good options:

- VHS (charmbracelet/vhs): a `.tape` script renders a deterministic GIF/MP4 in CI. Best for a repeatable, captioned GIF that stays in sync. Requires `ttyd` and `ffmpeg`. A `.tape` skeleton is below.
- asciinema + agg: record a real session (`asciinema rec demo.cast`), then convert to GIF with `agg`. Best if you want a real, slightly-imperfect human cadence and an embeddable player.

For a launch, render BOTH a GIF (for X, Reddit, README, Discord, which autoplay GIFs) and keep the `.cast`/MP4 for the docs site player. GIF is the workhorse because it autoplays inline everywhere.

## What the viewer sees (storyboard)

Total target: ~22 seconds. Captions appear as on-screen text overlaid on the terminal (VHS can type them as comments, or add them in post). Keep the terminal font large (>=22px) so it is legible on a phone.

| Time | On screen | Caption overlay |
|------|-----------|-----------------|
| 0.0s | Clean prompt, blinking cursor. | `Add a 600k-paper research index to Claude Code` |
| 1.5s | Type `npx scholar-feed-mcp init` and run it. | `One command. No API key needed.` |
| 3.0s | Wizard runs: detects the client, offers to skip the key, writes config, verifies the connection. Let the real output scroll. | `Auto-detects your MCP client and verifies the connection` |
| 9.0s | Wizard prints success. Brief pause. | `Now ask, in plain language` |
| 11.0s | Switch to the client (or simulate a prompt line). Type the query: `Search for recent high-novelty papers on test-time compute scaling` | (no caption, let the query read) |
| 13.0s | Results stream: 3 to 4 papers, each with title, arXiv id, a one-line LLM summary, and a novelty score. | `Ranked by an LLM novelty score, with summaries` |
| 20.0s | Hold on the result list. | `25 tools: search, citations, full text, BibTeX, watches` |
| 22.0s | Final frame: the repo URL. | `github.com/YGao2005/scholar-feed-mcp` |

Notes on accuracy:
- The result rows must reflect real fields the tool returns: `arxiv_id`, `title`, `llm_summary`, `llm_novelty_score` (0.0 to 1.0). Do not fabricate a score format the tool does not use.
- The init wizard genuinely (1) optionally asks for a key or lets you skip for anonymous access, (2) detects Claude Code / Cursor / Claude Desktop, (3) writes config and verifies. Keep the captions matched to that.
- "anonymous" is accurate: anonymous access is 100 calls/day, enough for the demo. Do not imply a key is required.

## Exact commands to run

```bash
# 1. Install + configure (the whole pitch is that this is one command)
npx scholar-feed-mcp init
# (choose: skip the API key -> anonymous; let it auto-detect the client)

# 2. Then, inside Claude Code / Cursor, ask in natural language:
#    Search for recent high-novelty papers on test-time compute scaling
```

The second step is a natural-language prompt to the agent, not a shell command. In the recording, show it as a message typed into the client. If you want a pure-terminal version (no client UI), you can show the equivalent by letting the agent call `search_papers` with `q: "test-time compute scaling"`, `sort: "trending"` (or `novelty_min: 0.5`), and `days` set to a recent window, then render the returned papers. Use only real parameter names from the README: `q`, `category`, `novelty_min`, `days`, `sort`, `limit`.

## VHS `.tape` skeleton

Save as `assets/demo.tape`, then `vhs assets/demo.tape` to produce the GIF. Tune `Sleep` values against a real run so the pacing matches actual latency.

```tape
Output assets/demo.gif
Output assets/demo.mp4

Set FontSize 24
Set Width 1200
Set Height 700
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms
Set Padding 24

Type "npx scholar-feed-mcp init"
Enter
Sleep 7s        # let the real wizard run: detect client, skip key, write config, verify

Sleep 1s
Type "# now ask in plain language inside your MCP client:"
Enter
Type "Search for recent high-novelty papers on test-time compute scaling"
Enter
Sleep 6s        # results stream in with novelty scores

Sleep 3s        # hold on the final result list
```

If the wizard is interactive (prompts for key/client), VHS needs the keystrokes for those prompts too: after `Enter`, add the responses, e.g. `Enter` to accept the default "skip key," then `Enter` again to accept the detected client. Do a dry run, watch the prompts, and insert the matching `Type`/`Enter` lines.

## Post-production / publishing

- Trim dead air so the whole thing lands at 15 to 25 seconds.
- Loop the GIF cleanly (end frame should rest on the repo URL).
- Burn captions in (do not rely on a separate caption track) since most surfaces autoplay muted with no captions.
- Output sizes: keep the GIF reasonably small (under ~8 MB) so it autoplays on Reddit and Discord without a click-to-load. If it is too big, lower FPS in agg/VHS or shorten it.
- Drop the GIF into the README right under the badges, and reuse it as the media on the X launch post and the Reddit post.
