const RTF = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['week', 7 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000],
];

/** "2 hours ago", "yesterday", "just now". */
export function timeAgo(timestamp: number, now = Date.now()): string {
  const diff = timestamp - now;
  if (Math.abs(diff) < 45_000) return 'just now';
  for (const [unit, ms] of STEPS) {
    if (Math.abs(diff) >= ms || unit === 'minute') return RTF.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    timestamp,
  );
}

/** Days until `deletedAt + retentionMs`, never negative. */
export function daysLeft(deletedAt: number, retentionMs: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deletedAt + retentionMs - now) / (24 * 3600_000)));
}
