# Elyseum CLI

> **Notice:** This is a work-in-progress personal package. Use at your own risk.

Elyseum CLI is a command-line tool for coverage reporting. It provides various reporters to display coverage information in different formats.

## Installation

You can install the package globally using npm:

```bash
npm install -g @dragonshorn/elyseum-cli
```

## Usage

### Commands

- `diff-coverage`: Calculate coverage for changed files.
- `coverage`: Calculate coverage for all files.

### Options

- `--reporter.coverage`: Coverage reporter(s), separated by commas. Available reporters: `cli-table`, `github-pr-comment`.
- `--reporter.coverage.colors`: Use colors in coverage reporter (if supported).
- `--reporter.coverage.details`: Show coverage details.
- `--reporter.coverage.quality-gate`: Coverage quality gate.

### Examples

#### Calculate Coverage for Changed Files

```bash
elyseum-cli diff-coverage --head <HEAD_COMMIT> --base <BASE_COMMIT>
```

#### Calculate Coverage for All Files

```bash
elyseum-cli coverage
```

#### Use Multiple Reporters

```bash
elyseum-cli diff-coverage --reporter.coverage=cli-table,github-pr-comment
```

#### Use Colors in Coverage Reporter

```bash
elyseum-cli diff-coverage --reporter.coverage.colors
```

#### Show Coverage Details

```bash
elyseum-cli diff-coverage --reporter.coverage.details
```

#### Set Coverage Quality Gate

```bash
elyseum-cli diff-coverage --reporter.coverage.quality-gate=80
```

## Configuration

You can also configure the CLI using a `.elyseum.yml` file. Here is an example configuration:

```yaml
reporter:
  coverage:
    cli-table:
      color: true
      diff: true
    github-pr-comment:
      file: "github.pr.coverage.md"
qualityGate: 80
```

## License

This project is licensed under the MIT License.