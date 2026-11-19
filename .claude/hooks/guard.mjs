// PreToolUse guard for Claude Code (and anything that honours the same hook contract).
// Exit code 2 = block, with the reason on stderr. Set HEXA_ALLOW_PROTECTED=1 only when the owner explicitly asked.
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let event;
try {
  event = JSON.parse(input);
} catch {
  process.exit(0); // not our contract: never block on parse problems
}
const target = event?.tool_input?.file_path ?? event?.tool_input?.notebook_path;
if (typeof target !== 'string' || process.env.HEXA_ALLOW_PROTECTED === '1') process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const abs = resolve(root, target);
const rel = relative(root, abs).split('\\').join('/');
const block = (why) => {
  console.error(
    `BLOCKED by .claude/hooks/guard.mjs: ${rel}\n${why}\nSee AGENTS.md. Set HEXA_ALLOW_PROTECTED=1 for one edit only if the owner explicitly asked.`,
  );
  process.exit(2);
};

if (/\.(jwk|pem|key)$/i.test(rel) || /(^|\/)\.env(\.|$)/.test(rel))
  block('Secrets and environment files are never read, written or edited by agents.');
if (/^vendor\/.*\.tgz$/.test(rel))
  block(
    'The brand package is replaced with `npm run brand:update -- <version>`, never edited by hand.',
  );
if (
  /^(dist|node_modules|playwright-report|test-results|\.cache)\//.test(rel) ||
  /(^|\/)(dist|dev-dist)\//.test(rel)
)
  block('Build output: change the source and rebuild.');
if (rel === 'apps/web/public/brand' || rel.startsWith('apps/web/public/brand/'))
  block(
    'Generated from @hexadata/brand by apps/web/scripts/sync-brand.mjs. Never edit brand assets by hand.',
  );
if (rel === 'package-lock.json')
  block('Change dependencies with npm (npm install / npm uninstall), not by editing the lockfile.');
if (existsSync(abs)) {
  const head = readFileSync(abs, 'utf8').slice(0, 600);
  if (head.includes('GENERATED FILE'))
    block('This file is generated. Edit its source and regenerate it.');
}
process.exit(0);
