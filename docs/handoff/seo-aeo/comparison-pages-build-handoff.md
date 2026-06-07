# Handoff: build the /compare comparison pages on the site

Paste the block below into a fresh Claude Code session **opened in the frontend
repo** (`/Users/yang/discord-bots-workspace/scholar-feed/frontend`). It's
self-contained; it points at the already-written page copy rather than inlining
it.

---

## PROMPT (paste this)

You are working in the Scholar Feed frontend repo
(`/Users/yang/discord-bots-workspace/scholar-feed/frontend`), a Next.js App
Router app deployed on Vercel (auto-deploys on merge to `master`; the founder
deploys, never you). Your job: publish 6 hand-authored "comparison / alternative"
marketing pages for AEO — pages that get cited by AI answer engines and rank for
"X alternative" / "X vs Y" queries.

**The page copy is already written. Do not rewrite it.** Read these two files from
the *other* repo and use them as the source of truth:
- Page content (all 6 pages, with title/meta tags, answer-first openers,
  comparison tables, "when NOT to use" blocks):
  `/Users/yang/discord-bots-workspace/scholar-feed-mcp/docs/handoff/seo-aeo/comparison-pages.md`
- JSON-LD blocks + on-page AEO conventions (SoftwareApplication, FAQPage):
  `/Users/yang/discord-bots-workspace/scholar-feed-mcp/docs/handoff/seo-aeo/seo-aeo-checklist.md`

The 6 routes (slug → page):
1. `/compare/arxiv-sanity-alternative`
2. `/compare/semantic-scholar-mcp`
3. `/compare/research-rabbit-alternative`
4. `/compare/connected-papers-alternative`
5. `/compare/scholar-inbox-alternative`
6. `/compare/paper-digest-vs-scholar-feed`

### Before touching anything
- `git fetch origin`, then create a branch off `origin/master` (e.g.
  `feat/compare-pages`). **Do not build on the current checkout's branch** — per
  project history the main checkout has sometimes sat on a stale/diverged branch
  with unrelated WIP. Check `git status` / `git branch`; if diverged, use a
  worktree off `origin/master`.
- All work on the branch. The founder reviews and deploys. Do not deploy.

### Build
1. **Content module:** port the 6 pages from `comparison-pages.md` into a typed
   data module (e.g. `app/compare/_content.ts`) — slug, title tag, meta
   description, h1, the answer-first opener, the comparison table rows, the body
   sections, the "when NOT to use" list, FAQ Q&A pairs.
2. **Route:** `app/compare/[slug]/page.tsx` as a **server component**.
   - `export async function generateStaticParams()` returning all 6 slugs.
     **This is required** — a `[slug]` route renders fully dynamic
     (`private, no-store`, no edge cache) unless `generateStaticParams` is
     present; with it the route flips to `● (SSG)` in the `next build` table.
     Confirm it shows SSG, not `ƒ (Dynamic)`.
   - `export async function generateMetadata({ params })` per slug: title tag,
     meta description, **self-canonical** (`alternates.canonical`), Open Graph.
     (Mirror how `app/explore` / `app/developers` do metadata + canonical — the
     PR #18 server-page pattern. Those pages were fixed precisely because a
     client page inherited the root canonical → don't repeat that.)
   - Render: real `<h1>`, the opener, the comparison table, the body, the CTA.
     These pages are **fully static — no backend/API fetches.** Keep them that
     way; do not call the FastAPI backend from them (avoids the egress-throttle
     class of bug entirely).
   - JSON-LD via `<script type="application/ld+json">`: `SoftwareApplication`
     (from the checklist), `FAQPage` (built from each page's Q&A — text MUST
     match visible copy), and `BreadcrumbList` (Home → Compare → page).
3. **Optional but nice:** an `app/compare/page.tsx` index listing all 6 (internal
   linking hub). Link each comparison page to `/developers` and to 1–2 sibling
   comparison pages.

### Three wiring tasks (easy to miss)
1. **middleware.ts** (repo root): `/compare` currently falls through to the
   Supabase `auth.getUser()` cookie refresh, which marks responses
   `private,no-store` and defeats the edge cache. Add a short-circuit for
   `pathname.startsWith("/compare")` that returns `NextResponse.next()` with
   `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` —
   mirror the existing `PUBLIC_CACHEABLE_PREFIXES` block (keep it AFTER the
   `BLOCKED_PATTERN` bot block so scrapers still 403).
2. **app/sitemap.xml/route.ts**: the Storage-backed sitemap worker only
   enumerates papers/authors. Add the 6 `/compare` URLs (and the optional
   `/compare` index) to the **static fallback / static-pages** section so they
   appear in the sitemap. Verify after build.
3. **IndexNow (post-deploy, note for the founder):** once the pages are live
   (200), submit the 6 URLs once so Bing → ChatGPT Search / Perplexity pick them
   up fast. Key is `50473d11c4d99e9569d0fe676fde83f2` (already hosted at
   `/<key>.txt`). One-off:
   ```
   curl -X POST https://api.indexnow.org/indexnow -H "Content-Type: application/json" -d '{
     "host":"www.scholarfeed.org",
     "key":"50473d11c4d99e9569d0fe676fde83f2",
     "keyLocation":"https://www.scholarfeed.org/50473d11c4d99e9569d0fe676fde83f2.txt",
     "urlList":[
       "https://www.scholarfeed.org/compare/arxiv-sanity-alternative",
       "https://www.scholarfeed.org/compare/semantic-scholar-mcp",
       "https://www.scholarfeed.org/compare/research-rabbit-alternative",
       "https://www.scholarfeed.org/compare/connected-papers-alternative",
       "https://www.scholarfeed.org/compare/scholar-inbox-alternative",
       "https://www.scholarfeed.org/compare/paper-digest-vs-scholar-feed"
     ]
   }'
   ```
   (The repo's `scripts/ping_indexnow.py` is papers-only; this is a manual one-off.)

### Accuracy gate (do before committing)
Re-verify every product claim in the copy against the live README at
`/Users/yang/discord-bots-workspace/scholar-feed-mcp/README.md`: corpus is
**600,000+** CS/AI/ML, install is `npx scholar-feed-mcp init`, quotas are
**100 / 1,000 / 10,000** (anon / free key / Pro), and the named capabilities
(watches, novelty score, citation tracing, full-text extraction, BibTeX) are
real. The drafts were written against the README but confirm nothing drifted.

### Verify
- `npm run build` passes (tsc + lint + build). The `/compare/[slug]` route shows
  `● (SSG)` with 6 prerendered paths. **Known false-fail:** local prerender of
  `/` may error on missing backend/Supabase env — that's repo-wide and fine; the
  TS + page-data compile is what matters.
- Validate the JSON-LD in validator.schema.org and Google's Rich Results Test
  (expect zero errors; FAQ text matches visible text).
- After the founder deploys: `curl` a page and confirm `cache-control: public,
  s-maxage=3600` + `x-vercel-cache: HIT` on the second hit, the `<h1>` and
  JSON-LD present in raw HTML, and a 200 to a ClaudeBot/GPTBot UA.

### Suggested order
Build `arxiv-sanity-alternative` end-to-end first (route + metadata + JSON-LD +
the middleware + sitemap changes), run `next build`, confirm it's SSG and
cacheable — that's the template. Then fill the other 5 from the content file.
Commit on the branch, open a PR, summarize what to verify, and hand it to the
founder. The IndexNow ping happens after deploy.

---

*Source drafts and rationale: `comparison-pages.md` (copy),
`directory-submissions.md` (related AEO worklist), `seo-aeo-checklist.md`
(JSON-LD + conventions), all in
`scholar-feed-mcp/docs/handoff/seo-aeo/`.*
