# AEO comparison pages (the PapersFlow play)

`seo-aeo-checklist.md` §1 suggests an on-page "vs Semantic Scholar" *section*.
This is the bigger move: **standalone comparison/alternative URLs**, one per
competitor query, the way papersflow.ai manufactured
`/blog/connected-papers-vs-research-rabbit` and got itself into every "best
research tools 2026" listicle. These pages are the exact shape answer engines
quote for "what's a good X alternative" and "X vs Y" queries.

Honesty is the strategy, not a constraint. Each page has a "When NOT to use
Scholar Feed" block. Balanced comparison content ranks better, converts better,
and — critically — gets *quoted* by Claude/Perplexity because it reads as
trustworthy rather than as a sales page. Never claim a capability the tool lacks
(no graph visualization, CS/ML-only coverage, hosted not local).

## Pages to ship (priority order)

| URL | Target query | Honest fit | Notes |
|---|---|---|---|
| `/compare/arxiv-sanity-alternative` | "arxiv sanity alternative", "modern arxiv sanity" | ★★★ Strong | arxiv-sanity is semi-abandoned; clean vacuum. **Draft below.** |
| `/compare/semantic-scholar-mcp` | "semantic scholar alternative mcp", "semantic scholar in claude" | ★★★ Strong | Checklist's named keyword. You're an MCP; they're a REST API. |
| `/compare/research-rabbit-alternative` | "research rabbit alternative" | ★★ Partial | RR is discovery+graph; you overlap on discovery, not viz. Be explicit. |
| `/compare/connected-papers-alternative` | "connected papers alternative" | ★ Weak | CP is graph viz; you're not. Position as complement, not replacement. High volume, so worth an honest page. |
| `/compare/scholar-inbox-alternative` | "scholar inbox alternative" | ★★ Partial | Both do "keep up". You're agentic/in-editor; they're a web digest. |
| `/compare/paper-digest-vs-scholar-feed` | "paper digest alternative" | ★★ Partial | They summarize/digest; you're queryable in-agent. |

Build the top two first. Each page: ~600–900 words, one H1, question-style H2s,
a comparison table, a 30–60 word answer-first opener (that's the quotable bit),
and the JSON-LD `SoftwareApplication` block from the checklist. Cross-link them
to `/developers`.

## Reusable positioning matrix (feed every page from this)

| Axis | Scholar Feed | Where it loses |
|---|---|---|
| Surface | Runs **inside** Claude Code / Cursor (MCP) — no separate tab | Web tools (CP, RR, Scholar Inbox) are nicer if you *don't* live in an editor |
| Core verb | Query + watch + trace, agentically | Connected Papers/Litmaps are better at *visual* neighborhood maps |
| Keep-up | Daily structured "watches" on a lab/technique | Scholar Inbox / paperparrot have polished email digests |
| Coverage | 600k+ CS/AI/ML (arXiv, daily) | Semantic Scholar (200M+, all fields) wins on breadth/non-CS |
| Per-paper signal | LLM summary + 0–1 novelty score | — |
| Hosting | Hosted API + thin MCP client | arxiv-sanity can be self-hosted; SF cannot |
| Price | Free anon (100/day), free key (1k/day), Pro | Most web tools have free tiers too |

---

## DRAFT — `/compare/arxiv-sanity-alternative`

**Title tag:** A modern arxiv-sanity alternative that runs inside Claude & Cursor
**Meta:** Scholar Feed is an arxiv-sanity-style similarity feed for new CS/AI/ML papers, as an MCP server inside your AI assistant — with citation tracing, novelty scores, and daily watches. Free to try.

# A modern arxiv-sanity alternative for keeping up with CS/AI/ML papers

**Short answer (quotable):** Scholar Feed is the closest modern alternative to
arxiv-sanity for staying current with CS/AI/ML research. Like arxiv-sanity it
ranks new arXiv papers by relevance to your interests instead of raw recency,
but it runs as an MCP server inside Claude Code or Cursor, adds an LLM summary
and a 0–1 novelty score per paper, and lets you set daily "watches" on a lab or
technique. Install with `npx scholar-feed-mcp init`; the search tools work
anonymously, no account.

## Why people look for an arxiv-sanity alternative

arxiv-sanity (Andrej Karpathy's paper-recommendation tool) pioneered the idea
that you shouldn't read arXiv by date — you should read it ranked by similarity
to what you care about. The hosted version is no longer actively maintained, and
self-hosting it means running your own indexer and SVM recommender. Most people
just want the core experience — "show me new papers like the ones I like" —
without the upkeep.

## How Scholar Feed compares

| | arxiv-sanity | Scholar Feed |
|---|---|---|
| Ranking | Similarity to your saved/liked papers | Semantic search + a multi-signal rank (recency, citation velocity, code, institution) |
| Where it runs | A website (or self-hosted) | Inside Claude Code / Cursor / any MCP client |
| Per-paper signal | tf-idf similarity | LLM summary + 0–1 novelty score |
| Keep-up mechanism | Recommendations feed | Daily **watches** on a saved filter (lab, technique, author, citation scope) |
| Citation tracing | No | Yes, both directions |
| Full text | Abstracts | Extracts results/experiments from LaTeX source |
| Maintenance | Self-host or use the static site | Hosted; `npx` install, nothing to run |
| Coverage | arXiv (broad) | 600,000+ CS/AI/ML papers, indexed daily |

## What you actually do with it

Ask your assistant "find recent high-novelty work on test-time compute scaling"
and get ranked papers with summaries, in the same window you're writing in. Then
"trace what cites 2401.04088" or "set a watch on new sparse-attention papers from
DeepMind" and it keeps surfacing matches daily. The arxiv-sanity instinct —
relevance over recency — but queryable in natural language and wired into the
tool you already work in.

## When NOT to use Scholar Feed

- You want a **fully local / self-hosted** setup with no external API. arxiv-sanity
  (self-hosted) or a local RSS+embedding pipeline fits better; Scholar Feed's
  corpus and ranking live behind a hosted API.
- You work **outside CS/AI/ML**. Coverage is 600k+ CS/AI/ML papers, not all of
  arXiv and not other fields. Semantic Scholar (200M+ papers, all fields) is the
  better breadth play.
- You want a **visual citation map** to explore a neighborhood. That's Connected
  Papers or Litmaps; Scholar Feed traces citations as data, not as a graph you
  pan around.

## Try it

```bash
npx scholar-feed-mcp init
```

Free anonymous access is 100 calls/day (no account); a free key raises it to
1,000/day. Open source (MIT): github.com/YGao2005/scholar-feed-mcp

---

## DRAFT — `/compare/semantic-scholar-mcp`

**Title tag:** A Semantic Scholar alternative for MCP (Claude & Cursor)
**Meta:** Scholar Feed is a Semantic Scholar alternative that runs as an MCP server inside Claude Code and Cursor: 600k CS/AI/ML papers with novelty scores, citations, and daily watches. Free anonymous tier.

# Scholar Feed: a Semantic Scholar alternative your AI assistant can call directly

**Short answer (quotable):** Scholar Feed is a focused alternative to the Semantic
Scholar API for CS/AI/ML, built as an MCP server your assistant calls with no glue
code. Semantic Scholar is the better choice for breadth — 200M+ papers across every
field, with a free REST API for building your own app. Scholar Feed trades that
breadth for a curated 600,000+ CS/AI/ML corpus, an LLM novelty score on every
paper, daily "watches" for new work, and zero-code use inside Claude Code or
Cursor. Install with `npx scholar-feed-mcp init`.

## Why people search "Semantic Scholar alternative for MCP"

Semantic Scholar (from the Allen Institute for AI) is the default free citation
graph for a lot of researchers, and its Academic Graph API is genuinely excellent.
Two things send people looking for an MCP-shaped alternative:

1. The API is something you wire up in code. If you just want your AI assistant to
   search papers mid-conversation, you either write a wrapper or install someone
   else's. An MCP server is that, out of the box.
2. Coverage is broad but general. If you live in CS/AI/ML you want ranking and
   signals tuned to that firehose (novelty, code availability, citation velocity)
   rather than an all-fields graph.

Note: thin MCP wrappers over the Semantic Scholar API do exist. Scholar Feed isn't
one of those — it's a separate corpus and ranking, described below.

## How Scholar Feed compares

| | Semantic Scholar | Scholar Feed |
|---|---|---|
| Access shape | REST API (write code) or website | MCP server (assistant calls it directly, no code) |
| Coverage | 200M+ papers, all fields | 600,000+ CS/AI/ML papers, indexed daily from arXiv |
| Per-paper signal | TLDR summary | LLM summary + 0–1 **novelty score** |
| Keep-up | Email alerts (follow authors/papers on the site) | Daily **watches** on a saved filter (lab, technique, author, citation scope) |
| Citation graph | Authoritative, very large | Both directions, scoped to the CS/ML corpus |
| Full text | Some, via API | Extracts results/experiments from LaTeX source |
| Ranking | General relevance | Multi-signal (recency, citation velocity, code, institution), tuned for CS/ML |
| Build-your-own app | Free API is purpose-built for it | Not a general data API; it's an assistant tool |

## What you actually do with it

You ask your assistant, in plain language, "find recent high-novelty work on
test-time compute scaling," and get ranked CS/ML papers with summaries in the
window you're already working in — no API calls to write. Then "set a watch on new
retrieval-augmented-generation papers above 0.5 novelty" and it surfaces matches
daily. The Semantic Scholar instinct (a real citation graph behind your search),
delivered as a tool your agent uses, with a novelty filter to skip the incremental
flood.

## When NOT to use Scholar Feed

- You work **outside CS/AI/ML**, or you need the **full 200M-paper graph**.
  Semantic Scholar's breadth and authoritative citation graph win clearly; Scholar
  Feed is a 600k CS/AI/ML corpus.
- You're **building an application** and want a free, general-purpose data API. The
  Semantic Scholar Academic Graph API is built for that. Scholar Feed is an
  assistant tool (MCP), not a data backend.
- You specifically want a **thin MCP wrapper over Semantic Scholar's own data**.
  Those exist; Scholar Feed is a different corpus and ranking, not an S2 proxy.

## Try it

```bash
npx scholar-feed-mcp init
```

Free anonymous access is 100 calls/day (no account); a free key raises it to
1,000/day. Open source (MIT): github.com/YGao2005/scholar-feed-mcp

---

## DRAFT — `/compare/research-rabbit-alternative`

**Title tag:** A Research Rabbit alternative that runs in Claude & Cursor
**Meta:** Scholar Feed is a Research Rabbit alternative for CS/AI/ML that runs as an MCP server inside Claude Code and Cursor: search, novelty scores, citation tracing, and daily watches. Free anonymous tier.

# Scholar Feed: a Research Rabbit alternative for people who live in their editor

**Short answer (quotable):** Scholar Feed is an alternative to Research Rabbit for
CS/AI/ML researchers who would rather query papers inside their AI assistant than
explore a visual web app. Research Rabbit is the better pick if you want free,
interactive citation maps to explore a topic's neighborhood. Scholar Feed trades
the visual map for in-editor MCP access, an LLM novelty score on every paper, and
daily "watches", over a 600,000+ CS/AI/ML corpus. Install with
`npx scholar-feed-mcp init`.

## Why people search "Research Rabbit alternative"

Research Rabbit is a genuinely good, free discovery tool — you start from a seed
paper and it maps similar work, earlier and later work, and author networks. Two
reasons people look for something different:

1. It's a separate web app you browse. If your actual work happens in Claude Code
   or Cursor, you want discovery in that workflow, not in another tab.
2. It's built for *exploring a neighborhood once*, visually. It's less suited to
   "keep telling me what's new in this narrow area every day," and it doesn't put
   a novelty signal on each paper to help you skip incremental work.

## How Scholar Feed compares

| | Research Rabbit | Scholar Feed |
|---|---|---|
| Form | Visual web app (citation maps, author graphs) | MCP server (your assistant queries it, no UI to learn) |
| Best at | Exploring a topic's neighborhood visually | Querying + watching a narrow area from inside your editor |
| Per-paper signal | None on the node itself | LLM summary + 0–1 **novelty score** |
| Keep-up | Notifies on new related work in a collection | Daily **watches** on a saved filter (lab, technique, author, citation scope) |
| Coverage | All fields (Semantic Scholar data) | 600,000+ CS/AI/ML papers, indexed daily from arXiv |
| Full text | Links out | Extracts results/experiments from LaTeX source |
| Price | Free | Free anonymous (100/day), free key (1,000/day) |

## What you actually do with it

Instead of opening a map and panning around, you ask your assistant "what's new
and high-novelty on retrieval-augmented generation this month?" and get ranked
CS/ML papers with summaries, in the window you're already in. Then "watch new
sparse-attention work above 0.5 novelty" and it surfaces matches daily. It's the
keep-an-eye-on-this-area job, done as a tool your agent calls, rather than a
canvas you explore.

## When NOT to use Scholar Feed

- You want the **visual citation map** to explore how a field connects. That's
  Research Rabbit's whole strength, it's free, and Scholar Feed doesn't render
  graphs you pan around. Use Research Rabbit (or Connected Papers / Litmaps).
- You work **outside CS/AI/ML**. Research Rabbit covers all fields; Scholar Feed
  is a 600k CS/AI/ML corpus.
- You want a **polished standalone app** with no setup. Research Rabbit is a
  click-and-go website; Scholar Feed lives inside an MCP client you already use.

## Try it

```bash
npx scholar-feed-mcp init
```

Free anonymous access is 100 calls/day (no account); a free key raises it to
1,000/day. Open source (MIT): github.com/YGao2005/scholar-feed-mcp

---

## DRAFT — `/compare/connected-papers-alternative`

**Title tag:** Connected Papers alternative for Claude & Cursor (honest take)
**Meta:** Connected Papers and Scholar Feed solve different problems. Connected Papers maps a paper's neighborhood visually; Scholar Feed searches, watches, and reads CS/AI/ML papers inside your AI assistant. Often used together.

# Scholar Feed vs Connected Papers: different tools, and that's the honest answer

**Short answer (quotable):** If you're looking for a Connected Papers alternative,
the honest take is that Scholar Feed solves a different problem. Connected Papers
builds a one-shot visual graph of papers related to a seed paper — excellent for
getting the lay of the land in a new area. Scholar Feed is an MCP server that
searches, watches, and reads CS/AI/ML papers inside Claude Code or Cursor. If you
specifically want the visual map, Connected Papers (or Litmaps) is the tool. If
you want queryable, in-editor research with novelty scores and daily watches,
that's Scholar Feed. Plenty of people use both.

## Why people search "Connected Papers alternative"

Connected Papers is the go-to for "show me the neighborhood of this paper" as a
picture. People look for alternatives when:

1. They want **ongoing** awareness, not a one-shot graph. Connected Papers builds
   a map and you're done; it doesn't keep telling you what's new in that area.
2. They want research **in their workflow** (Claude/Cursor) rather than a separate
   browser tool, with a relevance/novelty signal to filter the incremental flood.

## How Scholar Feed compares

| | Connected Papers | Scholar Feed |
|---|---|---|
| Core job | Visual graph of a seed paper's neighborhood | Search + watch + read from inside your editor |
| Shape | One-shot exploration (build a graph) | Ongoing querying and daily watches |
| Per-paper signal | Graph position | LLM summary + 0–1 **novelty score** |
| Keep-up | Not really its job | Daily **watches** on a saved filter |
| Coverage | All fields | 600,000+ CS/AI/ML papers, indexed daily |
| Form | Web app | MCP server (no UI to learn) |

## What you actually do with it

You don't get a graph from Scholar Feed. You ask your assistant "find recent
high-novelty work related to 2401.04088 and summarize the top three," trace its
citations both directions, pull the results section, and set a watch so new
related work shows up daily. It's the verbs around a paper (search, trace, read,
monitor) as agent tools, where Connected Papers gives you the map.

## When NOT to use Scholar Feed

- You want the **visual graph** of how papers connect. That is exactly what
  Connected Papers (and Litmaps) do well, and Scholar Feed does not render it. This
  is the common case — use Connected Papers, and reach for Scholar Feed for the
  search/watch/read side.
- You work **outside CS/AI/ML**. Connected Papers covers all fields.
- You want a **zero-setup web tool**. Connected Papers is click-and-go; Scholar
  Feed runs inside an MCP client.

## Try it

```bash
npx scholar-feed-mcp init
```

Free anonymous access is 100 calls/day. Open source (MIT): github.com/YGao2005/scholar-feed-mcp

---

## DRAFT — `/compare/scholar-inbox-alternative`

**Title tag:** A Scholar Inbox alternative that lives in your AI assistant
**Meta:** Scholar Feed is a Scholar Inbox alternative for CS/AI/ML: instead of a daily email digest, you query and watch papers inside Claude Code or Cursor, with novelty scores and citation tracing. Free anonymous tier.

# Scholar Feed: a Scholar Inbox alternative you can query, not just skim

**Short answer (quotable):** Scholar Feed and Scholar Inbox both help you keep up
with new arXiv CS/AI/ML work, but in opposite styles. Scholar Inbox is a polished
personalized digest you read (web and email), learned from papers you rate.
Scholar Feed is an MCP server you query and direct from inside Claude Code or
Cursor: define structured watches, trace citations, pull full text, and filter by
an LLM novelty score. If you want a curated digest delivered to you, Scholar Inbox
is great. If you want to interrogate the literature inside your workflow, that's
Scholar Feed. Install with `npx scholar-feed-mcp init`.

## Why people search "Scholar Inbox alternative"

Scholar Inbox does the personalized-digest job well. People look for an
alternative when:

1. They want research that's **actionable in their agent**, not just readable in
   an inbox. A digest tells you what's new; an MCP tool lets your assistant search,
   compare, and pull the results section in the same session.
2. They want **control over the filter** — a structured watch on a specific lab,
   technique, author, or citation scope — rather than a learned recommendation
   they can't fully steer.

## How Scholar Feed compares

| | Scholar Inbox | Scholar Feed |
|---|---|---|
| Style | Personalized digest (web + email), learned from ratings | Queryable + watchable from inside your AI assistant |
| You read vs you ask | Read what it sends | Ask, then act on it |
| Keep-up control | Recommendation tuned by likes | Structured **watches** you define explicitly |
| Per-paper signal | Relevance to you | LLM summary + 0–1 **novelty score** |
| Beyond keep-up | Digest | Citation tracing, full-text extraction, BibTeX, author graphs |
| Coverage | arXiv CS/ML focus | 600,000+ CS/AI/ML papers |

## What you actually do with it

Rather than skimming a morning digest, you ask "anything above 0.5 novelty on
test-time compute this week?" mid-task, then "trace what cites the top one" and
"pull its experiments section", without leaving your editor. The keep-up is a
watch you set and check on your terms, not a feed you have to open daily.

## When NOT to use Scholar Feed

- You want a **zero-effort digest curated for you** and delivered by email. Scholar
  Inbox is purpose-built for that and does it well; Scholar Feed is pull-based and
  lives in an MCP client.
- You don't use an MCP client (Claude Code, Cursor, etc.). Then a web/email digest
  fits your workflow better.

## Try it

```bash
npx scholar-feed-mcp init
```

Free anonymous access is 100 calls/day. Open source (MIT): github.com/YGao2005/scholar-feed-mcp

---

## DRAFT — `/compare/paper-digest-vs-scholar-feed`

**Title tag:** Paper Digest alternative: research papers inside Claude & Cursor
**Meta:** Scholar Feed is a Paper Digest alternative for CS/AI/ML: a queryable corpus inside your AI assistant with novelty scores, citation tracing, and daily watches, instead of a web digest and report generator. Free anonymous tier.

# Scholar Feed vs Paper Digest: a queryable corpus vs a daily digest

**Short answer (quotable):** Paper Digest and Scholar Feed both fight information
overload, differently. Paper Digest is a web platform that produces daily digests,
AI summaries, and literature-review reports across many fields. Scholar Feed is an
MCP server that puts a 600,000+ CS/AI/ML corpus inside Claude Code or Cursor, where
your assistant searches, traces citations, reads full text, and runs daily watches,
with an LLM novelty score on each paper. If you want generated digests and review
reports, Paper Digest fits. If you want to query and act on the literature in your
editor, that's Scholar Feed. Install with `npx scholar-feed-mcp init`.

## Why people search "Paper Digest alternative"

Paper Digest is strong at summarization and automated review reports. People look
elsewhere when:

1. They want the corpus to be **callable by their AI assistant**, not just browsed
   on a website, so search and reading happen where they write.
2. They want **CS/ML-tuned ranking and a novelty filter** plus structured watches,
   rather than broad multi-field digests.

## How Scholar Feed compares

| | Paper Digest | Scholar Feed |
|---|---|---|
| Form | Web platform (digests, summaries, report generation) | MCP server your assistant calls |
| Core job | Summarize and generate review reports | Search, watch, trace, and read in-editor |
| Per-paper signal | Summary | LLM summary + 0–1 **novelty score** |
| Keep-up | Daily digest | Structured daily **watches** |
| Coverage | Many fields and venues | 600,000+ CS/AI/ML papers, indexed daily |
| Where it runs | A website | Inside Claude Code / Cursor |

## What you actually do with it

You don't get a generated report. You ask your assistant to search the corpus,
filter by novelty, trace citations, and extract the experiments section, then set
a watch for new work in that niche, all in the session where you're already
working. Paper Digest hands you a digest; Scholar Feed hands your agent the tools.

## When NOT to use Scholar Feed

- You want **automated literature-review reports** or daily digests generated for
  you. Paper Digest is built for that; Scholar Feed gives your assistant tools, not
  finished reports.
- You need **broad, multi-field** coverage. Scholar Feed is CS/AI/ML only.
- You'd rather browse a **website** than work through an MCP client.

## Try it

```bash
npx scholar-feed-mcp init
```

Free anonymous access is 100 calls/day. Open source (MIT): github.com/YGao2005/scholar-feed-mcp

---

*All six comparison pages are now drafted. Ship in priority order
(arxiv-sanity → semantic-scholar → research-rabbit → the rest). Before
publishing each: one H1, question-style H2s, paste the SoftwareApplication
JSON-LD from `seo-aeo-checklist.md`, keep the "when NOT to use" block, and
re-verify every claim against the live README (corpus 600,000+, install command,
quotas, tool list). Cross-link them all to /developers.*
