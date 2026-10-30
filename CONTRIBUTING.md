# Contributing to PortWatch

Issues and pull requests are welcome at [wiseqingyang/port-watch](https://github.com/wiseqingyang/port-watch).

## Setup

Use macOS or Linux, Node >=22.12.0, pnpm 9.14.4, and `lsof` / `ps` on PATH. Install dependencies with `pnpm install --frozen-lockfile`, then run `pnpm dev`. Open the private Vite URL printed by the backend. Never commit a session token.

Detailed CLI behavior and the local API live in the [reference](docs/reference.md) ([中文](docs/reference.zh-CN.md)).

## Structure

- `src/bin.ts`: executable entry, independent of the filename used by npm's symlink.
- `src/cli.ts`: CLI options, version, loopback listener, token generation, shutdown.
- `src/server.ts`: authentication, Host/Origin checks, API validation, scan coalescing, bundled assets.
- `src/scanner.ts`: visible TCP listeners, project metadata, display command redaction.
- `src/process-inspector.ts`: process identity and backend protection policy.
- `src/process-manager.ts`: single-process stop and shell-free file-manager invocation.
- `src/system.ts`: bounded system-tool execution and startup capability checks.
- `src/classifier.ts`: display-only classification rules.
- `src/types.ts`: shared API types, re-exported by the frontend.
- `frontend/src/`: React UI, session authentication, confirmation dialogs, polling.
- `tests/`: API, parser, process lifecycle, classification, and redaction regressions.
- `scripts/smoke-package.mjs`: actual npm pack/install/run verification outside the repository.

## Before submitting

Run `pnpm check` and `pnpm audit --registry=https://registry.npmjs.org`. The package smoke test downloads runtime dependencies to a temporary prefix and cleans it up. It does not publish or install anything into your normal global prefix.

Use dedicated disposable fixture processes for OS tests. Never signal arbitrary PIDs or process groups. A new mutation must authenticate first, validate inputs, check process identity and backend protection, and report permission and lifecycle errors truthfully. Do not introduce shell interpolation, network binding, automatic SIGKILL escalation, or execution of commands copied from `ps`.

Classification must prioritize executable/module evidence over path substrings or port numbers. Add a regression case for both the intended match and nearby false positives. A display classifier must not determine permission to terminate a process.

Maintain both READMEs when behavior or prerequisites change. The frontend uses strict TypeScript; avoid duplicating shared API interfaces. Do not commit `dist`, `node_modules`, tsbuildinfo files, local logs, or environment files.

## Releases

Releases run through [release.yml](.github/workflows/release.yml). Pushing a `vX.Y.Z` tag runs the macOS/Linux CI matrix, publishes to npm with provenance, verifies the published CLI, and creates a GitHub release with generated notes.

One-time npm setup: add a **GitHub Actions trusted publisher** for `@wiseqingyang/port-watch` with owner `wiseqingyang`, repository `port-watch`, and workflow filename `release.yml`. Leave the environment empty and allow direct publishing. No npm token is stored in GitHub.

1. Set the version in `package.json`; the CLI and dashboard read it automatically.
2. Run `pnpm check` and `pnpm audit --registry=https://registry.npmjs.org`. Review the package contents and use synthetic data in screenshots.
3. Commit and push to `main`, then tag that commit and push the tag:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

The tag must match `package.json` and point to a commit on `main`. If a step fails, fix the cause and rerun only the failed jobs; never move a published tag or reuse an npm version.
