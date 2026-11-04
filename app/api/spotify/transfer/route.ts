import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getValidAccessToken } from "@/lib/spotify/tokens";
import { transferSpotifyPlayback, SpotifyApiError } from "@/lib/spotify/client";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deviceId, play = false } = await request.json();
  if (!deviceId) {
    return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(session.userId);
    await transferSpotifyPlayback(accessToken, deviceId, play);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const error = err as Error;
    const status = err instanceof SpotifyApiError ? err.status : 500;
    return NextResponse.json(
      { error: error.message || "Failed to transfer Spotify playback" },
      { status }
    );
  }
}
