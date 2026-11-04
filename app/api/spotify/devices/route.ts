import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getValidAccessToken } from "@/lib/spotify/tokens";
import { getSpotifyDevices } from "@/lib/spotify/client";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accessToken = await getValidAccessToken(session.userId);
    const devices = await getSpotifyDevices(accessToken);
    return NextResponse.json({ devices });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message || "Failed to fetch Spotify devices" },
      { status: 500 }
    );
  }
}
