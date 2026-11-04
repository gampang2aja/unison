import { NextRequest, NextResponse } from "next/server";
import { generateRandomString, generateCodeChallenge } from "@/lib/auth/encryption";
import { STATE_COOKIE_NAME, VERIFIER_COOKIE_NAME, RETURN_TO_COOKIE_NAME } from "@/lib/auth/session";
import { savePendingOAuth } from "@/lib/auth/pkceStore";

const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-email",
  "user-read-private",
].join(" ");

function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
}

export async function GET(request: NextRequest) {
  // If user opens on localhost, redirect to 127.0.0.1 so their address bar stays on 127.0.0.1
  const actualHost = request.headers.get("host") || "";
  if (actualHost.includes("localhost")) {
    const forwardUrl = new URL("/api/auth/login", getAppBaseUrl());
    return NextResponse.redirect(forwardUrl.toString());
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${getAppBaseUrl()}/api/auth/callback`;

  if (!clientId) {
    return NextResponse.json(
      {
        error: "Missing SPOTIFY_CLIENT_ID environment variable. Please configure Vercel with Spotify App credentials.",
      },
      { status: 500 }
    );
  }

  const returnTo = request.nextUrl.searchParams.get("return_to") || "/dashboard";

  // Generate PKCE code verifier and challenge
  const codeVerifier = generateRandomString(64);
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  // Save in fallback server store (resilient to browser cross-site cookie partitioning)
  savePendingOAuth(state, codeVerifier, returnTo);

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", SPOTIFY_SCOPES);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", codeChallenge);

  const response = NextResponse.redirect(authUrl.toString());

  const isHttps = request.nextUrl.protocol === "https:";
  const cookieOptions = {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  };

  response.cookies.set(STATE_COOKIE_NAME, state, cookieOptions);
  response.cookies.set(VERIFIER_COOKIE_NAME, codeVerifier, cookieOptions);
  response.cookies.set(RETURN_TO_COOKIE_NAME, returnTo, cookieOptions);

  return response;
}
