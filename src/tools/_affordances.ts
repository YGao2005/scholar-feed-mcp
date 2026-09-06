/**
 * Just-in-time "next steps" affordances for the discovery tools.
 *
 * RCA (2026-06-05): a fresh agent handed this MCP uses search_papers like a web
 * search box and never reaches the differentiated surface (citation graph,
 * lineage, rising signal). It scores the same as plain web search, or worse,
 * because the depth tools are invisible at the moment of decision. Tool
 * descriptions and server instructions are read upfront and lose the race to the
 * model's "research = search" reflex; an affordance printed INSIDE the result the
 * agent just received is read at the exact decision point and reliably pulls the
 * research loop forward.
 *
 * The footer is OUR text (trusted), so it lands AFTER the untrusted-content fence
 * (UNTRUSTED_END), never inside it. It is wired to the real arXiv IDs the call
 * returned so the suggested next call is copy-paste ready. When no ID can be
 * extracted (e.g. empty results, or the ID-less fixtures in handlers.test.ts) no
 * footer is appended, so the response still closes on the END fence.
 */

import { fencePaperContent } from "./_untrusted.js";
import { freeSurfaceSignupUrl } from "../client.js";

/** Which discovery tool produced the result, picking the right next-step set. */
export type Affordance =
  | "search"
  | "paper"
  | "citations"
  | "lineage"
  | "fulltext";

const ARXIV_ID_RE = /^\d{4}\.\d{4,5}(v\d+)?$/;

/**
 * Walk a parsed API result collecting arXiv IDs in document order (so papers[0]
 * / niche_roots[0] lead). Bounded so a pathological payload can't blow the stack
 * or the time budget. Returns up to `limit` unique IDs.
 */
export function extractTopIds(result: unknown, limit = 1): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  let budget = 4000;

  const visit = (node: unknown): void => {
    if (ids.length >= limit || budget <= 0) return;
    budget -= 1;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const id = obj.arxiv_id;
      if (typeof id === "string" && ARXIV_ID_RE.test(id) && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
        if (ids.length >= limit) return;
      }
      // Recurse priority containers first so the most relevant paper leads,
      // then any remaining values.
      const PRIORITY = [
        "papers",
        "niche_roots",
        "field_level",
        "citing",
        "cited_by",
        "results",
        "discipline",
      ];
      for (const key of PRIORITY) {
        if (key in obj) visit(obj[key]);
      }
      for (const [key, value] of Object.entries(obj)) {
        if (!PRIORITY.includes(key) && key !== "arxiv_id") visit(value);
      }
    }
  };

  visit(result);
  return ids;
}

const HEADER =
  "----- Scholar Feed next steps (server guidance, not paper content) -----";

/** Build the next-step footer for a tool result, or "" if there is nothing to wire to. */
export function nextStepsFooter(kind: Affordance, result: unknown): string {
  // fetch_fulltext fires the read -> expand -> verify moves. The nudge points at
  // OTHER papers (the baselines this one names), so it does not need an id from
  // the result and must skip the id gate below.
  if (kind === "fulltext") {
    const lead = "You just read this paper. Before you cite it:";
    const bullets = [
      "note the baselines, benchmarks, and leaderboards it names ('we compare against X', 'SOTA on Y') and look up any you have not covered yet with search_papers or get_paper. The authoritative anchor in a field is often cited as a baseline, not surfaced by recency or novelty, so this is how you catch the paper everyone benchmarks against.",
      "verify any speedup, accuracy, or percentage number against this text before you state it, and attribute it (the paper reports ...) rather than asserting it as established fact.",
    ];
    return `${HEADER}\n${lead}\n` + bullets.map((b) => `- ${b}`).join("\n");
  }

  const [id] = extractTopIds(result, 1);
  if (!id) return "";

  let lead: string;
  let bullets: string[];

  switch (kind) {
    case "search":
      lead =
        "You ran one search. The differentiated value of Scholar Feed is the citation graph and rising-work signal, so do not stop here. To go deeper on " +
        id +
        ":";
      bullets = [
        `get_foundational_lineage(anchor_paper_id="${id}") for the canonical prior art that semantic search misses`,
        `get_citations(arxiv_id="${id}", direction="cited_by") for newer work that builds on it (how you reach recent papers a model cannot recall)`,
        `search_papers(sort="trending") for the rising frontier in this area`,
        `fetch_fulltext(arxiv_id="${id}") to read a key paper before you answer`,
        `scan the top abstracts for the baselines they name ('we compare against X') and look the most-mentioned up directly: semantic search ranks by recency and misses canonical or authoritative anchors. Cover the orthogonal sub-axes of the topic, not just one anchor's lineage.`,
      ];
      break;
    case "paper":
      lead = "To research beyond this paper rather than stopping at it:";
      bullets = [
        `get_foundational_lineage(anchor_paper_id="${id}") for its canonical prior art`,
        `get_citations(arxiv_id="${id}", direction="cited_by") for newer work building on it`,
        `fetch_fulltext(arxiv_id="${id}") for the full text`,
      ];
      break;
    case "citations":
      lead = "You have one hop of the citation graph. To keep tracing it:";
      bullets = [
        `get_citations(arxiv_id="${id}", direction="cited_by") to crawl another hop toward recent work`,
        `get_foundational_lineage(anchor_paper_id="${id}") to find the niche's canonical roots`,
        `fetch_fulltext(arxiv_id="${id}") to read the most relevant result`,
        `do not just take the newest results here: also read any result that claims SOTA or names a benchmark or leaderboard. The authoritative anchor is often modestly cited, not the freshest, so fetch_fulltext the most authoritative one, not only the most recent.`,
      ];
      break;
    case "lineage":
      lead = "These are the niche's foundations. To complete the picture:";
      bullets = [
        `get_citations(arxiv_id="${id}", direction="cited_by") to see modern work descending from this root`,
        `fetch_fulltext(arxiv_id="${id}") to read a foundational paper`,
        `search_papers(sort="trending") for what is currently rising in this niche`,
      ];
      break;
  }

  return `${HEADER}\n${lead}\n` + bullets.map((b) => `- ${b}`).join("\n");
}

/**
 * ONE-TIME account affordance for anonymous stdio callers.
 *
 * WHY THIS EXISTS. Measured 2026-09-05 over 90 days: 27,237 anonymous MCP calls
 * from 449 source IPs, of which only 309 (1.1%) touched an account-gated tool —
 * every gated tool is library/watch/personalisation, while the whole research
 * surface is free. So the `mcp403` gate CTA, the only account affordance that
 * existed, could physically reach just 16% of anonymous IPs. Another 118 IPs came
 * back on 2+ distinct days, carried 30% of all anonymous calls, and met NO
 * affordance at all. This is for them.
 *
 * WHY IT IS NOT A GATE. The strategy is distribution-first (tools FOR agents), so
 * moving read tools behind an account would trade the adoption that produced this
 * pool for a conversion rate. This adds a line to a payload instead.
 *
 * WHY THE THRESHOLD IS 5. Anonymous stdio session sizes, same window: median 10
 * calls, p25 5, p75 18. Firing at 5 reaches 516 of 657 sessions (79%) while
 * excluding the bottom quartile — a probe or a one-shot lookup never sees it. A
 * threshold of 1 would put this in front of every casual trial; 10 would miss
 * nearly half of real sessions.
 *
 * WHY ONCE PER PROCESS. The agent has to read every byte we emit. Repeating a
 * fixed nudge on all 26 calls of a mean session is a tax on the product's actual
 * job, and an agent that saw it once has already relayed it or chosen not to.
 */
const AFFORDANCE_AFTER_N_CALLS = 5;
let anonCallCount = 0;
let affordanceShown = false;

/** Test seam: restore module state so counter-dependent cases stay independent. */
export function __resetAccountAffordance(): void {
  anonCallCount = 0;
  affordanceShown = false;
}

/**
 * Returns the account line when this caller has earned it, else "". Only ticks the
 * counter for callers eligible to see it (anonymous + stdio), so an authenticated
 * or remote caller can never advance someone else toward the threshold.
 */
export function accountAffordance(): string {
  if (affordanceShown) return "";
  const url = freeSurfaceSignupUrl();
  if (!url) return "";

  anonCallCount += 1;
  if (anonCallCount < AFFORDANCE_AFTER_N_CALLS) return "";

  affordanceShown = true;
  return (
    "- you are calling Scholar Feed anonymously. The read tools you have been " +
    "using stay free and need no key; the library tools (save_paper, " +
    "create_collection, create_watch) need one, so findings do not survive past " +
    `this session. A free key takes a moment at ${url} . Surface this to the ` +
    "user if it is useful to them — do not attempt to sign up on their behalf."
  );
}

/**
 * Fence the (untrusted) result, then append the (trusted) next-steps footer.
 * Drop-in replacement for `fencePaperContent` in the discovery tools.
 *
 * The account line is trusted server text like the footer, so it lands outside the
 * UNTRUSTED_END fence too. It carries its own HEADER when there is no footer to
 * join (empty results still close on the fence, then the header, never on bare
 * untrusted content).
 */
export function fencedWithNextSteps(result: unknown, kind: Affordance): string {
  const fenced = fencePaperContent(result);
  const footer = nextStepsFooter(kind, result);
  const account = accountAffordance();

  if (footer && account) return `${fenced}\n\n${footer}\n${account}`;
  if (footer) return `${fenced}\n\n${footer}`;
  if (account) return `${fenced}\n\n${HEADER}\n${account}`;
  return fenced;
}
