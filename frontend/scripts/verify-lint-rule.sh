#!/usr/bin/env bash
#
# Proves the logical-property lint rule actually fires.
#
# A lint rule that is configured but not working looks exactly like a lint rule
# that is working: both produce a green build. So this script lints a fixture
# that is deliberately full of banned classes and fails if ESLint is happy with
# it.
#
# Run from anywhere:  bash frontend/scripts/verify-lint-rule.sh
set -uo pipefail

cd "$(dirname "$0")/.."

FIXTURE="tests/fixtures/physical-property.vue"

if [ ! -f "$FIXTURE" ]; then
  echo "FAIL: lint fixture is missing at frontend/$FIXTURE"
  echo "      It is what proves the logical-property rule works. Restore it."
  exit 1
fi

echo "Linting the fixture, which is expected to FAIL: $FIXTURE"
echo "---------------------------------------------------------------"

# --no-ignore overrides the `ignores` entry that keeps this fixture out of the
# normal lint pass.
OUTPUT="$(pnpm exec eslint --no-ignore "$FIXTURE" 2>&1)"
STATUS=$?

echo "$OUTPUT"
echo "---------------------------------------------------------------"

if [ $STATUS -eq 0 ]; then
  echo "FAIL: ESLint accepted a file containing pl-4, mr-2, text-left, pa-4 and d-flex."
  echo "      The logical-property rule in eslint.config.mjs is not firing."
  exit 1
fi

# ESLint prints the rule message, not the offending class, so assert on the two
# documented messages and on the count of banned classes in the fixture.
if ! echo "$OUTPUT" | grep -q "logical properties"; then
  echo "FAIL: the documented logical-properties message was not in the output."
  exit 1
fi

if ! echo "$OUTPUT" | grep -q "Vuetify utility classes"; then
  echo "FAIL: the Vuetify-utility message was not in the output."
  exit 1
fi

# The fixture holds 5 offences: pl-4 in a script string, then pl-4, mr-2,
# text-left and "pa-4 d-flex" in the template.
RESTRICTED_COUNT="$(echo "$OUTPUT" | grep -c "no-restricted-syntax")"

if [ "$RESTRICTED_COUNT" -lt 5 ]; then
  echo "FAIL: expected at least 5 no-restricted-syntax errors, got $RESTRICTED_COUNT."
  echo "      Some banned classes in the fixture are slipping through the rule."
  exit 1
fi

echo "PASS: the rule rejected all $RESTRICTED_COUNT banned classes with the documented messages."
exit 0
