#!/bin/sh
# CI drift guard: the pinned contract copies must byte-match the pinned
# MANIFEST. A failure means someone edited the copies without running
# scripts/sync-contract.sh from an elyseum contract release — re-pin and
# reference the elyseum release in the PR.
set -eu
cd "$(dirname "$0")/.."

if sha256sum -c fixtures/envelope.v1/MANIFEST.sha256 > /tmp/contract-check.log 2>&1; then
  echo "contract drift check: OK ($(wc -l < fixtures/envelope.v1/MANIFEST.sha256) pinned entries)"
  exit 0
fi

cat /tmp/contract-check.log >&2
echo "" >&2
echo "contract drift detected: pinned schema/fixtures do not match MANIFEST.sha256." >&2
echo "Re-pin via scripts/sync-contract.sh from the canonical elyseum release." >&2
exit 1
