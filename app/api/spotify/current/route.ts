import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getValidAccessToken } from "@/lib/spotify/tokens";
import { getSpotifyPlaybackState, SpotifyApiError } from "@/lib/spotify/client";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accessToken = await getValidAccessToken(session.userId);
    const playback = await getSpotifyPlaybackState(accessToken);

    if (!playback || !playback.item) {
      return NextResponse.json({
        isPlaying: false,
        progressMs: 0,
        timestamp: Date.now(),
        item: null,
        device: playback?.device || null,
      });
    }

    const artistName = playback.item.artists?.map((a) => a.name).join(", ") || "Unknown Artist";
    const albumArtUrl =
      playback.item.album?.images && playback.item.album.images.length > 0
        ? playback.item.album.images[0].url
        : null;
    const albumUri = playback.item.album?.uri || null;
    const contextUri = playback.context?.uri || albumUri || null;

    return NextResponse.json({
      isPlaying: playback.is_playing,
      progressMs: playback.progress_ms || 0,
      timestamp: playback.timestamp || Date.now(),
      item: {
        id: playback.item.id,
        uri: playback.item.uri,
        name: playback.item.name,
        durationMs: playback.item.duration_ms,
        artistName,
        albumName: playback.item.album?.name || "Unknown Album",
        albumArtUrl,
        albumUri,
        contextUri,
      },
      device: playback.device || null,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[GET /api/spotify/current] Error fetching playback:", error.message);
    const status = err instanceof SpotifyApiError ? err.status : 500;
    return NextResponse.json(
      { error: error.message || "Failed to fetch Spotify playback" },
      { status }
    );
  }
}

