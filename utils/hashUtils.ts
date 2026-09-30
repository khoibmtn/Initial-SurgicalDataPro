// ─── Hash Utilities ───────────────────────────────────────────────────────────
// SHA-256 hash + salt cho mật khẩu cấu hình (Web Crypto API)

const HASH_PREFIX = 'sha256:';

/** Generate a random 16-byte hex salt */
export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Convert ArrayBuffer to hex string */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Hash password with SHA-256 + salt */
export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const actualSalt = salt || generateSalt();
  const data = new TextEncoder().encode(password + actualSalt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashHex = bufferToHex(hashBuffer);
  return { hash: `${HASH_PREFIX}${actualSalt}:${hashHex}`, salt: actualSalt };
}

/** Verify password against stored hash */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Handle legacy plain-text passwords (migration)
  if (!storedHash.startsWith(HASH_PREFIX)) {
    return password === storedHash;
  }

  // Parse stored hash: "sha256:<salt>:<hash>"
  const withoutPrefix = storedHash.slice(HASH_PREFIX.length);
  const colonIndex = withoutPrefix.indexOf(':');
  if (colonIndex === -1) return false;

  const salt = withoutPrefix.slice(0, colonIndex);
  const expectedHash = withoutPrefix.slice(colonIndex + 1);

  const data = new TextEncoder().encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const actualHash = bufferToHex(hashBuffer);

  return actualHash === expectedHash;
}

/** Check if a stored value is a hashed password (vs plain-text) */
export function isHashedPassword(value: string): boolean {
  return value.startsWith(HASH_PREFIX);
}
