import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getValidAccessToken } from "@/lib/spotify/tokens";
import {
  startOrResumeSpotifyPlayback,
  pauseSpotifyPlayback,
  seekSpotifyPlayback,
  skipSpotifyNext,
  skipSpotifyPrevious,
  SpotifyPremiumRequiredError,
  SpotifyNoActiveDeviceError,
  SpotifyApiError,
} from "@/lib/spotify/client";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, positionMs, deviceId, trackUri } = await request.json();

  if (session.userId.startsWith("00000000")) {
    return NextResponse.json({ error: "Demo accounts not allowed in production. Please log in with Spotify." }, { status: 403 });
  }

  try {
    const accessToken = await getValidAccessToken(session.userId);

    switch (action) {
      case "play":
        try {
          // Attempt resume without passing uris (passing uris resets song to 00:00)
          await startOrResumeSpotifyPlayback(accessToken, {
            deviceId,
            positionMs,
          });
        } catch (playErr) {
          // If resuming with no context failed, but trackUri was supplied, start the track explicitly
          if (
            trackUri &&
            playErr instanceof SpotifyApiError &&
            (playErr.status === 404 || playErr.message.toLowerCase().includes("restriction violated"))
          ) {
            try {
              await startOrResumeSpotifyPlayback(accessToken, {
                deviceId,
                uris: [trackUri],
                positionMs,
              });
              return NextResponse.json({ success: true, action });
            } catch (retryErr) {
              if (
                retryErr instanceof SpotifyApiError &&
                retryErr.status === 403 &&
                retryErr.message.toLowerCase().includes("restriction violated")
              ) {
                return NextResponse.json({ success: true, action, notice: "Already playing" });
              }
              throw retryErr;
            }
          }

          if (
            playErr instanceof SpotifyApiError &&
            playErr.status === 403 &&
            playErr.message.toLowerCase().includes("restriction violated")
          ) {
            // Already in playing state on Spotify
            return NextResponse.json({ success: true, action, notice: "Already playing" });
          }
          throw playErr;
        }
        break;

      case "change_track":
        if (!trackUri) {
          return NextResponse.json({ error: "Missing trackUri for change_track" }, { status: 400 });
        }
        await startOrResumeSpotifyPlayback(accessToken, {
          deviceId,
          uris: [trackUri],
          positionMs: positionMs ?? 0,
        });
        break;

      case "pause":
        try {
          await pauseSpotifyPlayback(accessToken, deviceId);
        } catch (pauseErr) {
          if (
            pauseErr instanceof SpotifyApiError &&
            pauseErr.status === 403 &&
            pauseErr.message.toLowerCase().includes("restriction violated")
          ) {
            // Already paused on Spotify
            return NextResponse.json({ success: true, action, notice: "Already paused" });
          }
          throw pauseErr;
        }
        break;

      case "seek":
        if (positionMs === undefined) {
          return NextResponse.json({ error: "Missing positionMs for seek" }, { status: 400 });
        }
        await seekSpotifyPlayback(accessToken, positionMs, deviceId);
        break;

      case "next":
        await skipSpotifyNext(accessToken, deviceId);
        break;

      case "previous":
        await skipSpotifyPrevious(accessToken, deviceId);
        break;

      default:
        return NextResponse.json({ error: `Unknown control action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, action });
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[Spotify Control] Error executing ${action}:`, error);

    if (err instanceof SpotifyPremiumRequiredError) {
      return NextResponse.json(
        {
          error: "Spotify Premium is required to control playback programmatically via the Spotify Web API.",
          code: "PREMIUM_REQUIRED",
        },
        { status: 403 }
      );
    }

    if (err instanceof SpotifyNoActiveDeviceError) {
      return NextResponse.json(
        {
          error: "No active Spotify playback device found. Please open Spotify on your phone, desktop, or web player.",
          code: "NO_ACTIVE_DEVICE",
        },
        { status: 404 }
      );
    }

    if (err instanceof SpotifyApiError) {
      if (err.status === 403 && err.message.toLowerCase().includes("restriction violated")) {
        return NextResponse.json({ success: true, action, notice: "Already in requested state" });
      }

      return NextResponse.json(
        { error: err.message, code: err.reason, retryAfter: err.retryAfter },
        { status: err.status }
      );
    }

    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
