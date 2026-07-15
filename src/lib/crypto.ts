/**
 * Flowora — AES-256-GCM encryption for BYOK secrets stored in DB.
 * Used by channel_connections.secrets_enc and integrations.
 *
 * ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes).
 * Generate with: openssl rand -hex 32
 */

const ALG = 'AES-GCM'
const IV_LEN = 12  // 96-bit IV for GCM
const TAG_LEN = 16 // 128-bit auth tag

function getKey(): Promise<CryptoKey> {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw || raw.length < 32) {
    throw new Error('ENCRYPTION_KEY env var must be at least 32 chars')
  }
  // Use first 32 bytes of the key
  const bytes = Buffer.from(raw.slice(0, 64), 'hex')
  return crypto.subtle.importKey('raw', bytes, ALG, false, ['encrypt', 'decrypt'])
}

/**
 * Encrypt a plaintext string → base64url string (iv + ciphertext + tag).
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const encoded = new TextEncoder().encode(plaintext)
  const cipherBuffer = await crypto.subtle.encrypt({ name: ALG, iv, tagLength: TAG_LEN * 8 }, key, encoded)
  // Concat IV + ciphertext+tag
  const result = new Uint8Array(IV_LEN + cipherBuffer.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(cipherBuffer), IV_LEN)
  return Buffer.from(result).toString('base64url')
}

/**
 * Decrypt a base64url string (iv + ciphertext + tag) → plaintext string.
 */
export async function decrypt(ciphertext: string): Promise<string> {
  const key = await getKey()
  const data = Buffer.from(ciphertext, 'base64url')
  const iv = data.subarray(0, IV_LEN)
  const cipherData = data.subarray(IV_LEN)
  const plainBuffer = await crypto.subtle.decrypt({ name: ALG, iv, tagLength: TAG_LEN * 8 }, key, cipherData)
  return new TextDecoder().decode(plainBuffer)
}

/**
 * Encrypt a JSON object (channel secrets, integration tokens, etc.).
 */
export async function encryptJSON(obj: Record<string, unknown>): Promise<string> {
  return encrypt(JSON.stringify(obj))
}

/**
 * Decrypt back to a typed JSON object.
 */
export async function decryptJSON<T = Record<string, unknown>>(ciphertext: string): Promise<T> {
  const plain = await decrypt(ciphertext)
  return JSON.parse(plain) as T
}
