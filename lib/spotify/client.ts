import { SpotifyDevice } from "@/types";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export class SpotifyApiError extends Error {
  status: number;
  reason?: string;
  retryAfter?: number;

  constructor(status: number, message: string, reason?: string, retryAfter?: number) {
    super(`Spotify API Error (${status}): ${message}${reason ? ` [${reason}]` : ""}`);
    this.name = "SpotifyApiError";
    this.status = status;
    this.reason = reason;
    this.retryAfter = retryAfter;
  }
}

export class SpotifyPremiumRequiredError extends SpotifyApiError {
  constructor(message = "Player command requires Spotify Premium") {
    super(403, message, "PREMIUM_REQUIRED");
    this.name = "SpotifyPremiumRequiredError";
  }
}

export class SpotifyNoActiveDeviceError extends SpotifyApiError {
  constructor(message = "No active Spotify playback device found. Please start Spotify on your device.") {
    super(404, message, "NO_ACTIVE_DEVICE");
    this.name = "SpotifyNoActiveDeviceError";
  }
}

interface FetchOptions extends RequestInit {
  maxRetries?: number;
}

/**
 * Execute request to Spotify Web API with rate-limiting, exponential backoff, and error parsing.
 */
export async function spotifyFetch<T>(
  endpoint: string,
  accessToken: string,
  options: FetchOptions = {}
): Promise<T> {
  const { maxRetries = 2, ...fetchOptions } = options;
  const url = endpoint.startsWith("http") ? endpoint : `${SPOTIFY_API_BASE}${endpoint}`;

  let attempts = 0;

  while (attempts <= maxRetries) {
    attempts++;

    const headers = new Headers(fetchOptions.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    if (fetchOptions.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
      });

      // Handle 429 Rate Limit
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : Math.pow(2, attempts);
        const waitMs = Math.min(retryAfterSec * 1000, 10000); // cap wait at 10s

        if (attempts <= maxRetries) {
          console.warn(`[spotifyFetch] Rate limited (429). Retrying after ${waitMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        } else {
          throw new SpotifyApiError(429, "Rate limit exceeded. Please slow down.", "RATE_LIMITED", retryAfterSec);
        }
      }

      // Handle 204 No Content (standard for player control PUT/POST)
      if (response.status === 204) {
        return {} as T;
      }

      if (!response.ok) {
        let errorMessage = response.statusText;
        let reason: string | undefined;

        try {
          const errorJson = await response.json();
          if (errorJson.error) {
            errorMessage = errorJson.error.message || errorMessage;
            reason = errorJson.error.reason;
          }
        } catch {
          // not json
        }

        if (response.status === 403 && (reason === "PREMIUM_REQUIRED" || errorMessage.toLowerCase().includes("premium"))) {
          throw new SpotifyPremiumRequiredError(errorMessage);
        }

        if (response.status === 404 && (reason === "NO_ACTIVE_DEVICE" || errorMessage.toLowerCase().includes("device"))) {
          throw new SpotifyNoActiveDeviceError(errorMessage);
        }

        throw new SpotifyApiError(response.status, errorMessage, reason);
      }

      // If response has body, parse JSON safely or fallback to raw string / empty object
      const text = await response.text();
      if (!text || !text.trim()) {
        return {} as T;
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        // Spotify frequently returns 200 OK with an opaque trace/snapshot string (e.g. for play, pause, seek, transfer).
        // Since response.ok is true, treat this as successful instead of throwing a SyntaxError.
        return text as unknown as T;
      }
    } catch (err) {
      if (err instanceof SpotifyApiError) {
        throw err;
      }
      if (attempts > maxRetries) {
        throw new SpotifyApiError(500, (err as Error).message);
      }
      // Wait exponential backoff before retrying network glitches
      await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempts - 1)));
    }
  }

  throw new SpotifyApiError(500, "Request failed after maximum retries");
}

/* =========================================================================
   Typed Spotify API Client Endpoints (strictly adhering to open-api-schema.yaml)
   ========================================================================= */

export interface SpotifyUserProfileResponse {
  id: string;
  display_name: string;
  email?: string;
  images?: Array<{ url: string; height?: number; width?: number }>;
  product?: "premium" | "free" | "open";
  uri: string;
}

export interface SpotifyPlaybackStateResponse {
  device?: SpotifyDevice;
  repeat_state?: string;
  shuffle_state?: boolean;
  timestamp?: number;
  progress_ms?: number;
  is_playing: boolean;
  item?: {
    id: string;
    uri: string;
    name: string;
    duration_ms: number;
    artists: Array<{ name: string; id: string; uri: string }>;
    album: {
      name: string;
      images: Array<{ url: string; height?: number; width?: number }>;
    };
  } | null;
  currently_playing_type?: string;
}

/**
 * GET /me
 * Get detailed profile information about the current user.
 */
export async function getSpotifyCurrentUser(accessToken: string): Promise<SpotifyUserProfileResponse> {
  return spotifyFetch<SpotifyUserProfileResponse>("/me", accessToken);
}

/**
 * GET /me/player
 * Get information about the user's current playback state.
 */
export async function getSpotifyPlaybackState(
  accessToken: string
): Promise<SpotifyPlaybackStateResponse | null> {
  try {
    const data = await spotifyFetch<SpotifyPlaybackStateResponse>("/me/player", accessToken);
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return data;
  } catch (err) {
    if (err instanceof SpotifyApiError && (err.status === 204 || err.status === 404)) {
      return null;
    }
    throw err;
  }
}

/**
 * GET /me/player/devices
 * Get information about a user's available Spotify Connect devices.
 */
export async function getSpotifyDevices(accessToken: string): Promise<SpotifyDevice[]> {
  const data = await spotifyFetch<{ devices: SpotifyDevice[] }>("/me/player/devices", accessToken);
  return data.devices || [];
}

/**
 * PUT /me/player
 * Transfer playback to a new device and optionally begin playback.
 */
export async function transferSpotifyPlayback(
  accessToken: string,
  deviceId: string,
  play: boolean = false
): Promise<void> {
  await spotifyFetch<void>("/me/player", accessToken, {
    method: "PUT",
    body: JSON.stringify({
      device_ids: [deviceId],
      play,
    }),
  });
}

/**
 * PUT /me/player/play
 * Start a new context or resume current playback on the user's active device.
 */
export async function startOrResumeSpotifyPlayback(
  accessToken: string,
  options?: {
    deviceId?: string;
    uris?: string[];
    positionMs?: number;
  }
): Promise<void> {
  const query = options?.deviceId ? `?device_id=${encodeURIComponent(options.deviceId)}` : "";
  const body: Record<string, unknown> = {};

  if (options?.uris && options.uris.length > 0) {
    body.uris = options.uris;
  }
  if (options?.positionMs !== undefined && options.positionMs >= 0) {
    body.position_ms = Math.floor(options.positionMs);
  }

  await spotifyFetch<void>(`/me/player/play${query}`, accessToken, {
    method: "PUT",
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT /me/player/pause
 * Pause playback on the user's active device.
 */
export async function pauseSpotifyPlayback(accessToken: string, deviceId?: string): Promise<void> {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  await spotifyFetch<void>(`/me/player/pause${query}`, accessToken, {
    method: "PUT",
  });
}

/**
 * PUT /me/player/seek
 * Seeks to the given position in the user’s currently playing track.
 */
export async function seekSpotifyPlayback(
  accessToken: string,
  positionMs: number,
  deviceId?: string
): Promise<void> {
  const safePosition = Math.max(0, Math.floor(positionMs));
  const params = new URLSearchParams({ position_ms: safePosition.toString() });
  if (deviceId) {
    params.set("device_id", deviceId);
  }
  await spotifyFetch<void>(`/me/player/seek?${params.toString()}`, accessToken, {
    method: "PUT",
  });
}

/**
 * POST /me/player/next
 * Skip to next track in queue.
 */
export async function skipSpotifyNext(accessToken: string, deviceId?: string): Promise<void> {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  await spotifyFetch<void>(`/me/player/next${query}`, accessToken, {
    method: "POST",
  });
}

/**
 * POST /me/player/previous
 * Skip to previous track.
 */
export async function skipSpotifyPrevious(accessToken: string, deviceId?: string): Promise<void> {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  await spotifyFetch<void>(`/me/player/previous${query}`, accessToken, {
    method: "POST",
  });
}

