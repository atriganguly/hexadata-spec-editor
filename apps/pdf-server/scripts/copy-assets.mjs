// Copies the shipped template images next to the bundle so `node dist/main.js` works from any folder.
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../../../packages/templates/src/assets/', import.meta.url));
const to = fileURLToPath(new URL('../dist/assets/', import.meta.url));
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`Copied template assets to ${to}`);
