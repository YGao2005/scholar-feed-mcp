/**
 * Tool registration barrel.
 *
 * Imports the v3 tool modules and exports registerAllTools(),
 * which registers each tool on the given McpServer instance.
 *
 * Read/search core (9 tools, since v3.1.0):
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
import { register as registerLibrary } from "./library.js";
import { register as registerCollectionsWrite } from "./collections_write.js";
import { register as registerWatches } from "./watches.js";
import { register as registerGaps } from "./gaps.js";
import { register as registerAskLibrary } from "./ask_library.js";
import { register as registerCheckDrift } from "./check_drift.js";

/**
 * Register all Scholar Feed MCP tools on the provided server instance.
 *
 * v3.7 surface (26 tools):
 *   9 read/search tools (anonymous-capable, except embed_text which is Pro) +
 *   check_drift (DriftKB supersession check, anonymous-capable) + find_gaps
 *   (read-only gap analysis, Pro) + ask_library (cited synthesis over
 *   your saved set) + 14 library/collection/watch tools that operate on the
 *   authenticated user's account and require an SF_API_KEY:
 *     library (4):     save_paper, unsave_paper, like_paper, list_library
 *     collections (4): list_collections, create_collection, add_to_collection,
 *                      remove_from_collection
 *     watches (6):     create_watch, list_watches, check_watches, update_watch,
 *                      preview_watch, delete_watch
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
  registerLibrary(server);
  registerCollectionsWrite(server);
  registerWatches(server);
  registerGaps(server);
  registerAskLibrary(server);
  registerCheckDrift(server);
}
