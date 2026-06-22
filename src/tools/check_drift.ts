/**
 * check_drift tool — DriftKB: is the method I use superseded, and by what?
 *
 * Wraps GET /public/drift/check (TOOL-12). Serves the grounded supersession
 * knowledge base: per builder-problem FAMILY (e.g. 'kvcache'), it ranks the
 * most-superseded baselines from two independent grounded signals — verbatim
 * textual critique RECEIPTS and benchmark-DOMINANCE edges (winner numbers +
 * condition, copied from the paper's table) — plus the competition sub-problems
 * and the live frontier. No LLM call; reads denormalized serving tables.
 *
 * Two modes off one call:
 *   • method given  → focused verdict for that method (who critiques it, who
 *     beats it with numbers, newer not-yet-superseded alternatives).
 *   • method omitted → the family "living systematic review" map.
 *
 * Anonymous-capable (no Pro key required). Endpoint: GET /public/drift/check
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { fencePaperContent } from "./_untrusted.js";
import { asStructuredObject } from "./_output.js";

// Permissive output shape (all-optional, loose) covering both modes — unknown
// keys are stripped, never rejected, so a backend addition can't hard-fail.
const driftOutput = {
  family: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  method: z.string().optional(),
  found: z.boolean().optional(),
  verdict: z.string().optional(),
  summary: z.string().optional(),
  superseded_rank: z.number().nullable().optional(),
  methods_ranked: z.number().optional(),
  critiqued_by_papers: z.number().optional(),
  beaten_by_papers: z.number().optional(),
  sub_problem: z.string().nullable().optional(),
  anchor_arxiv: z.string().nullable().optional(),
  anchor_title: z.string().nullable().optional(),
  first_seen: z.string().nullable().optional(),
  criticized_by: z.array(z.unknown()).optional(),
  beaten_by: z.array(z.unknown()).optional(),
  newer_alternatives: z.array(z.unknown()).optional(),
  most_superseded: z.array(z.unknown()).optional(),
  sub_problems: z.array(z.unknown()).optional(),
  frontier: z.array(z.unknown()).optional(),
  suggestions: z.array(z.string()).optional(),
  available_families: z.array(z.unknown()).optional(),
  stats: z.record(z.string(), z.unknown()).optional(),
  message: z.string().optional(),
  note: z.string().optional(),
};

export function register(server: McpServer): void {
  server.registerTool(
    "check_drift",
    {
      title: "Check Drift (is my method superseded?)",
      annotations: { readOnlyHint: true, destructiveHint: false },
      outputSchema: driftOutput,
      description:
        "Answers 'for my problem, is the method I use superseded — and by what?' over a grounded, entity-resolved knowledge base of textual critique receipts + benchmark-dominance edges (~90% precision, no LLM call). Call with a `family` (e.g. 'rag', 'peft', 'kvcache') and a `method` (e.g. 'SnapKV', 'LoRA') to get a verdict: how superseded it is, WHO critiques it (verbatim quotes + the citing paper), WHO beats it on benchmarks (winner, numbers, condition, source paper), and the not-yet-superseded alternatives in the same sub-problem. Omit `method` to get the whole-family map: most-superseded baselines, competition sub-problems, and the live frontier. Method names are matched case- and spacing-insensitively, with did-you-mean suggestions on a miss. Use this when choosing or reviewing a technique for a known problem area, or to check whether a baseline a paper relies on has been beaten. Does not require a Pro API key. Covers ~10 LLM builder-problem families — retrieval-augmented generation (rag), parameter-efficient fine-tuning (peft), mixture-of-experts (moe), reasoning/chain-of-thought (reasoning), KV-cache compression (kvcache), speculative decoding (specdec), quantization (quant), agent memory (agentmemory), long-context (longcontext), and tool use (tooluse) — and growing. Query with an unknown `family` (e.g. family='list') to get the live list of available families. Coverage caveat: evidence is drawn only from arXiv benchmark tables, so 'superseded' means a method was beaten in a published comparison (not that it is dead or unusable), production frameworks (LangChain, LlamaIndex, etc.) appear only as baselines and never as winners, and results are a literature signal rather than a deployment recommendation.",
      inputSchema: {
        family: z
          .string()
          .min(1)
          .max(60)
          .describe(
            "Builder-problem family to query, e.g. 'rag' (retrieval-augmented generation), 'peft' (parameter-efficient fine-tuning), 'kvcache' (KV-cache compression). Query with an unknown family (e.g. 'list') to get the live list of available families.",
          ),
        method: z
          .string()
          .max(80)
          .optional()
          .describe(
            "Method to check, e.g. 'SnapKV', 'H2O', 'StreamingLLM' (case/spacing-insensitive). Omit to get the whole-family map instead of a single-method verdict.",
          ),
        limit: z
          .number()
          .int()
          .min(3)
          .max(50)
          .default(12)
          .describe(
            "Max items per list — receipts, dominance edges, frontier (3–50, default 12).",
          ),
      },
    },
    async ({ family, method, limit }) => {
      try {
        const params: Record<string, string> = {
          family,
          limit: String(limit),
        };
        if (method && method.trim()) {
          params.method = method.trim();
        }
        const result = await client.get<unknown>("/public/drift/check", params);
        return {
          content: [{ type: "text" as const, text: fencePaperContent(result) }],
          structuredContent: asStructuredObject(result),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
