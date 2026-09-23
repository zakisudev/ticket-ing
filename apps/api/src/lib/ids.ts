import { createHash, randomUUID } from 'node:crypto';

/**
 * UUIDv4 via Node crypto (CHAR(36) primary keys).
 * Kept simple and collision-safe; ordering value comes from created_at columns.
 */
export function newId(): string {
  return randomUUID();
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
