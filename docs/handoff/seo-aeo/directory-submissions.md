# Directory submissions (presence-audited worklist)

The actionable extension of `seo-aeo-checklist.md` §4. That section says "get
listed in registries"; this file says **which ones already have you, which
don't, and the exact copy to paste** — plus the non-MCP research-tool
directories the checklist omits, which are what rank for the generic queries
real users type ("best research paper tool", "Connected Papers alternative").

Why this matters more than it looks: when someone asks ChatGPT/Claude/Perplexity
"what's a good MCP server for arXiv papers" or "alternatives to Research Rabbit",
the model retrieves **these directories**, not your homepage. A name-search finds
you on Glama; a *generic* search finds your competitors. Closing that gap is a
form-filling afternoon, not a campaign.

## Presence audit (verified live 2026-06-04)

> **Lesson that reorders everything below:** the official MCP Registry is the
> source of truth, but downstream propagation is NOT reliable. Scholar Feed is
> correctly in the registry, yet PulseMCP shows "No servers found" for it. So
> "we're in the registry" ≠ "we're in the directories." Fix the registry entry
> (it's the upstream), then **still manually submit** to the curated directories
> that don't auto-ingest.

| Directory | Ranks for | Status (verified) | Action |
|---|---|---|---|
| Official MCP Registry | upstream for many directories | ✅ Listed as `io.github.YGao2005/scholar-feed-mcp` | **Fix the description (done in server.json, needs republish) — see below. Highest leverage.** |
| Glama (glama.ai/mcp) | name lookups | ✅ Listed | Verify it picked up the new description after republish |
| mcp.so | largest community directory | ✅ Listed (`mcp.so/server/scholar-feed-mcp/YGao2005`, 200 OK) | Eyeball the live page; confirm description |
| **mcpservers.org** (punkpeye/awesome-mcp-servers) | "best mcp servers", "mcp for research" — **heavily AI-cited** | ⏳ **PR #7329 OPEN, not merged** | Backlog closes many research PRs (#5377/#3514/#1942/#3614 all closed). Verify the PR matches CONTRIBUTING format exactly (alphabetical, exact line shape), then ping. May not land — don't count on it. |
| **PulseMCP** (pulsemcp.com) | "mcp server" discovery | ❌ **Absent despite registry** | Registry auto-ingest didn't work → use `/submit` form directly. Competitor `afrise-academic-search` is here. |
| **lobehub.com/mcp** | "mcp server" + LobeChat users | ❓ Unchecked (assume absent) | Submit (PR/form) |
| **Smithery** (smithery.ai) | one-click MCP install | ⏳ Built, not submitted | Submit the `smithery.yaml` on PR #13 |
| **mcpmarket.com** | "mcp market" discovery | ❓ Unchecked | Submit |
| **AlternativeTo** (alternativeto.net) | "Connected Papers alternative", "Research Rabbit alternative" | ❌ Absent | Add as an alternative to Connected Papers, Research Rabbit, Semantic Scholar, Elicit |
| **There's An AI For That** (theresanaiforthat.com) | "AI tool for research papers" — huge AEO surface | ❌ Absent | Submit (paid fast-track optional; free queue works) |
| **Futurepedia** / **Toolify.ai** / **SaaSHub** | "best AI research tools" roundups | ❌ Absent | Submit to each (low effort, long tail) |

### #1 action — fix the registry description (propagates to ingesters)
The published description was *"Search 600,000+ CS/AI/ML papers with citation
graph, full text, embeddings, and BibTeX."* — it omits the two differentiators
(**daily watches**, **novelty scores**). `server.json` is now updated to (≤100
char registry limit):

> `600,000+ CS/AI/ML papers in your AI assistant: search, novelty scores, citations, daily watches.`

This only goes live on **republish** to the registry (the same tag-triggered
OIDC / `mcp-publisher` flow used for releases; a republish may want a version
bump). Do that, then the registry → Glama → other ingesters carry the better
copy.

Priority order (revised): **fix+republish registry description → PulseMCP /submit
→ verify/ping awesome-mcp PR #7329 → lobehub → Smithery → AlternativeTo →
There's An AI For That → long tail.** The registry already covers the
auto-propagating slice; spend manual effort only where propagation demonstrably
fails (PulseMCP) and on the non-MCP research directories.

## Paste-ready copy

Reuse verbatim so every listing agrees with the README and the JSON-LD (that
cross-source consistency is itself an AEO trust signal — see checklist §4).

**Name:** Scholar Feed MCP Server
**Slug / npm:** `scholar-feed-mcp`
**Repo:** https://github.com/YGao2005/scholar-feed-mcp
**Homepage:** https://www.scholarfeed.org/developers
**License:** MIT · **Transport:** stdio · **Auth:** optional API key (anonymous works)

**One-liner (≤80 chars):**
> 600k+ arXiv CS/AI/ML papers inside Claude Code & Cursor — search, citations, watches.

**Tagline (≤160 chars, for AlternativeTo / TAAFT):**
> An MCP server that gives your AI assistant 600,000+ CS/AI/ML research papers from arXiv: semantic search, citation tracing, full text, BibTeX, and daily watches.

**Short description (~50 words, for registries):**
> Scholar Feed is an open-source stdio MCP server that connects any MCP client (Claude Code, Cursor, Claude Desktop, and others) to 600,000+ CS/AI/ML papers indexed daily from arXiv. Each paper has an LLM summary and a 0–1 novelty score. 25 tools: search, citations, full text, BibTeX, authors, library, and daily watches. Free anonymous tier (100 calls/day).

**Long description (~110 words, for mcp.so / lobehub / TAAFT):**
> Scholar Feed puts a research corpus inside the AI assistant you already use, so literature review happens in the same session as your writing or code. Semantic and keyword search over 600,000+ CS/AI/ML arXiv papers (indexed daily), each with an LLM-generated summary and a 0–1 novelty score so you can filter past incremental work. Beyond search: trace citations both directions, extract results/experiments from LaTeX source, export BibTeX, search authors and co-author graphs, keep a library and collections, and set daily "watches" that surface new papers matching a saved filter. Install with `npx scholar-feed-mcp init`. Open source (MIT), 25 tools, free anonymous access at 100 calls/day.

**Categories / tags:** `research`, `academic`, `arxiv`, `literature-review`,
`citations`, `papers`, `machine-learning`, `developer-tools`

**Install:** `npx scholar-feed-mcp init`

**Standard config block** (for directories that show one):
```json
{
  "mcpServers": {
    "scholar-feed": { "command": "npx", "args": ["-y", "scholar-feed-mcp@latest"] }
  }
}
```

### AlternativeTo specifics
Add Scholar Feed as an alternative on these pages (one submission each):
- Connected Papers · Research Rabbit · Semantic Scholar · Elicit · Litmaps
- Pick tags: `Free`, `Open Source`, `Mac/Windows/Linux`, `AI`, `Command Line`
- Use the tagline above; the differentiator line that converts there is:
  *"Unlike the web tools, it runs inside your AI assistant (Claude/Cursor) so search + reading happen where you already work, and it adds an LLM novelty score per paper."*

## After listing
Re-run the checklist §4 "Measure" step in ~2 weeks: ask each assistant "what's a
good MCP server for arXiv papers" and "Connected Papers alternative that works in
Claude" and confirm Scholar Feed now surfaces. Perplexity reflects directory
changes in days; Claude/Google AI Overviews in a few weeks.
