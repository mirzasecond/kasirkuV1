import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// Password hashing using Node's built-in crypto.scrypt (no external deps).
// Format: scrypt$<saltHex>$<hashHex>
const KEYLEN = 64;

export function hashPassword(plain: string): string {
  if (!plain || typeof plain !== 'string') throw new Error('Password tidak valid');
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verify a plain password against a stored hash.
 * Supports the new scrypt format. Returns false for anything unrecognized
 * (legacy plaintext hashes are handled separately by the caller).
 */
export function verifyPassword(plain: string, stored: string): boolean {
  if (!plain || !stored) return false;
  if (!stored.startsWith('scrypt$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = scryptSync(plain, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function isHashed(stored: string): boolean {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}
