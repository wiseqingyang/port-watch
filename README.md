<div align="center">

# PortWatch

**A local TCP service dashboard for multi-project development.**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [Contributing](./CONTRIBUTING.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12.0-339933.svg)](https://nodejs.org/)

</div>

PortWatch shows which visible TCP listening processes belong to which projects. Browse them in a directory tree or flat list, filter by framework or port, inspect resource usage, open project directories, and stop a selected process with confirmation.

## Requirements

- **macOS or Linux**, with Node.js **22.12.0 or newer**.
- `lsof` and `ps` available on `PATH`. macOS normally includes both. On Debian/Ubuntu, install `lsof` and `procps` (`sudo apt install lsof procps`).
- A graphical desktop is needed only for opening a browser or file manager. Linux directory reveal uses `xdg-open` (usually provided by `xdg-utils`).
- Source development uses **pnpm 9.14.4**, recorded in `packageManager`.

Windows is not supported. Run PortWatch as your regular user, not with `sudo`; root-owned and other users' processes cannot be stopped through the dashboard.

## Get started

Run directly with npm:

```sh
npx @wiseqingyang/port-watch
# or
npm install --global @wiseqingyang/port-watch
port-watch
```

Build from source:

```sh
git clone https://github.com/wiseqingyang/port-watch.git
cd port-watch
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

To make the command available globally:

```sh
pnpm link --global
port-watch
```

PortWatch prints and normally opens a **private session URL**. Use that complete URL to access the dashboard. It contains a fresh token for the current process; do not share it. The browser removes the token fragment from the address bar and keeps it in this tab's session storage. When PortWatch restarts, reopen the newly printed URL.

## Features and boundaries

- Directory tree and flat views, search, sorting, light/dark themes, and English/Chinese UI.
- Heuristic recognition of common web frameworks, databases, developer tools, and AI services. Classification is a display aid, not a security decision.
- Project detection searches up to 12 directories from the process CWD for `package.json`, `.git`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `pom.xml`, `build.gradle`, `build.gradle.kts`, or `requirements.txt`.
- CPU, memory, owner, uptime, ports, working directory, and a display command with common credential patterns redacted.
- **Stop** sends `SIGTERM` to the selected process. If it remains alive, a separate confirmation offers **Force stop** (`SIGKILL`). There is no automatic escalation.
- Only the selected process is stopped. Children and process groups are not terminated. A supervisor may restart the process; a shared port may remain open through another process.
- **Automatic restart is unavailable.** An OS process listing cannot reliably reconstruct argument boundaries, environment variables, or a supervisor's startup configuration. Copying the displayed command does not produce a guaranteed restart command.
- Only TCP listeners visible to the current user are scanned. UDP sockets, non-listening processes, and stdio-only MCP servers are not included. Some process details may be unavailable due to OS permissions.

Automatic refresh pauses while the page is hidden. Concurrent API reads share a short-lived scan, and system commands have timeouts. These measures reduce unnecessary work; no zero-power or sleep behavior guarantee is made.

## CLI

```text
port-watch [options]

-V, --version        Show package version
-p, --port <number>  Dashboard port, 1–65535 (default: 4999)
--host <address>     127.0.0.1 or ::1 (default: 127.0.0.1)
-l, --lang <locale>  zh or en (otherwise follow browser preference)
--no-open            Print the session URL without opening a browser
--dev                Use the local Vite dashboard; intended for source development
-h, --help           Show help
```

If a port is occupied, PortWatch tries up to 100 subsequent ports, within the valid range. Development mode uses fixed API port 4999 and dashboard port 5175 and fails clearly if they are occupied. Non-loopback bind addresses are rejected.

## Security and privacy

All API endpoints require a per-start session token. Host and Origin checks restrict requests to the local dashboard; there is no wildcard CORS. Do not expose PortWatch through a reverse proxy, tunnel, or shared machine account. It is a local developer tool, not a remote administration service.

PortWatch reads local process and project metadata and does not intentionally upload it or include telemetry. The dashboard can show usernames, hostname, paths, project names, and command arguments. Credential redaction is **best effort**; review screenshots and copied commands before sharing. Package installation and opening external links are separate network activities.

Protected process checks run in the backend. Stop requests are revalidated against the current PID, owner, and start time. These checks reduce stale-process mistakes but cannot eliminate the small OS-level race between validation and sending a POSIX signal.

## Local development

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the private `http://127.0.0.1:5175/…#token=…` URL printed by the **backend**, rather than the bare URL printed by Vite. Vite proxies `/api` to `127.0.0.1:4999`; it never receives a token embedded in its source files. Restarting the backend rotates the token.

```sh
pnpm typecheck       # Backend, tests, frontend app, and Vite configuration
pnpm lint
pnpm test            # Unit and isolated OS/API regression tests
pnpm test:package    # Build, pack, install to a temporary prefix, test installed CLI
pnpm check          # All of the above
```

The package test accesses the official npm registry and deletes its temporary installation afterward. Tests signal only dedicated fixture processes, never arbitrary existing services. The CI matrix covers macOS/Linux with Node 22.12.0 and Node 24.

## Local API

Pass `Authorization: Bearer <session-token>` on every request, including health checks. A token must be taken from the current CLI session, not hardcoded. Mutation endpoints accept JSON and reject compressed request bodies.

| Method | Endpoint | Body / result |
| --- | --- | --- |
| GET | `/api/health` | Authenticated liveness check |
| GET | `/api/services` | Visible TCP services and summary; commands are redacted before transmission |
| POST | `/api/services/kill` | `{ "serviceId": "<id from latest scan>", "force": false }` |
| POST | `/api/services/reveal` | `{ "targetPath": "/absolute/path" }`; must be a directory in the current service tree |

The service ID binds a PID to its owner/start-time fingerprint. Arbitrary PID-only requests are rejected. Restart and batch-kill endpoints are not provided. A stop response's `code` is `STOPPED`, `ALREADY_EXITED`, or `STILL_RUNNING`; the last one has `success: false`. Errors use an HTTP error status and `{ "code", "error" }`.

## Troubleshooting

- **Session expired / unauthorized:** reopen the complete URL from the current terminal session. Each restart creates a new token.
- **Missing tools / scan failure:** install `lsof` and `ps`; check your regular user's process visibility. An explicit scan failure is not treated as an empty service list.
- **A process remains after Stop:** it may take longer to exit, ignore SIGTERM, or be restarted by a supervisor. Refresh first; use Force stop only if appropriate.
- **Port still occupied:** another process may share the listener or a child may remain. Inspect the updated list; stopping one PID does not prove a port is released.
- **Directory reveal fails:** verify the directory still exists and a graphical file manager is available.
- **No browser window:** use `--no-open` and open the printed URL manually on the same machine.

Report reproducible issues at [GitHub Issues](https://github.com/wiseqingyang/port-watch/issues), with sensitive paths and command arguments removed.

## License

[MIT](./LICENSE).
