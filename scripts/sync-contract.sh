#!/bin/sh
# Re-pins the contract copies (schema + fixtures + manifest) from the
# canonical source: the elyseum repository checkout next to this one.
# Elyseum is the single source of truth; this script is the ONLY
# sanctioned way to change the pinned copies (paired with a contract
# release — see docs/contract.md in the elyseum repository).
#
# Usage: scripts/sync-contract.sh [path-to-elyseum-checkout]
set -eu

SOURCE="${1:-$(dirname "$0")/../../elyseum}"

if [ ! -f "$SOURCE/schemas/envelope.v1.json" ] || [ ! -d "$SOURCE/fixtures/envelope.v1" ]; then
  echo "error: $SOURCE does not look like an elyseum checkout." >&2
  echo "usage: $0 [path-to-elyseum-checkout]" >&2
  exit 1
fi

cp "$SOURCE/schemas/envelope.v1.json" schemas/envelope.v1.json
cp "$SOURCE"/fixtures/envelope.v1/*.json fixtures/envelope.v1/
cp "$SOURCE/fixtures/envelope.v1/MANIFEST.sha256" fixtures/envelope.v1/MANIFEST.sha256

echo "contract re-pinned from $SOURCE. Diff review + version bump per docs/contract.md next:"
git status --short schemas fixtures
