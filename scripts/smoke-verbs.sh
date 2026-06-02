#!/usr/bin/env bash
#
# Live smoke for the read verbs: list_watches, check_watches, find_gaps.
# Reads SF_API_KEY from .env.smoke (gitignored) or the env. NEVER prints the key.
#
#   bash scripts/smoke-verbs.sh
#   GAPS_TOPIC="efficient LLM inference" bash scripts/smoke-verbs.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$HERE/.env.smoke" ]; then set -a; . "$HERE/.env.smoke"; set +a; fi
: "${SF_API_KEY:?Set SF_API_KEY in .env.smoke (or export it)}"
BASE="${SF_API_BASE_URL:-https://api.scholarfeed.org/api/v1}"
GAPS_TOPIC="${GAPS_TOPIC:-AI agent safety and guardrails}"
AUTH=(-H "Authorization: Bearer ${SF_API_KEY}")

echo "===== 1) GET /watches — your standing watches ====="
curl -s "${AUTH[@]}" "$BASE/watches" | python3 -c 'import sys,json
d=json.load(sys.stdin)
if isinstance(d,dict) and d.get("error"): print("ERROR:",d.get("error"),"-",d.get("message")); sys.exit()
print("is_pro:",d.get("is_pro"),"| limit:",d.get("limit"),"| watches:",len(d.get("watches",[])))
for w in d.get("watches",[]): print("  -",w.get("name"),"|",w.get("summary"),"| pending_hits:",w.get("pending_hits"),"| last_eval:",w.get("last_evaluated_at"))'
echo
echo "===== 2) GET /watches/hits — new matches since last digest ====="
curl -s "${AUTH[@]}" "$BASE/watches/hits?limit=10" | python3 -c 'import sys,json
d=json.load(sys.stdin)
if isinstance(d,dict) and d.get("error"): print("ERROR:",d.get("error"),"-",d.get("message")); sys.exit()
print("hits:",len(d.get("hits",[])))
for x in d.get("hits",[]): print("  - [",x.get("watch_name"),"]",x.get("title"),"| score:",x.get("score"))'
echo
echo "===== 3) GET /gaps?topic=\"$GAPS_TOPIC\" scope=both limit=5 (Pro) ====="
curl -s "${AUTH[@]}" --get "$BASE/gaps" --data-urlencode "topic=$GAPS_TOPIC" --data-urlencode "scope=both" --data-urlencode "limit=5" | python3 -c 'import sys,json
d=json.load(sys.stdin)
if isinstance(d,dict) and d.get("error"): print("ERROR:",d.get("error"),"-",d.get("message")); sys.exit()
n=d.get("niche",{})
print("niche:",n.get("label"),"| cats:",n.get("categories"),"| seed_papers:",n.get("seed_paper_count"))
print("FOUNDATIONAL gaps (canonical, not saved):")
for p in d.get("foundational_gaps",[]): print("  -",p.get("title"),"| cited_in_niche:",p.get("cited_by_in_niche"),"| arxiv:",p.get("arxiv_id"))
print("FRONTIER gaps (recent novel, not saved):")
for p in d.get("frontier_gaps",[]): print("  -",p.get("title"),"| novelty:",p.get("llm_novelty_score"),"| arxiv:",p.get("arxiv_id"))'
