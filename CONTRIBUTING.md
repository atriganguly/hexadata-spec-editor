# Contributing

Thanks for helping. The canonical rules live in [AGENTS.md](AGENTS.md) (they apply to people and AI agents alike);
this page is the short version.

## Setup

Node 26 (`.node-version`). On Windows use [fnm](https://github.com/Schniz/fnm).

```bash
npm install                      # also downloads the renderer's headless Chrome
npx playwright install chromium  # once, for the end-to-end tests
npm run dev                      # editor on :5173, PDF engine on :3001
```

## Before you open a pull request

```bash
npm run check      # lint, format, typecheck, unit tests, build, performance budgets
npm run test:e2e   # real browser against the production builds
```

Both must pass, and CI runs them again.

## Ground rules

- **Brand:** never invent a colour, font, tagline or logo. Use `@hexadata/brand` tokens, `.hd-*` components and the
  contrast-checked roles. ESLint rejects hex/rgb colours and Tailwind palette classes.
- **Templates use slots only** (see [docs/templates.md](docs/templates.md)); user content never becomes markup.
- **Limits** live in `packages/core/src/limits.ts` only.
- **Content model changes** need a schema version bump, a migration and a fixture test.
- **IndexedDB changes** need a `DB_VERSION` upgrade path; never delete user data silently.
- **Performance budgets** are a gate (`npm run budgets`); heavy code must be lazy-loaded.
- **No generated or vendored files by hand:** `vendor/*.tgz` (use `npm run brand:update`), `apps/web/public/brand`,
  `package-lock.json` (use npm), `dist/`.
- **No secrets** in the repository.

## Pull requests

Keep them focused, describe what changed and how you verified it, and add or update tests and docs with the change.
Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`, `docs:`,
`chore:`, `test:`, `refactor:`).

## Reporting problems

Bugs and ideas: open an issue. Security problems: see [SECURITY.md](SECURITY.md).
