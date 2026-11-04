import { describe, it, expect } from "vitest";
import { encrypt, decrypt, generateCodeChallenge, generateRandomString } from "@/lib/auth/encryption";
import { signSession, verifySession } from "@/lib/auth/session";
import { SpotifyAuthSession } from "@/types";

describe("Authentication & Cryptography Module", () => {
  it("should encrypt and decrypt access tokens accurately with AES-256-GCM", () => {
    const rawToken = "BQB7_SpotifyAccessTokenExample1234567890_VerySecret";
    const encrypted = encrypt(rawToken);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toHaveLength(24); // 12 bytes in hex = 24 chars
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes in hex = 32 chars

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(rawToken);
  });

  it("should fail decryption when ciphertext or auth tag is tampered with", () => {
    const rawToken = "sample-token";
    const encrypted = encrypt(rawToken);

    // Tamper with ciphertext
    const tampered = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.slice(0, -2) + "ff",
    };

    expect(() => decrypt(tampered)).toThrow();
  });

  it("should generate standard PKCE S256 code challenge from verifier", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = generateCodeChallenge(verifier);

    expect(challenge).toBeDefined();
    expect(typeof challenge).toBe("string");
    // Verify base64url format (no +, /, or =)
    expect(challenge).not.toMatch(/[+/=]/);
  });

  it("should generate random secure strings of specified length", () => {
    const s = generateRandomString(32);
    expect(s).toHaveLength(32);
  });

  it("should securely sign and verify user sessions", () => {
    const session: SpotifyAuthSession = {
      userId: "user-123",
      spotifyUserId: "spotify_user_456",
      displayName: "Test User",
      product: "premium",
      avatarUrl: "https://example.com/avatar.jpg",
      expiresAt: Date.now() + 3600 * 1000,
    };

    const signedToken = signSession(session);
    expect(signedToken).toContain(".");

    const verified = verifySession(signedToken);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe("user-123");
    expect(verified?.displayName).toBe("Test User");
    expect(verified?.product).toBe("premium");
  });

  it("should reject tampered or expired session cookies", () => {
    const session: SpotifyAuthSession = {
      userId: "user-123",
      spotifyUserId: "spotify_user_456",
      displayName: "Test User",
      product: "premium",
      avatarUrl: null,
      expiresAt: Date.now() - 1000, // already expired
    };

    const expiredToken = signSession(session);
    const verifiedExpired = verifySession(expiredToken);
    expect(verifiedExpired).toBeNull();

    // Tampered token signature
    const validSession: SpotifyAuthSession = {
      ...session,
      expiresAt: Date.now() + 100000,
    };
    const validToken = signSession(validSession);
    const tamperedToken = validToken.slice(0, -4) + "abcd";
    expect(verifySession(tamperedToken)).toBeNull();

    // Reject legacy demo sessions
    const demoSession: SpotifyAuthSession = {
      userId: "00000000-0000-0000-0000-000000000001",
      spotifyUserId: "spotify_host_demo",
      displayName: "Alex (Host Demo)",
      product: "premium",
      avatarUrl: null,
      expiresAt: Date.now() + 100000,
    };
    const demoToken = signSession(demoSession);
    expect(verifySession(demoToken)).toBeNull();
  });
});
