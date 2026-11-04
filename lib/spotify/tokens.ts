import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/auth/encryption";

export interface DecryptedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  scope: string;
}

// In-memory token cache for local development/fallback when Supabase is not yet populated
const memoryTokenStore = new Map<string, DecryptedTokens>();

/**
 * Save user tokens encrypted in Supabase (or memory fallback).
 */
export async function saveUserTokens(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // seconds
    scope: string;
  }
): Promise<void> {
  const expiresAtMs = Date.now() + tokens.expiresIn * 1000;
  const encAccess = encrypt(tokens.accessToken);
  const encRefresh = encrypt(tokens.refreshToken);

  // Store in memory for instant local availability
  memoryTokenStore.set(userId, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: expiresAtMs,
    scope: tokens.scope,
  });

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("spotify_accounts").upsert({
      user_id: userId,
      encrypted_access_token: encAccess.ciphertext,
      token_iv: encAccess.iv,
      token_auth_tag: encAccess.authTag,
      encrypted_refresh_token: encRefresh.ciphertext,
      refresh_token_iv: encRefresh.iv,
      refresh_token_auth_tag: encRefresh.authTag,
      expires_at: new Date(expiresAtMs).toISOString(),
      scope: tokens.scope,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[saveUserTokens] Supabase error:", error);
    }
  }
}

/**
 * Get valid decrypted access token for a user, automatically refreshing if expired or near expiry.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  let record: DecryptedTokens | null = memoryTokenStore.get(userId) || null;

  if (!record && isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("spotify_accounts")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      throw new Error(`No Spotify account found for user: ${userId}`);
    }

    try {
      const accessToken = decrypt({
        ciphertext: data.encrypted_access_token,
        iv: data.token_iv,
        authTag: data.token_auth_tag,
      });
      const refreshToken = decrypt({
        ciphertext: data.encrypted_refresh_token,
        iv: data.refresh_token_iv,
        authTag: data.refresh_token_auth_tag,
      });

      record = {
        accessToken,
        refreshToken,
        expiresAt: new Date(data.expires_at).getTime(),
        scope: data.scope,
      };
      memoryTokenStore.set(userId, record);
    } catch (decErr) {
      console.error("[getValidAccessToken] Decryption failed:", decErr);
      throw new Error("Failed to decrypt Spotify tokens. Re-authentication required.");
    }
  }

  if (!record) {
    throw new Error(`Authentication required for user: ${userId}`);
  }

  // Check if token expires within the next 2 minutes (120,000 ms)
  const isExpiringSoon = Date.now() + 120_000 >= record.expiresAt;

  if (isExpiringSoon) {
    // Refresh token
    const refreshed = await refreshSpotifyToken(record.refreshToken, userId);
    return refreshed.accessToken;
  }

  return record.accessToken;
}

/**
 * Refresh access token using Spotify OAuth endpoint.
 */
export async function refreshSpotifyToken(
  refreshToken: string,
  userId: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId) {
    throw new Error("Missing SPOTIFY_CLIENT_ID in environment variables");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // If Client Secret is configured (server-side Authorization Code flow), attach Basic auth
  if (clientSecret) {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${basicAuth}`;
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers,
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[refreshSpotifyToken] Token refresh failed:", response.status, errorBody);
    throw new Error(`Spotify token refresh failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const newAccessToken = data.access_token;
  const newRefreshToken = data.refresh_token || refreshToken; // Refresh token may optionally rotate
  const expiresIn = data.expires_in || 3600;
  const scope = data.scope || "";

  // Persist updated tokens
  await saveUserTokens(userId, {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn,
    scope,
  });

  return {
    accessToken: newAccessToken,
    expiresIn,
  };
}
