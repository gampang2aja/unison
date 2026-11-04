import { NextRequest, NextResponse } from "next/server";
import {
  STATE_COOKIE_NAME,
  VERIFIER_COOKIE_NAME,
  RETURN_TO_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  signSession,
} from "@/lib/auth/session";
import { saveUserTokens } from "@/lib/spotify/tokens";
import { getSpotifyCurrentUser } from "@/lib/spotify/client";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { globalRoomStore } from "@/lib/store/roomStore";
import { SpotifyAuthSession, UserProfile } from "@/types";
import { getPendingOAuth, deletePendingOAuth } from "@/lib/auth/pkceStore";

function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const baseUrl = getAppBaseUrl();

  let storedState = request.cookies.get(STATE_COOKIE_NAME)?.value;
  let codeVerifier = request.cookies.get(VERIFIER_COOKIE_NAME)?.value;
  let returnTo = request.cookies.get(RETURN_TO_COOKIE_NAME)?.value || "/dashboard";

  // Check for Spotify user cancel or errors
  if (error) {
    console.error("[OAuth Callback] Spotify returned error:", error);
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error)}`, baseUrl));
  }

  // 1. Resolve State & PKCE Verifier (Cookie first, fallback to in-memory pending store)
  if (state) {
    const pending = getPendingOAuth(state);
    if (pending) {
      if (!codeVerifier) {
        codeVerifier = pending.codeVerifier;
      }
      if (!storedState) {
        storedState = state;
      }
      if (pending.returnTo) {
        returnTo = pending.returnTo;
      }
      deletePendingOAuth(state);
    }
  }

  // Validate state
  if (!state || !storedState || state !== storedState) {
    console.error("[OAuth Callback] CSRF State mismatch. Expected:", storedState, "Received:", state);
    return NextResponse.redirect(
      new URL(
        `/?auth_error=${encodeURIComponent(
          "Sesi login kadaluarsa. Silakan klik Connect with Spotify lagi."
        )}`,
        baseUrl
      )
    );
  }

  if (!code || !codeVerifier) {
    return NextResponse.redirect(
      new URL(
        `/?auth_error=${encodeURIComponent("Otorisasi gagal: kode verifikasi PKCE tidak ditemukan. Silakan login ulang.")}`,
        baseUrl
      )
    );
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${baseUrl}/api/auth/callback`;

  if (!clientId) {
    return NextResponse.json({ error: "Server misconfiguration: SPOTIFY_CLIENT_ID missing" }, { status: 500 });
  }

  // 2. Exchange authorization code + PKCE verifier for tokens
  const bodyParams = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (clientSecret) {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${basicAuth}`;
  }

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers,
    body: bodyParams.toString(),
  });

  if (!tokenRes.ok) {
    const errorDetails = await tokenRes.text();
    console.error("[OAuth Callback] Token exchange failed:", tokenRes.status, errorDetails);
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent("Token exchange failed")}`, baseUrl)
    );
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in || 3600;
  const scope = tokenData.scope || "";

  // 3. Fetch Spotify user profile
  let spotifyUser;
  try {
    spotifyUser = await getSpotifyCurrentUser(accessToken);
  } catch (err) {
    console.error("[OAuth Callback] Failed to fetch Spotify profile:", err);
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent("Failed to retrieve Spotify user profile")}`, baseUrl)
    );
  }

  const avatarUrl = spotifyUser.images && spotifyUser.images.length > 0 ? spotifyUser.images[0].url : null;
  const productTier = spotifyUser.product || "free";

  // 4. Upsert Profile
  let userId = crypto.randomUUID();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("spotify_user_id", spotifyUser.id)
      .maybeSingle();

    if (existingProfile) {
      userId = existingProfile.id;
    }

    const { error: upsertErr } = await supabase.from("profiles").upsert({
      id: userId,
      spotify_user_id: spotifyUser.id,
      display_name: spotifyUser.display_name || spotifyUser.id,
      email: spotifyUser.email || null,
      avatar_url: avatarUrl,
      product: productTier,
      updated_at: new Date().toISOString(),
    });

    if (upsertErr) {
      console.error("[OAuth Callback] Profile upsert error:", upsertErr);
    }
  }

  // Also keep in fallback store
  const profileRecord: UserProfile = {
    id: userId,
    spotify_user_id: spotifyUser.id,
    display_name: spotifyUser.display_name || spotifyUser.id,
    email: spotifyUser.email || null,
    avatar_url: avatarUrl,
    product: productTier,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  globalRoomStore.upsertProfile(profileRecord);

  // 5. Encrypt and save tokens securely on server
  await saveUserTokens(userId, {
    accessToken,
    refreshToken,
    expiresIn,
    scope,
  });

  // 6. Issue signed session cookie
  const session: SpotifyAuthSession = {
    userId,
    spotifyUserId: spotifyUser.id,
    displayName: spotifyUser.display_name || spotifyUser.id,
    product: productTier,
    avatarUrl,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };

  const sessionToken = signSession(session);

  // Redirect strictly to baseUrl (never localhost)
  const targetUrl = new URL(returnTo, baseUrl);
  const response = NextResponse.redirect(targetUrl.toString());

  const isHttps = baseUrl.startsWith("https:");

  // Set secure HTTP-only session cookie
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  // Clear temporary OAuth cookies
  response.cookies.delete(STATE_COOKIE_NAME);
  response.cookies.delete(VERIFIER_COOKIE_NAME);
  response.cookies.delete(RETURN_TO_COOKIE_NAME);

  return response;
}
