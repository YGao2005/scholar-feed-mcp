#!/usr/bin/env bash
#
# Live smoke test for the ask_library verb (+ a library pre-check) against the
# real backend. Reads your key from .env.smoke (gitignored) or the SF_API_KEY
# env var. NEVER prints the key.
#
#   1. Put your key in .env.smoke   (SF_API_KEY=sf_...)
#   2. bash scripts/smoke-ask.sh
#
# Override the question:  ASK_QUESTION="..." bash scripts/smoke-ask.sh
# Scope to a collection:  ASK_COLLECTION="my-collection-name" bash scripts/smoke-ask.sh
# Point at a local API:   SF_API_BASE_URL=http://localhost:8000/api/v1 ...
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$HERE/.env.smoke" ]; then set -a; . "$HERE/.env.smoke"; set +a; fi
: "${SF_API_KEY:?Set SF_API_KEY in .env.smoke (or export it) — get one at scholarfeed.org/settings}"

BASE="${SF_API_BASE_URL:-https://api.scholarfeed.org/api/v1}"
Q="${ASK_QUESTION:-What are the main approaches and open problems across my saved papers?}"
AUTH=(-H "Authorization: Bearer ${SF_API_KEY}")

pp() { python3 -m json.tool 2>/dev/null || cat; }

echo "### backend: $BASE"
echo
echo "### 1) GET /library?limit=5  — what's in your account ————————————————"
curl -s "${AUTH[@]}" "$BASE/library?limit=5" | pp
echo
echo "### 2) GET /ask  — \"$Q\" ————————————————"
ASK_URL="$BASE/ask"
ARGS=(--get "$ASK_URL" --data-urlencode "question=$Q" --data-urlencode "limit=8")
[ -n "${ASK_COLLECTION:-}" ] && ARGS+=(--data-urlencode "collection_name=$ASK_COLLECTION")
RESP="$(curl -s "${AUTH[@]}" "${ARGS[@]}")"
echo "$RESP" | pp
echo
echo "--- answer (readable) ----------------------------------------------------"
echo "$RESP" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print("(non-JSON response)"); sys.exit(0)
if d.get("error"):
    print("ERROR:", d.get("error"), "—", d.get("message")); sys.exit(0)
print(d.get("answer", "(no answer field)"))
print()
print("coverage:", d.get("coverage"), "| grounded_on:", d.get("scope", {}).get("grounded_on"),
      "| cited:", [c.get("arxiv_id") for c in d.get("citations", [])])
'
