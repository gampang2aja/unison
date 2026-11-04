import crypto from "crypto";
import { cookies } from "next/headers";
import { SpotifyAuthSession } from "@/types";

export const SESSION_COOKIE_NAME = "unison_session";
export const STATE_COOKIE_NAME = "unison_oauth_state";
export const VERIFIER_COOKIE_NAME = "unison_pkce_verifier";
export const RETURN_TO_COOKIE_NAME = "unison_return_to";

const SESSION_SECRET =
  process.env.TOKEN_ENCRYPTION_KEY || "unison-fallback-session-signature-key-min-32-chars!";

/**
 * Sign session payload with HMAC-SHA256.
 */
export function signSession(session: SpotifyAuthSession): string {
  const json = JSON.stringify(session);
  const base64Data = Buffer.from(json, "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(base64Data)
    .digest("base64url");
  return `${base64Data}.${signature}`;
}

/**
 * Verify and decode signed session cookie.
 */
export function verifySession(token: string | undefined | null): SpotifyAuthSession | null {
  if (!token || !token.includes(".")) return null;

  const [base64Data, signature] = token.split(".");
  if (!base64Data || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(base64Data)
    .digest("base64url");

  // Constant time comparison to prevent timing attacks
  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const raw = Buffer.from(base64Data, "base64url").toString("utf8");
    const session: SpotifyAuthSession = JSON.parse(raw);

    // Check expiry
    if (session.expiresAt && Date.now() > session.expiresAt) {
      return null;
    }

    // Invalidate any legacy demo sessions completely in production
    if (session.userId.startsWith("00000000") || (session.spotifyUserId && session.spotifyUserId.includes("demo"))) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Server-side helper to read the current authenticated user session.
 */
export async function getSession(): Promise<SpotifyAuthSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    return verifySession(sessionCookie);
  } catch {
    return null;
  }
}

