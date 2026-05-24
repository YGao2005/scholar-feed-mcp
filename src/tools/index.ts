/**
 * Tool registration barrel.
 *
 * Imports all 15 tool modules and exports registerAllTools(),
 * which registers each tool on the given McpServer instance.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { register as registerCheckConnection } from "./check_connection.js";
import { register as registerSearch } from "./search.js";
import { register as registerGetPaper } from "./get_paper.js";
import { register as registerSimilar } from "./similar.js";
import { register as registerCitations } from "./citations.js";
import { register as registerFindCitationsAbout } from "./find_citations_about.js";
import { register as registerTrending } from "./trending.js";
import { register as registerFulltext } from "./fulltext.js";
import { register as registerBatch } from "./batch.js";
import { register as registerRepo } from "./repo.js";
import { register as registerBibtex } from "./bibtex.js";
import { register as registerCompareMethods } from "./compare_methods.js";
import { register as registerDiscoverAuthors } from "./discover_authors.js";
import { register as registerGetAuthor } from "./get_author.js";
import { register as registerFieldGuide } from "./field_guide.js";

/**
 * Register all Scholar Feed MCP tools on the provided server instance.
 */
export function registerAllTools(server: McpServer): void {
  registerCheckConnection(server);
  registerSearch(server);
  registerGetPaper(server);
  registerSimilar(server);
  registerCitations(server);
  registerFindCitationsAbout(server);
  registerTrending(server);
  registerFulltext(server);
  registerBatch(server);
  registerRepo(server);
  registerBibtex(server);
  registerCompareMethods(server);
  registerDiscoverAuthors(server);
  registerGetAuthor(server);
  registerFieldGuide(server);
}
