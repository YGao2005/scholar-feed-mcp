/**
 * Tool registration barrel.
 *
 * Imports all 23 tool modules and exports registerAllTools(),
 * which registers each tool on the given McpServer instance.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { register as registerCheckConnection } from "./check_connection.js";
import { register as registerSearch } from "./search.js";
import { register as registerGetPaper } from "./get_paper.js";
import { register as registerSimilar } from "./similar.js";
import { register as registerCitations } from "./citations.js";
import { register as registerTrending } from "./trending.js";
import { register as registerFulltext } from "./fulltext.js";
import { register as registerBatch } from "./batch.js";
import { register as registerRepo } from "./repo.js";
import { register as registerBibtex } from "./bibtex.js";
import { register as registerDeepResearch } from "./deep_research.js";
import { register as registerRefineResearch } from "./refine_research.js";
import { register as registerGetPaperResults } from "./get_paper_results.js";
import { register as registerGetLeaderboard } from "./get_leaderboard.js";
import { register as registerSearchBenchmarks } from "./search_benchmarks.js";
import { register as registerSearchByMethod } from "./search_by_method.js";
import { register as registerCompareMethods } from "./compare_methods.js";
import { register as registerDiscoverAuthors } from "./discover_authors.js";
import { register as registerGetAuthor } from "./get_author.js";
import { register as registerGetAuthorPapers } from "./get_author_papers.js";
import { register as registerGetBenchmarkTimeline } from "./get_benchmark_timeline.js";
import { register as registerGetBenchmarkStats } from "./get_benchmark_stats.js";
import { register as registerGetResearchLandscape } from "./get_research_landscape.js";

/**
 * Register all Scholar Feed MCP tools on the provided server instance.
 */
export function registerAllTools(server: McpServer): void {
  registerCheckConnection(server);
  registerSearch(server);
  registerGetPaper(server);
  registerSimilar(server);
  registerCitations(server);
  registerTrending(server);
  registerFulltext(server);
  registerBatch(server);
  registerRepo(server);
  registerBibtex(server);
  registerDeepResearch(server);
  registerRefineResearch(server);
  registerGetPaperResults(server);
  registerGetLeaderboard(server);
  registerSearchBenchmarks(server);
  registerSearchByMethod(server);
  registerCompareMethods(server);
  registerDiscoverAuthors(server);
  registerGetAuthor(server);
  registerGetAuthorPapers(server);
  registerGetBenchmarkTimeline(server);
  registerGetBenchmarkStats(server);
  registerGetResearchLandscape(server);
}
