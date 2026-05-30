/**
 * Tool registration barrel.
 *
 * Imports the v3 tool modules and exports registerAllTools(),
 * which registers each tool on the given McpServer instance.
 *
 * v3.1.0 surface (9 tools):
 *   search_papers, get_paper, get_citations, fetch_fulltext,
 *   find_author, co_author_graph, embed_text, get_field_orientation,
 *   get_foundational_lineage
 *
 * Removed from registry (11 tools deregistered, files preserved with deprecation headers):
 *   KILLED (FND-03 audit — thin 7-hour window, but v3 spec locked the removal):
 *     check_connection, fetch_repo
 *   Absorbed into search_papers:
 *     find_similar, find_citations_about, whats_trending
 *   Absorbed into get_paper:
 *     batch_lookup, export_bibtex
 *   Merged into find_author:
 *     discover_authors, get_author
 *   Demoted to skills:
 *     compare_methods, field_guide
 *   (get_leaderboard was already deregistered in v2.0.0 — unchanged)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { register as registerSearch } from "./search.js";
import { register as registerGetPaper } from "./get_paper.js";
import { register as registerCitations } from "./citations.js";
import { register as registerFulltext } from "./fulltext.js";
import { register as registerFindAuthor } from "./find_author.js";
import { register as registerCoAuthorGraph } from "./co_author_graph.js";
import { register as registerEmbedText } from "./embed_text.js";
import { register as registerGetFieldOrientation } from "./get_field_orientation.js";
import { register as registerGetFoundationalLineage } from "./get_foundational_lineage.js";

/**
 * Register all Scholar Feed MCP tools on the provided server instance.
 * v3.1 surface: exactly 9 tools.
 */
export function registerAllTools(server: McpServer): void {
  registerSearch(server);
  registerGetPaper(server);
  registerCitations(server);
  registerFulltext(server);
  registerFindAuthor(server);
  registerCoAuthorGraph(server);
  registerEmbedText(server);
  registerGetFieldOrientation(server);
  registerGetFoundationalLineage(server);
}
