# Contributing to PortWatch

Issues and pull requests are welcome at [wiseqingyang/port-watch](https://github.com/wiseqingyang/port-watch).

## Setup

Use macOS or Linux, Node >=22.12.0, pnpm 9.14.4, and `lsof` / `ps` on PATH. Install dependencies with `pnpm install --frozen-lockfile`, then run `pnpm dev`. Open the private Vite URL printed by the backend. Never commit a session token.

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

## Release checklist

1. Review changes and the changelog; set the intended version in `package.json` (the CLI reads it automatically).
2. Confirm the declared platform/Node CI matrix is green and the official registry audit is clear.
3. Run `pnpm check` from a clean checkout. Review the `npm pack --dry-run` file list. `prepack` builds fresh assets; `prepublishOnly` also checks types, lint, and tests.
4. Confirm repository metadata, author email visibility, and documentation links. Preview screenshots using synthetic service data.
5. Publish the reviewed version from the correct npm account. This repository does not automatically publish on push.
6. Verify the released `npx @wiseqingyang/port-watch` from an unrelated directory and create the corresponding GitHub release.

