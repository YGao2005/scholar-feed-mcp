# Developers page draft: scholarfeed.org/developers

Status: draft copy for the public developers/landing page. Targets the keywords
"arxiv mcp", "research papers in Claude Code", "literature review mcp",
"semantic scholar alternative mcp", and "mcp server for citations". All facts
here are pulled from the repo README. Verify version numbers and limits against
the live README before publishing.

Page route: `https://www.scholarfeed.org/developers`

----------------------------------------------------------------------

## Page title (browser tab / SEO title)

Scholar Feed MCP: arXiv research papers in Claude Code and Cursor

## Meta description

An MCP server that searches 600,000+ CS/AI/ML arXiv papers, traces citations,
and pulls full text without leaving Claude Code or Cursor. Install with
`npx scholar-feed-mcp init`. No API key required.

----------------------------------------------------------------------

## H1

Scholar Feed MCP server: search arXiv research papers inside Claude Code and Cursor

## Lead paragraph (answer-first, ~50 words)

Scholar Feed is an open-source MCP server that gives an AI assistant access to
600,000+ computer science, AI, and machine learning papers from arXiv. Run a
literature review inside Claude Code or Cursor: search by topic, trace
citations, read full text, and export BibTeX in one session. Install with one
command, no API key required.

## Install (put this above the fold, copy-button on the code block)

```bash
npx scholar-feed-mcp init
```

The wizard detects your client (Claude Code, Cursor, or Claude Desktop), writes
the config, and verifies the connection. Anonymous access gives you 100 calls a
day. A free API key raises that to 1,000 a day.

Claude Code users can skip the wizard:

```bash
claude mcp add scholar-feed -- npx -y scholar-feed-mcp
```

----------------------------------------------------------------------

## H2: What is Scholar Feed MCP?

Scholar Feed MCP is a stdio MCP (Model Context Protocol) server, written in
TypeScript and published on npm as `scholar-feed-mcp`. It connects any
MCP-compatible client to the Scholar Feed corpus: 600,000+ CS/AI/ML papers
indexed daily from arXiv. Every paper carries an LLM-generated summary and a
novelty score from 0.0 to 1.0, plus citation counts, code links, and a
multi-signal rank score (recency, citation velocity, institutional reputation,
code availability).

It is built for one job: running a literature review where you already work. No
browser tabs, no copy-paste between a search engine and your editor.

## H2: Why use an MCP server instead of a web search?

A web search returns links you then have to open, read, and summarize by hand.
An MCP server returns structured paper data directly to your AI assistant, so
the assistant can chain steps: find papers, pull the ones that cite a key
result, extract the experiments section, and draft a related-work paragraph,
all in one conversation. Scholar Feed also ranks and scores papers, which a raw
arXiv or Google Scholar query does not.

## H2: How is this different from the Semantic Scholar API?

Semantic Scholar is a citation database with a REST API you call from code.
Scholar Feed is an MCP server: your AI assistant calls it directly, with no glue
code to write. The Scholar Feed corpus is focused on CS/AI/ML arXiv papers and
adds an LLM-generated summary and novelty score per paper, plus full-text
extraction from LaTeX source. If you want a citation graph your agent can
traverse from inside Claude Code or Cursor, Scholar Feed is built for that.

## H2: Tool overview

Scholar Feed exposes 25 tools. The most used ones:

**Search and discovery**

- `search_papers`: semantic and keyword search with filters. Also does
  similar-paper discovery, citation-scoped search, and trending.
- `get_paper`: full paper details by arXiv ID. Handles batch lookup and BibTeX
  export.
- `get_citations`: the citation graph, outgoing references or incoming
  citations.
- `fetch_fulltext`: extracts results and experiments from the LaTeX source.

**Authors**

- `find_author`: find researchers by topic or name, or fetch a profile by ID.
- `co_author_graph`: the co-authorship neighborhood for an author.

**Research orientation**

- `get_field_orientation`: top papers, subfields, and open problems for a
  research area.
- `get_foundational_lineage`: the foundational work behind a paper's niche, via
  the citation graph.
- `embed_text`: a 768-dimension embedding for custom similarity (Pro only).

**Library, collections, and watches (need a free API key)**

- `save_paper`, `unsave_paper`, `like_paper`, `list_library`: bookmark and
  calibrate.
- `list_collections`, `create_collection`, `add_to_collection`,
  `remove_from_collection`: organize saved papers.
- `create_watch`, `list_watches`, `check_watches`, `update_watch`,
  `preview_watch`, `delete_watch`: standing saved searches evaluated daily.
- `find_gaps`: foundational and frontier work you have not saved yet (Pro).
- `ask_library`: a cited synthesis grounded only in papers you have saved.

The full tool reference, with parameters, is in the
[README on GitHub](https://github.com/YGao2005/scholar-feed-mcp).

## H2: What can I ask it to do?

- Technology scouting: "What novel research on retrieval-augmented generation
  was published this month?"
- Literature review: "Find papers similar to 2401.04088 and export their
  BibTeX."
- Trend monitoring: "What's trending in cs.CV this week? Summarize the top 3."
- Author discovery: "Who are the top researchers working on efficient LLM
  inference?"
- Field orientation: "Give me an orientation report on sparse mixture-of-experts
  architectures."

## H2: Pricing and rate limits

Scholar Feed MCP is free to install and use. The API key (`SF_API_KEY`) is
optional and controls your daily call quota:

| Tier | Daily quota | Cost |
|------|-------------|------|
| Anonymous (no key) | 100 calls/day | Free |
| Free key | 1,000 calls/day | Free |
| Pro | 10,000 calls/day | Paid |

A few tools have their own limits: `ask_library` is 1/month free then 200/day on
Pro; `find_gaps` and `embed_text` are Pro only. Get a free key at
[scholarfeed.org/settings](https://www.scholarfeed.org/settings).

----------------------------------------------------------------------

## H2: FAQ

(These questions map 1:1 to the FAQPage JSON-LD in seo-aeo-checklist.md. Keep
the answers in sync.)

### What is the Scholar Feed MCP server?

Scholar Feed MCP is an open-source stdio MCP server that lets an AI assistant
search 600,000+ CS/AI/ML research papers from arXiv, trace citations, and read
full text. It runs inside Claude Code, Cursor, Claude Desktop, and other
MCP-compatible clients.

### How do I install the Scholar Feed MCP server?

Run `npx scholar-feed-mcp init`. The wizard detects your MCP client, writes the
config, and verifies the connection. Claude Code users can instead run
`claude mcp add scholar-feed -- npx -y scholar-feed-mcp`.

### Do I need an API key?

No. Anonymous access gives you 100 calls a day, enough for a typical research
session. A free API key raises that to 1,000 calls a day, and Pro raises it to
10,000. The core search and read tools work without any key.

### Which clients does it work with?

Any MCP-compatible client. The repo has setup blocks for Claude Code, Cursor,
Claude Desktop, Windsurf, Cline, Roo Code, Gemini CLI, LM Studio, JetBrains,
VS Code (GitHub Copilot), Zed, and Continue.

### Is Scholar Feed a good Semantic Scholar alternative for MCP?

Yes, if you want a CS/AI/ML literature tool your AI assistant can call directly.
Unlike a REST API you wire up in code, Scholar Feed is an MCP server your
assistant uses with no glue code. It adds an LLM summary and novelty score to
each paper and extracts full text from LaTeX source.

### Can it trace citations and export BibTeX?

Yes. `get_citations` returns the citation graph (incoming citations or outgoing
references) for any arXiv paper. `get_paper` exports BibTeX, including batch
lookups, with `format: "bibtex"`.

### What papers are in the corpus?

600,000+ CS/AI/ML papers indexed daily from arXiv. Each paper has an
LLM-generated summary, a novelty score from 0.0 to 1.0, citation counts, code
links where available, and a multi-signal rank score.

### Is it open source?

Yes, MIT licensed. The source is at
[github.com/YGao2005/scholar-feed-mcp](https://github.com/YGao2005/scholar-feed-mcp)
and the package is on npm as
[scholar-feed-mcp](https://www.npmjs.com/package/scholar-feed-mcp).

----------------------------------------------------------------------

## Internal links to place on this page

- Link to the npm package: https://www.npmjs.com/package/scholar-feed-mcp
- Link to the GitHub repo: https://github.com/YGao2005/scholar-feed-mcp
- Link to settings/key page: https://www.scholarfeed.org/settings
- Link to the skills page: https://www.scholarfeed.org/skills
- Link back to the homepage: https://www.scholarfeed.org

## Suggested H1/H2 keyword coverage map

- "arxiv mcp" -> H1, lead paragraph, "What is Scholar Feed MCP?"
- "research papers in Claude Code" -> page title, H1, lead, install section
- "literature review mcp" -> lead paragraph, "What can I ask it to do?"
- "semantic scholar alternative mcp" -> "How is this different from the
  Semantic Scholar API?", FAQ
- "mcp server for citations" -> "Can it trace citations and export BibTeX?",
  tool overview
