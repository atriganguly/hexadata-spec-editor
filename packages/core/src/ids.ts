/** Stable id for list items and rows (React keys, reordering). */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
