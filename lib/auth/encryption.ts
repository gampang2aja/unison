import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM

function getEncryptionKey(): Buffer {
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY || "unison-fallback-development-key-32bytes-secret!";
  // Always derive a strict 32-byte (256-bit) buffer using SHA-256
  return crypto.createHash("sha256").update(rawKey).digest();
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 */
export function encrypt(plaintext: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext,
    iv: iv.toString("hex"),
    authTag,
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM and verify auth tag.
 * Throws if authentication fails or data is tampered.
 */
export function decrypt(data: EncryptedData): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(data.iv, "hex");
  const authTag = Buffer.from(data.authTag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(data.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Generate cryptographically secure random strings (for state, verifier, sessions).
 */
export function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(Math.ceil(length * 0.75)).toString("base64url").slice(0, length);
}

/**
 * PKCE SHA-256 Code Challenge Generator
 * S256: BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

