# Local Proof setup

This is a local Windows setup of `EveryInc/proof-sdk` in `%TEMP%\proof-sdk`.

- The desktop launcher pins the existing portable Node 24 at `%USERPROFILE%\Downloads\My_Apps\node-v24.14.1-win-x64`; it only prepends that path inside the launcher process. Do not replace it or edit the machine/user PATH: the Pi harness uses this installation.
- A separate Node 22.23.3 runtime is installed at `%LOCALAPPDATA%\Programs\Proof\node-v22.23.3-win-x64` for isolated use. It does not replace or modify Node 24.
- This checkout locally upgrades `better-sqlite3` from `^12.6.2` to `^13.0.3`. v13 requires Node 22+ and ships its Windows x64 N-API binary in the npm package. Install with `npm install --ignore-scripts`; on Windows, npm may otherwise invoke `node-gyp` despite the bundled binary.
- The desktop launcher sets `COLLAB_EMBEDDED_WS=1`, persists `PROOF_COLLAB_SIGNING_SECRET` in `%LOCALAPPDATA%\Proof\collab-signing.key`, and stores SQLite data at `%LOCALAPPDATA%\Proof\proof-share.db` (outside Temp, so documents and collab tokens persist if Temp is cleaned).
- The API binds to `127.0.0.1` only. **Proof Editor** opens the scratch editor; **New Proof Document** creates a persistent shared document; **Stop Proof Editor** stops the local servers; **Export Proof to .md** dumps every ACTIVE document as clean markdown into `Documents\Proof Exports` (via `scripts/export-documents.mjs`, which reuses `stripAllProofSpanTags`).
- Agent onboarding: the server serves `/proof.SKILL.md` (localized to the request base URL) and `/agent-setup` (Web-first Quickstart with install commands for Claude Code, Codex, and generic skill dirs). The pi skill is installed at `~/.agents/skills/proof/SKILL.md`, so future pi sessions can collaborate via the local API (`http://127.0.0.1:4000`) without setup.
- Test-suite gate: `runServerHookTests` probes `/install-hooks.sh` (hosted-only) instead of `/agent-setup` (now part of the SDK surface), so the hosted-deployment block skips deterministically on SDK servers — with or without services running.
- To invite an agent: share the document URL (`http://127.0.0.1:3000/d/<slug>?token=<token>`). The token in the URL is the auth; the agent sends `Authorization: Bearer <token>` + `X-Agent-Id: ai:<name>` and writes with `"by":"ai:<name>"`. Tokens are stored hashed (`document_access.secret_hash`), so export tooling must read content from the DB, not recover tokens.
- Keep `dist/assets/editor.js` built: `/d/:slug` share pages load the compiled editor bundle from `dist`.

## Lessons learned

- Windows `%TEMP%` is `%LOCALAPPDATA%\Temp` here; MSYS bash's `/tmp` is a different directory. Resolve the Windows path with PowerShell `$env:TEMP`.
- `better-sqlite3@12.11.1` attempted a GitHub prebuild download; the full GET was blocked with HTTP 403 by the corporate web filter, and no Visual C++ Build Tools are installed. A HEAD response was not sufficient. Do not retry the blocked asset or weaken integrity checks: use the official npm-distributed v13 package. Its full 11,402,131-byte tarball matched the registry SHA-512 integrity `sha512-RbOBxmLBG8uvFUc15X9+9SFemKcQ0WBuISBVkpuiaUB2qblC8UWlHEjdWVoZ8AdhSwmoEgsiXKfopX0CQxaACQ==`, and includes `prebuilds/win32-x64.node`.
- WSL's current mirrored network configuration timed out on IPv4 loopback self-connections and Windows-to-WSL requests. The app now runs natively on Windows, so WSL networking was left unchanged; don't switch its global mode unless a future task actually needs WSL hosting.
- `scripts/finalize-web-build.mjs` used URL pathname parsing that produced an invalid `C:\C:\...` path on Windows. It now uses `fileURLToPath(import.meta.url)`.
- The server originally did not serve `dist`; `/d/:slug` returned agent-facing HTML but the editor bundle 404'd. `server/index.ts` now serves `dist` after `public`, and a production bundle is required for shared-document routes.
- Prism components mutate a shared global; parallel `Promise.all` imports could load C++ before `clike`, causing a caught syntax-highlighting error. Load components sequentially; Playwright then reported no browser-console errors.
- The root editor is a scratch surface; it does not persist edits. Use `New-Proof-Document.ps1` (or the desktop shortcut) to create an API-backed shared document that auto-saves to the local SQLite DB.
- The hosted homepage's "Leave .md files behind" heading is a use-case pitch (stop working in loose .md files), not a claim that Proof writes .md files to disk. Canonical content lives in `document_projections.markdown`; the export script is how .md files actually reach the filesystem.
- The hosted-only telemetry route `/api/metrics/mark-anchor` 404s on this SDK snapshot when marks render in the browser; it is harmless console noise, not a collaboration failure.
- A template literal containing markdown backticks breaks esbuild parsing (`Expected ")" but found ...`). In served markdown pages, use indentation or quotes, or escape every backtick as `\\``.
- Set `COLLAB_EMBEDDED_WS=1`: without embedded mode the local editor advertises a WebSocket on the wrong port. Persist a signing secret too; otherwise every server restart invalidates signed collaboration sessions.
