/**
 * MySQL DATETIME columns are stored as naive strings in UTC.
 * These helpers keep conversion consistent in both directions.
 */
export function toMysqlDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Parses a DB datetime string ('YYYY-MM-DD HH:MM:SS', UTC) into an ISO string. */
export function dbDatetimeToIso(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(`${normalized}${normalized.endsWith('Z') ? '' : 'Z'}`).toISOString();
}
