#!/usr/bin/env bash
#
# Create or update the labels that suiflex-bot applies to pull requests.
#
# Run once per repository, and again after adding a repository to the PR Triage
# workflow. `gh label create --force` updates an existing label in place, so
# re-running is safe and changes nothing when the labels already match.
#
#   ./scripts/sync-labels.sh suiflex/rdb suiflex/suitest
#
# Kept out of the workflow on purpose: the workflow would otherwise call the
# label API on every pull request event to maintain labels that change perhaps
# twice a year.

set -euo pipefail

# name|color|description
#
# Colors come from the suiflex brand palette in ForgeGuard/assets/brand. The
# family a label belongs to is readable from its color alone: dark green for
# people inside the org, brand green for newcomers, pale green for commit
# information, black for machines. Amber deliberately breaks the family because
# it is the only label that asks someone to do something.
LABELS=(
  "maintainer|16a34a|Opened by a member of the suiflex/maintainers team · suiflex-bot"
  "first contribution|4ade80|First pull request this person has opened in suiflex · suiflex-bot"
  "bot|0a0a0a|Opened by a bot account · suiflex-bot"

  "commit: feat|bbf7d0|Contains a feat commit · suiflex-bot"
  "commit: fix|bbf7d0|Contains a fix commit · suiflex-bot"
  "commit: docs|bbf7d0|Contains a docs commit · suiflex-bot"
  "commit: chore|bbf7d0|Contains a chore commit · suiflex-bot"
  "commit: refactor|bbf7d0|Contains a refactor commit · suiflex-bot"
  "commit: test|bbf7d0|Contains a test commit · suiflex-bot"
  "commit: ci|bbf7d0|Contains a ci commit · suiflex-bot"
  "commit: build|bbf7d0|Contains a build commit · suiflex-bot"
  "commit: perf|bbf7d0|Contains a perf commit · suiflex-bot"

  "needs: conventional commit|bf8700|A commit message release-please cannot parse · suiflex-bot"
)

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <owner/repo> [owner/repo ...]" >&2
  exit 64
fi

for repo in "$@"; do
  echo "==> $repo"
  for entry in "${LABELS[@]}"; do
    IFS='|' read -r name color description <<<"$entry"
    gh label create "$name" \
      --repo "$repo" \
      --color "$color" \
      --description "$description" \
      --force
  done
done
