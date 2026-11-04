import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getValidAccessToken } from "@/lib/spotify/tokens";
import {
  startOrResumeSpotifyPlayback,
  pauseSpotifyPlayback,
  seekSpotifyPlayback,
  SpotifyPremiumRequiredError,
  SpotifyNoActiveDeviceError,
  SpotifyApiError,
} from "@/lib/spotify/client";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, trackUri, positionMs, deviceId } = await request.json();

  if (session.userId.startsWith("00000000")) {
    return NextResponse.json({ error: "Demo accounts not allowed in production. Please log in with Spotify." }, { status: 403 });
  }

  try {
    const accessToken = await getValidAccessToken(session.userId);

    switch (action) {
      case "CHANGE_TRACK":
        await startOrResumeSpotifyPlayback(accessToken, {
          deviceId,
          uris: trackUri ? [trackUri] : undefined,
          positionMs: positionMs ?? 0,
        });
        break;

      case "PLAY":
        await startOrResumeSpotifyPlayback(accessToken, {
          deviceId,
          positionMs,
        });
        break;

      case "PAUSE":
        await pauseSpotifyPlayback(accessToken, deviceId);
        break;

      case "SEEK":
        if (positionMs !== undefined) {
          await seekSpotifyPlayback(accessToken, positionMs, deviceId);
        }
        break;

      case "NONE":
        break;

      default:
        return NextResponse.json({ error: `Unknown sync action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, action, positionMs });
  } catch (err: unknown) {
    const error = err as Error;
    console.warn(`[Spotify Sync] Sync command (${action}) error:`, error.message);

    if (err instanceof SpotifyPremiumRequiredError) {
      return NextResponse.json(
        {
          error: "Listener synchronization requires Spotify Premium on your Spotify account.",
          code: "PREMIUM_REQUIRED",
        },
        { status: 403 }
      );
    }

    if (err instanceof SpotifyNoActiveDeviceError) {
      return NextResponse.json(
        {
          error: "No active device found for listener. Please launch Spotify on your phone or desktop.",
          code: "NO_ACTIVE_DEVICE",
        },
        { status: 404 }
      );
    }

    if (err instanceof SpotifyApiError) {
      if (err.status === 403 && err.message.toLowerCase().includes("restriction violated")) {
        return NextResponse.json({ success: true, action, notice: "Already in target state" });
      }

      return NextResponse.json(
        { error: err.message, code: err.reason, retryAfter: err.retryAfter },
        { status: err.status }
      );
    }

    return NextResponse.json({ error: error.message || "Sync execution failed" }, { status: 500 });
  }
}
