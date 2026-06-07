# Launch Posts (ready to post)

Drafts for X, r/LocalLLaMA, Show HN, and a Discord #showcase. Every number here is verified against the repo: 25 tools, 600,000+ CS/AI/ML papers, anonymous access at 100 calls/day or a free key at 1,000/day. Install is `npx scholar-feed-mcp init`. Repo: github.com/YGao2005/scholar-feed-mcp. Site: scholarfeed.org.

Channel-specific tone is the whole game: HN wants flat and factual, X wants a tight hook, Reddit wants a builder talking to builders (and is sensitive about hosted-vs-local), Discord wants short and friendly. Same facts, four registers.

Attach the demo GIF to the X post, the Reddit post, and the Discord blurb. Show HN gets no image (text only).

---

## X / Twitter thread (4 posts)

Post all four within a minute of each other so they unroll as one card. Put the demo GIF on post 1.

**1/**
I built an MCP server that puts 600,000+ CS/AI/ML papers inside Claude Code and Cursor.

Ask "find recent high-novelty work on test-time compute scaling" and get ranked papers with summaries, without leaving your editor.

One command to install:
`npx scholar-feed-mcp init`

[demo GIF]

**2/**
It is a literature-review toolkit, not just search. 25 tools: search and trace citations, pull full text from LaTeX, export BibTeX, map co-authors, build a library and collections, and set daily watches for new work in your niche.

**3/**
No signup to try it. Anonymous access is 100 calls/day, enough for a real session. A free key bumps you to 1,000/day. The papers come from arXiv, indexed daily, each with an LLM summary and a 0 to 1 novelty score so you can filter for genuinely new results.

**4/**
It is open source (MIT) and a standard stdio MCP server, so it also works in Claude Desktop, Windsurf, Cline, Zed, and the rest.

Repo, docs, and the full tool list:
github.com/YGao2005/scholar-feed-mcp

---

## r/LocalLLaMA post

Before posting: check the current subreddit rules in the sidebar and flair the post correctly (Resources/Tutorial or similar). This community is sharp about self-promotion and about the local-vs-hosted distinction, so be upfront that the corpus and ranking run on a hosted API. Reply to comments fast; that is what carries a Reddit post.

**Title:**
I built an open-source MCP server that gives your agent a 600k-paper arXiv research index (search, citations, full text, BibTeX)

**Body:**
I do a lot of literature review and kept bouncing between arXiv, Google Scholar, and my editor. So I wrote an MCP server that exposes a research corpus to whatever agent you already use.

What it does:
- Semantic + keyword search over 600,000+ CS/AI/ML papers (arXiv, indexed daily)
- Each paper has an LLM-generated summary and a 0 to 1 novelty score, so you can filter for actually-novel work instead of yet another incremental paper
- Trace citations both directions, pull results/experiments out of the LaTeX source, export BibTeX
- Author search and co-author graphs
- A personal library, collections, and daily "watches" that surface new papers matching a saved filter
- 25 tools total

Install is one command: `npx scholar-feed-mcp init`. It auto-detects your client (Claude Code, Cursor, Claude Desktop, and others) and writes the config.

Honest about the architecture: this is a thin stdio MCP client. The corpus, embeddings, and ranking live behind a hosted API, not on your machine, so it is not a fully local setup. The model you point it at is yours, local or not; this just feeds it papers. You can use it anonymously (100 calls/day, no account) or with a free key for 1,000/day.

MIT licensed. Repo: github.com/YGao2005/scholar-feed-mcp

Happy to answer anything, and genuinely want feedback on the tool design (what is missing for your review workflow).

---

## Show HN

Keep the title plain. No superlatives, no exclamation points, no numbers-as-hype in the title. The first comment carries the backstory and the honest caveats.

**Title:**
Show HN: An MCP server that puts 600k arXiv papers inside Claude Code and Cursor

**URL:** https://github.com/YGao2005/scholar-feed-mcp

**First comment:**
Author here. I do a fair amount of literature review and was tired of switching between arXiv, Scholar, and my editor and losing the thread. This is an MCP server that gives an agent a research corpus to work from, so the search, citation tracing, and reading happen in the same session as the writing.

What it actually does: semantic and keyword search over 600,000+ CS/AI/ML papers from arXiv (indexed daily), with an LLM summary and a 0 to 1 novelty score on each paper so you can filter past incremental work. Beyond search there are tools to trace citations in both directions, extract the results/experiments section from a paper's LaTeX source, export BibTeX, search authors and co-author graphs, keep a library and collections, and set daily "watches" for new matches. 25 tools in total.

Install is `npx scholar-feed-mcp init`; it detects your client (Claude Code, Cursor, Claude Desktop, and the usual others) and writes the config. You can run it anonymously at 100 calls/day with no account, or use a free key for 1,000/day.

A few honest caveats: it is a thin stdio MCP client (TypeScript, MIT). The corpus, embeddings, and ranking live behind a hosted API, so it is not self-hosted, and coverage is CS/AI/ML, not all of arXiv. The novelty score is LLM-generated and imperfect; I treat it as a filter, not ground truth.

I would especially like feedback on the tool surface: whether the split between search, citations, full text, and watches matches how you actually do a review, and what is missing. Repo and full tool list are in the link.

---

## Discord #showcase blurb

For MCP, Claude, Cursor, and AI-dev servers. Short, friendly, link-forward. Lead with the GIF.

[demo GIF]

Built **Scholar Feed MCP**: an open-source MCP server that gives your agent 600,000+ CS/AI/ML papers to work from, right inside Claude Code, Cursor, or Claude Desktop.

Search and trace citations, pull full text from LaTeX, export BibTeX, and set daily watches for new work in your area. 25 tools total. Each paper has an LLM summary and a novelty score so you can filter for genuinely new results.

One command to try it, no account needed (anonymous is 100 calls/day):
`npx scholar-feed-mcp init`

MIT licensed, standard stdio server: github.com/YGao2005/scholar-feed-mcp

Feedback very welcome, especially on the tool design.

---

## Accuracy checklist (apply to every post before sending)

- [ ] Tool count is 25.
- [ ] Corpus is 600,000+ CS/AI/ML papers (not "all of arXiv," not a different number).
- [ ] Anonymous = 100/day, free key = 1,000/day. Never claim a key is required.
- [ ] Install command is exactly `npx scholar-feed-mcp init`.
- [ ] Only real tool capabilities named (search, citations, full text, BibTeX, authors, co-author graph, library, collections, watches, novelty score). No invented tools or parameters.
- [ ] No dashes used as punctuation. No hype words (unlock, seamless, revolutionary).
- [ ] Repo link correct: github.com/YGao2005/scholar-feed-mcp
- [ ] Hosted-API caveat stated on HN and Reddit (the local-first crowds will ask).
