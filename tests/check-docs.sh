#!/usr/bin/env bash
# check-docs.sh - fail if the numbers claimed in README.md drift from what the
# code actually computes. Run after `npm run build`.
set -euo pipefail
cd "$(dirname "$0")/.."

numbers=$(node --input-type=module <<'EOF'
import { minimize, ddminString } from './dist/src/core/ddmin.js';
import { validatorFor } from './dist/src/core/validators.js';
import { INCIDENTS } from './dist/src/core/incidents.js';

const out = {};
for (const inc of INCIDENTS) {
  if (inc.poisonChunkId) {
    const oracle = (subset) => validatorFor(inc.oracle)(inc.replayGeneration(subset.map(c => c.id), inc.question), subset);
    const { minimal, oracleCalls } = minimize(inc.chunks, oracle);
    out[inc.id] = { chunks: inc.chunks.length, minimal: minimal.map(c => c.id), oracleCalls, subsets: 2 ** inc.chunks.length };
  }
}
const inc2319 = INCIDENTS.find(i => i.id === 'INC-2319');
const v = validatorFor(inc2319.oracle);
const allIds = inc2319.chunks.map(c => c.id);
const gen = ddminString(inc2319.question, (q) => v(inc2319.replayGeneration(allIds, q), []));
let steps = 0, r = gen.next();
while (!r.done) { steps++; r = gen.next(); }
out['INC-2319-chars'] = { qlen: inc2319.question.length, minimal: r.value, oracleCalls: steps + 1 };
console.log(JSON.stringify(out));
EOF
)

echo "$numbers" | jq .

claim() { # claim <description> <grep-pattern>
  if ! grep -qE "$2" README.md; then
    echo "check-docs: README missing or stale claim: $1 (pattern: $2)"; exit 1
  fi
  echo "ok - $1"
}

c2311=$(echo "$numbers" | jq -r '.["INC-2311"].oracleCalls')
s2311=$(echo "$numbers" | jq -r '.["INC-2311"].subsets')
c2319=$(echo "$numbers" | jq -r '.["INC-2319-chars"].oracleCalls')
q2319=$(echo "$numbers" | jq -r '.["INC-2319-chars"].qlen')

[ "$(echo "$numbers" | jq -r '.["INC-2311"].minimal[0]')" = "c07" ] || { echo "check-docs: INC-2311 minimal is not c07"; exit 1; }
[ "$(echo "$numbers" | jq -r '.["INC-2327"].minimal[0]')" = "w03" ] || { echo "check-docs: INC-2327 minimal is not w03"; exit 1; }
[ "$(echo "$numbers" | jq -r '.["INC-2319-chars"].minimal')" = '"' ] || { echo "check-docs: INC-2319 minimal char is not a quote"; exit 1; }

claim "INC-2311 oracle calls" "in ${c2311} oracle calls"
s2311f=$(node -e "console.log(($s2311).toLocaleString('en-US'))")
claim "INC-2311 exhaustive subsets" "${s2311f} (exhaustive subsets|runs)"
claim "INC-2319 question length" "${q2319} (characters|char)"
claim "INC-2319 reduction" "shrink(ing)? ${q2319} characters|${q2319} characters down"
echo "check-docs: all README claims match the code"
