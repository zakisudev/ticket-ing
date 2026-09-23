import { randomBytes } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

/** Argon2id baseline: ~19 MiB memory, 3 passes, one lane. */
export const ARGON2_PARAMS = {
  memoryCost: 19_456,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
} as const;

/**
 * Produces a standard PHC-encoded Argon2id hash. The format and parameters are
 * compatible with hashes created by the previous native `argon2` dependency.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: randomBytes(ARGON2_PARAMS.saltLength),
    parallelism: ARGON2_PARAMS.parallelism,
    iterations: ARGON2_PARAMS.timeCost,
    memorySize: ARGON2_PARAMS.memoryCost,
    hashLength: ARGON2_PARAMS.hashLength,
    outputType: 'encoded',
  });
}

/** Invalid or corrupted stored hashes fail closed instead of surfacing details. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ hash, password });
  } catch {
    return false;
  }
}
