# SEO + AEO checklist for scholarfeed.org

Concrete actions to rank for the target keywords and to get the MCP server
recommended by AI assistants and cited by answer engines. Ordered roughly by
impact-to-effort. JSON-LD blocks below are valid and factual; paste them as-is
(adjust only the noted placeholders). Validate every block in Google's Rich
Results Test and the Schema Markup Validator (validator.schema.org) before
shipping.

Target keywords: "arxiv mcp", "research papers in Claude Code",
"literature review mcp", "semantic scholar alternative mcp",
"mcp server for citations".

----------------------------------------------------------------------

## 1. On-page SEO

### Title and meta (developers page)

- Title tag (under ~60 chars):
  `Scholar Feed MCP: arXiv research papers in Claude Code and Cursor`
- Meta description (under ~155 chars):
  `An MCP server that searches 600,000+ CS/AI/ML arXiv papers, traces citations, and pulls full text in Claude Code or Cursor. Install: npx scholar-feed-mcp init.`
- Canonical tag: `<link rel="canonical" href="https://www.scholarfeed.org/developers" />`
- Open Graph: set `og:title`, `og:description`, `og:url`, and an `og:image`
  (use the existing logo asset, 1200x630 ideally).

### Headings

- Exactly one H1 per page. On /developers use:
  `Scholar Feed MCP server: search arXiv research papers inside Claude Code and Cursor`
- Use natural-language, question-style H2s. Answer engines extract from these.
  Use: "What is Scholar Feed MCP?", "How is this different from the Semantic
  Scholar API?", "Can it trace citations and export BibTeX?". These mirror the
  five target keywords.

### Answer-first content (this is what LLMs quote)

- Lead each section with a direct 30 to 60 word answer in the first one or two
  sentences, then add detail. AI engines pull a large share of citations from
  the opening portion of a page.
- Write standalone, quotable definition sentences. Example, already in the
  draft: "Scholar Feed MCP is a stdio MCP server, written in TypeScript and
  published on npm as scholar-feed-mcp, that connects any MCP-compatible client
  to 600,000+ CS/AI/ML papers indexed daily from arXiv."
- Keep the concrete number (600,000+), the install command, and the daily
  quotas (100 / 1,000 / 10,000) in plain text near the top. Numbers and
  specifics raise citation rate.
- Put the install command (`npx scholar-feed-mcp init`) in a real `<code>` block
  above the fold, with a copy button.

### Internal links

- Link /developers from the homepage nav and footer.
- Cross-link /developers <-> /skills <-> /settings.
- Link out to the GitHub repo and the npm package (these are authority signals
  and they back up the factual claims).
- Add the npm and GitHub links with descriptive anchor text ("scholar-feed-mcp
  on npm", "Scholar Feed MCP on GitHub"), not "click here".

### Technical

- Make sure /developers is server-rendered or pre-rendered so crawlers and AI
  fetchers get the full HTML, not an empty JS shell.
- Confirm robots.txt does not block AI crawlers you want citations from
  (GPTBot, PerplexityBot, ClaudeBot, Google-Extended). Decide deliberately;
  blocking them removes you from those answer engines.
- Add /developers and the homepage to sitemap.xml.
- Keep the page fast (Core Web Vitals); AI Overviews favor pages already
  ranking in the organic top 10.
- Refresh the page date when you update it. Freshness correlates strongly with
  AI citation for evaluation-stage queries.

----------------------------------------------------------------------

## 2. JSON-LD to paste

Place each block in a `<script type="application/ld+json">` tag in the page
`<head>` or end of `<body>`. The SoftwareApplication block goes on /developers
(and can also go on the homepage). The FAQPage block goes on /developers and
must match visible on-page FAQ text word for word.

### 2a. SoftwareApplication (put on /developers)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Scholar Feed MCP Server",
  "alternateName": "scholar-feed-mcp",
  "applicationCategory": "DeveloperApplication",
  "applicationSubCategory": "MCP Server",
  "operatingSystem": "macOS, Windows, Linux",
  "description": "An open-source MCP (Model Context Protocol) server that lets an AI assistant search 600,000+ CS/AI/ML research papers from arXiv, trace citations, read full text, and export BibTeX inside Claude Code, Cursor, and other MCP clients.",
  "url": "https://www.scholarfeed.org/developers",
  "downloadUrl": "https://www.npmjs.com/package/scholar-feed-mcp",
  "installUrl": "https://www.npmjs.com/package/scholar-feed-mcp",
  "softwareHelp": "https://github.com/YGao2005/scholar-feed-mcp",
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "softwareRequirements": "Node.js 18 or later",
  "featureList": [
    "Search 600,000+ CS/AI/ML arXiv papers by topic or keyword",
    "Trace the citation graph (incoming citations and outgoing references)",
    "Extract results and experiments from LaTeX full text",
    "Export BibTeX, including batch lookups",
    "Find authors and co-authorship neighborhoods",
    "Field orientation and foundational-lineage reports",
    "LLM-generated summary and novelty score per paper"
  ],
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "author": {
    "@type": "Organization",
    "name": "Scholar Feed",
    "url": "https://www.scholarfeed.org"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Scholar Feed",
    "url": "https://www.scholarfeed.org"
  }
}
</script>
```

Notes:
- No `aggregateRating`: do not add one until you have real, displayed reviews.
  Fabricated ratings are a structured-data policy violation.
- `price: "0"` is factual: the server is free to install and use; the optional
  key/Pro tier is a separate API offering, not the price of this application.
- If you publish a tagged version you want to advertise, you may add
  `"softwareVersion": "x.y.z"`, but keep it in sync with npm or omit it.

### 2b. FAQPage (put on /developers, must mirror visible FAQ)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is the Scholar Feed MCP server?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Scholar Feed MCP is an open-source stdio MCP server that lets an AI assistant search 600,000+ CS/AI/ML research papers from arXiv, trace citations, and read full text. It runs inside Claude Code, Cursor, Claude Desktop, and other MCP-compatible clients."
      }
    },
    {
      "@type": "Question",
      "name": "How do I install the Scholar Feed MCP server?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run npx scholar-feed-mcp init. The wizard detects your MCP client, writes the config, and verifies the connection. Claude Code users can instead run claude mcp add scholar-feed -- npx -y scholar-feed-mcp."
      }
    },
    {
      "@type": "Question",
      "name": "Do I need an API key?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Anonymous access gives you 100 calls a day, enough for a typical research session. A free API key raises that to 1,000 calls a day, and Pro raises it to 10,000. The core search and read tools work without any key."
      }
    },
    {
      "@type": "Question",
      "name": "Which clients does it work with?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Any MCP-compatible client. The repo has setup blocks for Claude Code, Cursor, Claude Desktop, Windsurf, Cline, Roo Code, Gemini CLI, LM Studio, JetBrains, VS Code (GitHub Copilot), Zed, and Continue."
      }
    },
    {
      "@type": "Question",
      "name": "Is Scholar Feed a good Semantic Scholar alternative for MCP?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, if you want a CS/AI/ML literature tool your AI assistant can call directly. Unlike a REST API you wire up in code, Scholar Feed is an MCP server your assistant uses with no glue code. It adds an LLM summary and novelty score to each paper and extracts full text from LaTeX source."
      }
    },
    {
      "@type": "Question",
      "name": "Can it trace citations and export BibTeX?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. get_citations returns the citation graph (incoming citations or outgoing references) for any arXiv paper. get_paper exports BibTeX, including batch lookups, with format: \"bibtex\"."
      }
    }
  ]
}
</script>
```

Notes:
- Every Question name and Answer text must appear in visible page copy. If you
  trim the on-page FAQ, trim this block to match.
- Google has narrowed FAQ rich-result eligibility, but FAQPage markup still
  helps AI engines extract clean question/answer pairs, which is the AEO win
  here.

### 2c. Optional: Organization (put on the homepage)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Scholar Feed",
  "url": "https://www.scholarfeed.org",
  "description": "Scholar Feed indexes 600,000+ CS/AI/ML research papers from arXiv with LLM-generated summaries and novelty scores, accessible through an open-source MCP server.",
  "sameAs": [
    "https://github.com/YGao2005/scholar-feed-mcp",
    "https://www.npmjs.com/package/scholar-feed-mcp"
  ]
}
</script>
```

----------------------------------------------------------------------

## 3. llms.txt

- Publish the file from llms.txt.draft (in this folder) at
  `https://www.scholarfeed.org/llms.txt` (site root, plain text, served as
  `text/plain` or `text/markdown`).
- Do not redirect it and do not gate it behind JS. It must return raw markdown
  on a direct GET.
- Optional: also publish `llms-full.txt` with the full README and developers
  page inlined, so agents can ingest everything in one fetch.
- Keep it short and curated: install, key, docs, repo. Update it whenever the
  install command, quotas, or tool count change. Agents and coding assistants
  cache it, so stale copies linger.
- Reference it from the page footer and from robots.txt as a comment
  (`# llms.txt: https://www.scholarfeed.org/llms.txt`) so it is discoverable.

----------------------------------------------------------------------

## 4. AEO and agent discoverability (get recommended by AI assistants)

### Get listed in MCP registries

List the same server in each, since each has a different audience. Prepare the
metadata once (name, transport=stdio, tool list, auth=optional API key,
homepage, repo, short description):

- Official MCP Registry (registry.modelcontextprotocol.io): publish via the OSS
  community registry. The repo already has a server.json; use it.
- GitHub MCP Registry: self-published servers in the OSS community registry flow
  through here automatically.
- mcp.so, glama.ai/mcp, smithery.ai: submit per each site's mechanism (form,
  self-register, or PR).
- punkpeye/awesome-mcp-servers on GitHub: open a PR adding scholar-feed under
  the research/academic category.

### Serve a discoverable server card

- Consider publishing the server descriptor at
  `https://www.scholarfeed.org/.well-known/mcp/server.json` (mirror the repo's
  server.json). Registries and crawlers use well-known URLs to auto-discover
  capabilities. Confirm the exact schema against the official registry docs
  before relying on auto-discovery.

### Content patterns that get cited

- Answer-first sections with question H2s (covered in section 1).
- Standalone definition sentences the model can quote without surrounding
  context.
- Comparison content: a short "Scholar Feed vs Semantic Scholar API" section
  targets "semantic scholar alternative mcp" and is exactly the shape answer
  engines quote for "what's a good X alternative" queries.
- Concrete numbers and the literal install command. Models prefer copy-pasteable
  specifics.
- Keep the README and the /developers page consistent. When an assistant reads
  the GitHub README, the package on npm, and the developers page and they all
  agree, that consistency is itself a trust signal.

### Off-site presence (where assistants and answer engines look)

- npm and GitHub are already strong; keep the README current (it is the primary
  source most assistants will quote).
- Get listed in third-party "best MCP servers" and "MCP servers for research"
  roundups; these are heavily cited by ChatGPT and Perplexity for
  recommendation queries.
- A short Show HN or dev.to / Reddit r/MachineLearning post with the install
  command creates fresh, datable, citable mentions.

### Measure

- Track AI referral traffic in analytics by referrer (chat.openai.com,
  perplexity.ai, gemini, claude).
- Periodically ask the major assistants the target queries ("what's a good MCP
  server for arXiv papers", "literature review MCP", "semantic scholar
  alternative MCP") and check whether Scholar Feed is recommended and described
  accurately. Re-run monthly; structural fixes show up in Perplexity in days and
  in Claude / Google AI Overviews in a few weeks.

----------------------------------------------------------------------

## 5. Pre-publish validation

- Run both JSON-LD blocks through validator.schema.org and Google's Rich Results
  Test. Expect zero errors.
- Confirm the FAQ JSON-LD text matches visible page text exactly.
- Confirm `https://www.scholarfeed.org/llms.txt` returns raw markdown (curl it).
- Re-check every fact against the live README before publishing: tool count
  (25), corpus size (600,000+), quotas (100 / 1,000 / 10,000), install command,
  and the Pro-only / metered tools.
