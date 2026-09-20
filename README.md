# Elyseum CLI

A command-line coverage engine: total and diff coverage from LCOV reports,
reporters for terminals, Markdown and GitHub pull requests, and quality gates.
Part of the [Elyseum](https://github.com/Dragonshorn-Studios/elyseum) suite —
used directly or through the
[elyseum-coverage-reporter-action](https://github.com/Dragonshorn-Studios/elyseum-coverage-reporter-action).

## Installation

The canonical npm package is `@dragonshorn-studios/elyseum-cli`:

```bash
npm install -g @dragonshorn-studios/elyseum-cli
```

Requires Node >= 20.

## Commands

### `diff-coverage`

Computes coverage for changed lines between two refs (or an explicit changed-file list) and reports it.

| Option | Default | Description |
| --- | --- | --- |
| `--diff-coverage.base` | `origin/main` (or `origin/$GITHUB_BASE_REF`) | Base branch/SHA |
| `--diff-coverage.head` | `HEAD` (or `$GITHUB_SHA`) | Head branch/SHA |
| `--diff-coverage.dynamic` | | Set to `gh` to resolve the base SHA from the GitHub pull request |
| `--diff-coverage.changed-files` | | Comma-separated file list; skips git entirely |
| `--diff-coverage.lcov-path` | `coverage/lcov.info` | LCOV report location |

### `coverage`

Aggregated coverage over the whole report.

| Option | Default | Description |
| --- | --- | --- |
| `--coverage.lcov-path` | `coverage/lcov.info` | LCOV report location |

### Reporters

- `--reporter.coverage cli-table,markdown-table,github-pr-comment` (comma separated)
- `--reporter.coverage.details` — per-file breakdown
- `--reporter.coverage.quality-gate <n>` — changed-line coverage below `n` warns
- `--reporter.coverage.quality-gate-fail <n>` — coverage at or below `n` fails the command (exit 1)

## Configuration (`.elyseum.yml`)

Precedence: CLI arguments (when explicitly given) beat the environment
block, which beats the default block. Keys use the same names as the CLI
options (nested with dots flattened):

```yaml
default-environment: auto

config:
  coverage:
    lcov-path: coverage/lcov.info
  diff-coverage:
    base: origin/main

environments:
  github:
    reporter:
      coverage:
        quality-gate: 80
        quality-gate-fail: 50
  local: {}
```

Validation lists every schema violation and exits with code 2. Note that a
changed-file list given without a diff counts **every** coverable line of
the listed file as changed — gates are therefore stricter in that mode.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | A configured quality gate failed |
| 2 | Invalid configuration |
| 3 | No git repository found (and no explicit changed-file list) |
| 4 | LCOV report not found |
| 5 | Any other calculation or runtime error |

## Input adapters (`emit-envelope`)

Adapters translate tool-specific reports into the versioned v1 envelope
(pinned from the host: `schemas/envelope.v1.json`). Format selection is
explicit — no auto-detection.

| Option | Values | Reads |
| --- | --- | --- |
| `--emit-envelope.tests-format` | `vitest-json` \| `junit` \| `go-test-json` | test report |
| `--emit-envelope.tests-input` | path or `-` (stdin) | test report |
| `--emit-envelope.coverage-format` | `lcov` \| `clover` \| `go-coverprofile` | coverage report |
| `--emit-envelope.coverage-input` | path or `-` (stdin) | coverage report |

Example (Vitest + LCOV, i.e. Maomao):

```bash
elyseum-cli emit-envelope \
  --emit-envelope.tests-format vitest-json \
  --emit-envelope.tests-input tests/vitest.json \
  --emit-envelope.coverage-format lcov \
  --emit-envelope.coverage-input coverage/lcov.info \
  --emit-envelope.out envelope.json
```

Marller (Go): `--emit-envelope.tests-format go-test-json` with
`go test -json ./...` output, and `--emit-envelope.coverage-format
go-coverprofile` with `go test -coverprofile`. Laravel:
`--emit-envelope.tests-format junit` with `--log-junit` output and
`--emit-envelope.coverage-format clover` with `--coverage-clover`.

Semantics:

- Missing metrics are `null`/unknown, never zero (Go coverage provides no
  function/branch data — those stay null).
- Coverage absence does not invalidate test facts: with no coverage input,
  the `coverage` section is omitted.
- Failed tests, coverage files, names, paths and messages are bounded
  (500 failed tests, 2000 files, 2048-char messages) before serialization.
- XML is parsed without external entity or DTD resolution; input is never
  executed.
- Malformed or truncated input fails with exit code 5 and an actionable
  diagnostic.
- Provenance (formats, CLI version) is recorded in the envelope's
  `provenance` field.

## Behavior notes

- Percentages are always finite: a metric with zero eligible items (zero
  changed lines, zero coverable lines, zero branches) reports 100%, never NaN.
- Only added lines (`+`) count as changed; removed lines, context lines, and
  comment-only/blank additions are excluded.
- File paths are compared with leading slashes stripped.
- Supported Node versions: >= 20 (CI tests Node 20 and 22).

## Development

```bash
npm install
npm run build     # rollup bundle into dist/
npm test          # vitest unit + integration suites
npm run pack:smoke  # npm pack + run the packed binary
npm run ci        # build + test + pack smoke
```

Integration tests run the built CLI against a real fixture git repository and
LCOV files; the pack smoke test verifies the published tarball contains the
executable with its shebang.

## Repository roles

| Repository | Role |
| --- | --- |
| [elyseum] | Host: users/projects/authz, ingest API, CI history UI. Source of truth for the versioned CI result envelope. |
| [elyseum-cli] (this repo) | Producer CLI: reads local CI artifacts and emits the versioned envelope. |
| [elyseum-coverage-reporter-action] | Thin GitHub Action wrapping this CLI; optional upload to Elyseum. |

[elyseum]: https://github.com/Dragonshorn-Studios/elyseum
[elyseum-cli]: https://github.com/Dragonshorn-Studios/elyseum-cli
[elyseum-coverage-reporter-action]: https://github.com/Dragonshorn-Studios/elyseum-coverage-reporter-action
