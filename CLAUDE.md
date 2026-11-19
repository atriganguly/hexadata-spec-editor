@AGENTS.md

# CLAUDE.md

AGENTS.md is canonical and binding; the hooks in `.claude/` enforce parts of it (generated files, the vendored brand package, lockfile, secrets and build output are blocked).

- Use plan mode first for anything that changes the content model, the template/slot API, the renderer's sandbox or CORS policy, the IndexedDB schema, brand usage, or deployment.
- Ask before any outward-facing action (push, tag, release, publish, GitHub/Render settings, Pages). Never force-push.
- Use the official brand system for every visual decision: tokens, `.hd-*` components, `@hexadata/brand/react`. If a value is missing, stop and ask; do not invent it.
- Node comes from fnm. In PowerShell: `fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression; fnm use 26` before running npm. Pass file edits through the Edit/Write tools rather than shell heredocs (backslash escapes such as `​` get mangled).
- When you change UI, verify it in a browser (dev server: `.claude/launch.json` has `web` and `pdf-server` entries; the server entry needs `npm run build -w @hexadata/spec-pdf-server` first). Screenshot coordinates are in the screenshot's own space.
- Finish with `npm run check` and, for anything user-visible, `npm run test:e2e`. Report honestly what was not verified (Docker builds only run in CI).
