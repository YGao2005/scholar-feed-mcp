# Deep-research agent behavior: investigation + decision (2026-06-05)

Internal working doc. Not published to npm (`files` is `["build"]`).

## Verdict (one paragraph)

An AI agent handed the Scholar Feed MCP does **deep research** (citation-graph
traversal, foundational lineage, recency via `cited_by`, trending) **only when
the user's request is phrased with depth intent** ("trace the lineage", "what
supersedes X", "recent work that improves on Y", "prior art for Z"). When the
request is flat or confirmatory ("what optimizer should I use"), the agent does a
shallow search and answers from its own priors, and **no product surface we
built flips that** - not server instructions, not per-result affordances, not
structured graph data folded into the search payload, not an auto-triggered
skill. The binding lever is the user's prompt, which the product does not
control. This is not a failure: the core ICP (researchers doing literature
review) asks depth-shaped questions by nature, and for those the corpus
measurably beats a web-search-and-confirm loop. The lesson is to stop trying to
manufacture depth from a lazy query at the MCP/skill layer (unreachable) and to
invest where leverage exists: shaping the user's request (onboarding, examples,
positioning) and keeping the tool layer correct.

## The question

Does the MCP add value over plain web search, and if a real user just connects
it, will the agent use the differentiated surface (citation graph, lineage,
rising signal) or treat it as a search box? This came out of the
`sf-research-experiment` smoke run where the papers arm used only `search_papers`
(7 calls, 0 depth tools) and tied/lost to web.

## What we tried, and what happened

Four mechanism classes, all aimed at getting a passive agent to go deep:

| Mechanism | Form / authority | Result |
| --- | --- | --- |
| MCP server `instructions` | system-prompt text, always on | delivered (agent can quote it), ignored |
| Per-result "next steps" footer | tool-result text, point-of-use | delivered, ignored |
| `graph_context` enrichment | structured data folded into the search payload | delivered, ignored (causal test below) |
| Rewritten skill, auto-trigger | high-authority, agent-invoked | lost trigger to built-in `deep-research` on report-shaped queries |

The only things that produced the full deep loop:
- **Explicit user command** ("do not stop at one search; use lineage, then
  cited_by, then trending") -> full loop, competent.
- **A depth-shaped prompt** ("trace how the method evolved, what supersedes
  FlashAttention") -> full loop ran with **no skill at all**, tools called
  directly.

## Key evidence

- **Enrichment causal test (fresh-agent, control vs treatment):** with
  `SF_SEARCH_ENRICH` on, `graph_context` was delivered to the agent, but
  **0/14 and 0/23 enrichment-exclusive papers reached the answer**, and the
  agent never referenced the block in its reasoning (0 mentions). Recent ids that
  did appear came from the agent's own searches, not enrichment.
- **Skill auto-trigger (plain research prompt, both skills present):** 2/2 probes
  fired the **built-in** `deep-research`, not scholar-feed; 0 scholar-feed calls.
- **Depth-shaped prompt (no skill named):** ran `search -> get_foundational_lineage
  -> get_citations(cited_by) -> trending`, no skill invoked. The prompt drove it.

These reproduce across ~12 headless `claude -p` runs (sonnet-4-6). n is small per
condition, but the pattern is consistent and mechanistically coherent.

## `deep-research` is a Claude Code built-in, not a duplicate skill

It is compiled into the CLI binary (`claude-code@latest`, a single ~208MB
Mach-O), registered via `initBundledWorkflows` as
`Workflow({name:'deep-research'})`: a web-search fan-out pipeline
(Scope -> Search -> Fetch -> 3-vote Verify -> Synthesize). Consequences:
- It cannot be removed by deleting a file; it returns on every CLI update and
  exists on **every** Claude Code machine.
- Renaming the scholar-feed skill to `deep-research` would collide with it
  everywhere (nondeterministic selection) **and** over-claim scope (scholar-feed
  only knows CS/AI/ML papers; named generically it would be picked for non-paper
  research where the corpus is useless).
- Correct framing: built-in `deep-research` (web, any topic) and scholar-feed
  (corpus depth, CS/AI/ML) are **complementary**. Each should win its lane;
  scholar-feed wins via a domain-specific description, not a rename.

## What this means

- **Product cannot make a lazy query deep.** Stop iterating MCP/skill surfaces
  toward "ambient depth"; the evidence says it is unreachable with current
  models.
- **The value is real for the ICP.** Researchers ask depth-shaped questions
  naturally; for those, the loop fires and the corpus surfaces canonical prior
  art + post-cutoff successors that web-confirm does not. The original
  optimizer-coding-agent test was the wrong (confirmatory) shape.
- **Leverage moved up a layer:** shape the user's request (onboarding, examples,
  docs that teach "ask for lineage / what supersedes X"), and position
  `/scholar-feed` as the deliberate deep-dive invocation (the human-initiative
  path). That is marketing/onboarding work, not MCP internals.
- **Keep the tool layer correct** (schemas, rank/filter semantics, errors); a
  skill is advisory and host-dependent, so load-bearing logic stays in tools.

## Disposition of artifacts

- **Ship / keep:** `feat/mcp-deep-research-affordances` (commit `c27c845`) -
  server instructions + per-result affordances. Low ceiling but zero downside;
  helps the moment an agent is depth-seeking. Tests green (231).
- **Ship / keep:** scholar-feed skill rewrite - repo `scholar-feed`, branch
  `feat/scholar-feed-skill-deep-loop-rewrite` (commit `1971e36`). Correct-content
  fix (current 25-tool surface, deep-loop-first); helps on `/scholar-feed`
  invocation and depth-shaped queries. Not an ambient-depth fix.
- **Shelved (validated negative):** `experiment/search-enrichment-shelved`
  (commit `96af0f3`) - flag-gated `graph_context` enrichment. Not shipped;
  retained because its parallel lineage+`cited_by` traversal is the primitive a
  future server-side `deep_research` orchestration tool would reuse.
- **Tooling:** `sf-research-experiment` branch `experiment/local-build-eval-config`
  (commit `9247ae0`) - `runner.py --mcp-config` override to A/B a local MCP build;
  `arms/papers-local*.json` (gitignored) point the papers arm at `node build/index.js`.

## Recommendation

Land the affordances patch and the skill rewrite as the real fixes they are.
Do not build more MCP/skill surfaces chasing ambient depth. Take the resolved
finding - the corpus delivers genuine depth for depth-shaped research queries,
which the ICP supplies naturally - back to the business question (is this worth
more GTM, and to whom). If a future "do my deep research in one call" capability
is wanted, build it as a server-side `deep_research` orchestration tool (reusing
the shelved traversal) that returns a finished synthesized result, and accept it
only fires when the user or a skill invokes it.
