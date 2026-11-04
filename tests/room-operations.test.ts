import { describe, it, expect } from "vitest";
import { globalRoomStore } from "@/lib/store/roomStore";
import {
  SpotifyApiError,
  SpotifyPremiumRequiredError,
  SpotifyNoActiveDeviceError,
} from "@/lib/spotify/client";

describe("Room Operations & Store", () => {
  const hostUserId = "host-user-uuid-1";
  const listenerUserId = "listener-user-uuid-2";

  it("should create a room with unique room code and assign host", () => {
    const room = globalRoomStore.createRoom("Synthwave Chill", hostUserId);

    expect(room.id).toBeDefined();
    expect(room.name).toBe("Synthwave Chill");
    expect(room.host_user_id).toBe(hostUserId);
    expect(room.room_code).toMatch(/^[A-Z]{4}-\d{4}$/);

    const members = globalRoomStore.getMembers(room.id);
    expect(members).toHaveLength(1);
    expect(members[0].user_id).toBe(hostUserId);
    expect(members[0].role).toBe("host");
  });

  it("should add a listener to an existing room and maintain roles", () => {
    const room = globalRoomStore.createRoom("Study Session", hostUserId);
    const listener = globalRoomStore.addMember(room.id, listenerUserId, "listener", "device_speaker_1", "Living Room Echo");

    expect(listener.role).toBe("listener");
    expect(listener.device_id).toBe("device_speaker_1");

    const members = globalRoomStore.getMembers(room.id);
    expect(members).toHaveLength(2);
    expect(members.find((m) => m.role === "host")?.user_id).toBe(hostUserId);
    expect(members.find((m) => m.role === "listener")?.user_id).toBe(listenerUserId);
  });

  it("should update playback state monotonically", () => {
    const room = globalRoomStore.createRoom("Evening Groove", hostUserId);

    const updated = globalRoomStore.updatePlaybackState(room.id, {
      track_uri: "spotify:track:nightcall",
      track_name: "Nightcall",
      artist_name: "Kavinsky",
      is_playing: true,
      position_ms: 30000,
      sequence_number: 10,
    });

    expect(updated.track_name).toBe("Nightcall");
    expect(updated.is_playing).toBe(true);
    expect(updated.sequence_number).toBe(10);
    expect(updated.server_timestamp).toBeGreaterThan(0);
  });
});

describe("Spotify Web API Error Types & Statuses", () => {
  it("should format SpotifyPremiumRequiredError with 403 status", () => {
    const err = new SpotifyPremiumRequiredError();
    expect(err.status).toBe(403);
    expect(err.reason).toBe("PREMIUM_REQUIRED");
    expect(err.message).toContain("Premium");
  });

  it("should format SpotifyNoActiveDeviceError with 404 status", () => {
    const err = new SpotifyNoActiveDeviceError();
    expect(err.status).toBe(404);
    expect(err.reason).toBe("NO_ACTIVE_DEVICE");
    expect(err.message).toContain("device");
  });

  it("should format SpotifyApiError with 429 and retryAfter", () => {
    const err = new SpotifyApiError(429, "Too Many Requests", "RATE_LIMITED", 5);
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(5);
    expect(err.reason).toBe("RATE_LIMITED");
  });
});

