# AGENTS.md: HexaData Spec Editor (maintainer guide for humans and AI agents)

This file is canonical. `CLAUDE.md` imports it. Machine guardrails back the rules (`.claude/hooks/guard.mjs`, `.claude/settings.json`, ESLint, tests, CI), but read the rules anyway.

## What this repo is

A template-driven editor for HexaData A4 specification sheets. People edit a sheet in the browser (drafts saved locally, unlimited), pick a template, and export a print-ready PDF rendered by a hardened server. It is built on the official brand system, `@hexadata/brand`, and must stay fast, accessible and safe to expose to a team.

## Repo map

| Path                    | What                                                                                                         | Edit by hand?                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `packages/core`         | Content model: rich text, valibot schema, limits, migrations, image header checks. No DOM, no React.         | Yes (see "Changing the content model") |
| `packages/templates`    | Template registry, **slots**, print renderer, the Classic template (`src/classic/`), shipped images.         | Yes (see `docs/templates.md`)          |
| `apps/pdf-server`       | Fastify + Puppeteer renderer: validation, sandboxed browser pool, PDF metadata, optional static web hosting. | Yes                                    |
| `apps/web`              | The editor (React 19, Vite 8, Tailwind 4, zustand/immer, IndexedDB drafts, PWA).                             | Yes                                    |
| `e2e`                   | Playwright tests against the production builds (accessibility, drafts, export, editor/PDF parity).           | Yes                                    |
| `scripts`               | Performance budgets, brand update, asset optimiser.                                                          | Yes                                    |
| `vendor/*.tgz`          | The vendored `@hexadata/brand` package.                                                                      | **No**: `npm run brand:update`         |
| `apps/web/public/brand` | Logo files copied from the brand package by `apps/web/scripts/sync-brand.mjs`.                               | **No**: generated, git-ignored         |
| `package-lock.json`     | Lockfile.                                                                                                    | **No**: use npm                        |
| `**/dist`, `.cache`     | Build output / downloaded Chrome.                                                                            | Never                                  |

## The architecture in one paragraph

**One React template component renders both the editor and the PDF.** Templates place content only through slot components (`Text`, `Features`, `SpecTable`, `ProductImage`, `PartnerLogos`, `BrandLogo` in `packages/templates/src/slots.tsx`). Slots read the sheet from context: in `edit` mode the editor injects an editable text cell and adds `data-edit-*` attributes; in `print` mode the server renders the same tree with static, escaped cells. The box model is identical, so what you see is what you print (`e2e/parity.spec.ts` proves it at pixel level). Content is **data, not HTML**: rich text is `Line[] > Run[]` with only bold/italic/underline marks, validated by one schema shared by the editor, draft import and the server.

## Hard rules (never break)

1. **Never invent, infer or "improve" a brand value** (colour, font, tagline, logo, spacing, radius). Source: `@hexadata/brand` (tokens, `.hd-*` components, logos) and its rules (`brand/contrast.json` in the brand repo). Style application chrome with **roles** (`--hd-bg`, `--hd-fg`, `--hd-accent`, ...). Raw palette tokens (`--hd-cyan`, ...) are allowed only in template CSS, because a printed sheet is fixed light "paper" in both themes. Only allowed contrast pairs; never white text on cyan. ESLint enforces no hex/rgb colours and no Tailwind palette classes in `src/`.
2. **Templates use slots only.** No editor UI, `contentEditable`, handlers or `mode` checks in template markup; no content read directly from props to render text. Conditional layout must behave the same in both modes (see `data-hd-flow` / `data-hd-fixed` for overflow checks).
3. **User content never becomes markup.** No `dangerouslySetInnerHTML`, no string-built HTML from content, anywhere. The only string renderer is `richTextToHtml` (escapes; tested against the React renderer). Pasted HTML is reduced through `domToRichText`.
4. **The renderer has no network.** `apps/pdf-server/src/sandbox.ts` answers every browser request from memory and aborts the rest; the print document carries a CSP with `script-src 'none'`. Never add `--disable-web-security`, never allow another origin, never load fonts or images from the internet (add them to the in-memory file map instead).
5. **Limits live in `packages/core/src/limits.ts`.** The UI, the schema, draft import and the server all read them. Change them there, nowhere else.
6. **Content model changes need a version bump, a migration and tests** (see below). Never change the meaning of stored data silently.
7. **IndexedDB changes need a `DB_VERSION` upgrade path.** Never delete user data silently: deletes go to the trash first, purge only after the retention window, permanent deletes need an explicit confirmation.
8. **Strict CSP in the web app** (`style-src 'self'`, `script-src 'self'`): no inline `<script>`, no `style=` attributes in HTML, no `eval`. React `style` props are fine (CSSOM). Formatting commands must use tags: `document.execCommand('styleWithCSS', false, 'false')` is set on focus; do not remove it.
9. **Performance budgets are a gate** (`npm run budgets`): initial JS <= 130 KB gzip, CSS <= 30 KB gzip, no embedded image over 2 KB, no image asset over 250 KB. New heavy code must be lazy (`import()`); new runtime dependencies need a reason.
10. **No secrets in the repo.** `.env*` is git-ignored; never read, print or commit keys.
11. **Outward-facing actions need the owner's explicit go-ahead in that session:** `git push`, tags, releases, GitHub/Render settings or secrets, Pages changes, publishing images. Never force-push.
12. **Brand assets are proprietary** (HexaData names, logos, taglines). Never relicense, never copy them outside `@hexadata/brand` / `apps/web/public/brand` / the shipped template images.

## Recipes

**Add a template.** Follow `docs/templates.md`. In short: new folder `packages/templates/src/<id>/` (entry, module, component, `styles.css`, defaults), one line in `src/registry.ts`, tests, update the guide if you changed the slot API.

**Change the content model.** (1) Edit the valibot schema in `packages/core/src/schema.ts`; (2) bump `SCHEMA_VERSION`; (3) append a migration in `migrations.ts` (`migrations[n]` upgrades version n to n+1); (4) add a fixture test in `packages/core/test/migrations.test.ts`; (5) update defaults, slots and the editor store as needed; (6) check `.hxspec` import of old files still works (`apps/web/test/hxspec.test.ts`).

**Add a limit or field.** Put the constant in `limits.ts`, use it in the schema, in `apps/web/src/editor/cells.ts` (UI limits) and in tests. The server needs no change: it validates with the same schema.

**Update the brand package.** `npm run brand:update -- <version> [tarball-or-url]`, then `npm install`, `npm run check`, and review the editor in light and dark. Brand changes are visual changes: the template contrast test (`packages/templates/test/classic.test.tsx`) must stay green.

**Optimise or replace a shipped image.** Put the source in `packages/templates/src/assets/`, adjust and run `node scripts/optimize-assets.mjs` (sharp), keep files under the budget, register new ids in `src/assets.ts`.

**Release / deploy.** Merge to `main`; CI runs; `pages.yml` publishes the web app after green CI; Render redeploys the engine (`autoDeployTrigger: checksPass`). The owner performs pushes, tags and settings changes.

## Commands (Node 26; on the maintainer's Windows machine activate with `fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression; fnm use 26`)

| Command                                       | What                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm install`                                 | Installs everything, including the renderer's headless Chrome (`.cache/puppeteer`). |
| `npm run dev`                                 | Web on :5173 and PDF server on :3001 (rebuilds on change).                          |
| `npm run lint` / `format:check` / `typecheck` | ESLint 9 (brand rules, a11y, hooks), Prettier, `tsc` for every workspace.           |
| `npm test`                                    | Vitest, all workspaces (the server tests drive real headless Chrome).               |
| `npm run build`                               | Web (`apps/web/dist`) + server bundle (`apps/pdf-server/dist`).                     |
| `npm run budgets`                             | Performance budgets (after `build`).                                                |
| `npm run smoke -w @hexadata/spec-pdf-server`  | Boots the production server bundle and renders a PDF (after `build`).               |
| `npm run test:e2e`                            | Playwright against the production builds (needs `npx playwright install chromium`). |
| `npm run check`                               | lint, format, typecheck, test, build, budgets. Run before saying "done".            |
| `npm run brand:update -- <version>`           | Replace the vendored brand package.                                                 |

## Testing map

- `packages/core/test`: schema, limits, migrations, rich text, image header checks.
- `packages/templates/test`: registry, defaults factory, print rendering, escaping, edit/print structure equality, brand-discipline checks on the CSS.
- `apps/pdf-server/test`: config, API contract (limits, CORS, rate limit, 503/504), sandbox (hostile HTML), PDF structure and metadata, rendered colours.
- `apps/web/test`: store (undo/redo, coalescing, Reset regression), IndexedDB drafts, session/autosave/locks, `.hxspec` import/export, export client, DOM to rich text.
- `e2e`: real browser, production builds: editing, drafts, export, dialogs (every dialog must reopen after closing), axe (WCAG 2.2 AA, light/dark, 3 widths), editor vs PDF pixel parity.

## Pitfalls seen in this repo

- A stray `vite.config.js` shadows `vite.config.ts`. There must be exactly one config.
- React 19 prepends `<link rel="preload" as="image">` to static markup; `stripPreloadHints` in `print.tsx` removes it.
- `?inline` CSS imports return `''` in Vitest unless `css: true` is set in that project's config (the server and templates configs set it).
- Chrome's `execCommand('bold')` writes inline styles unless `styleWithCSS` is false; the CSP then blocks them silently.
- Title, subtitle and spec labels are bold by design; toggling bold there is a no-op (use a regular-weight field in tests).
- `fake-indexeddb` tests run in the Node environment (real `Blob`); only DOM-parsing tests opt into `happy-dom`.
- Docker is not installed on the maintainer's machine: the image is verified by CI only.
- Dialogs (`apps/web/src/ui/Dialog.tsx`) wrap the native `<dialog>`. Close through `onClose` (app state), never rely on the native `close` event reaching React, and never call `dialog.close()` in effect cleanup (StrictMode re-runs it and dismisses the dialog). `Dialogs.tsx` keys every open with `dialogSeq` so a stale, already-closed dialog is never reused.
- `navigator.storage.persist()` is the browser's decision and is often denied silently; the UI must always report the answer.
- In the editor tests, screenshot coordinates are in the screenshot's own space, not the emulated viewport.

## Definition of done

`npm run check` and `npm run test:e2e` pass, no budget regression, docs updated (README/AGENTS/templates guide when behaviour or architecture changed), and anything needing the owner (pushing, deploying, settings, new brand values) is listed for them rather than done.
