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

/** Which discovery tool produced the result, picking the right next-step set. */
export type Affordance = "search" | "paper" | "citations" | "lineage";

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
 * Fence the (untrusted) result, then append the (trusted) next-steps footer.
 * Drop-in replacement for `fencePaperContent` in the discovery tools.
 */
export function fencedWithNextSteps(result: unknown, kind: Affordance): string {
  const fenced = fencePaperContent(result);
  const footer = nextStepsFooter(kind, result);
  return footer ? `${fenced}\n\n${footer}` : fenced;
}
