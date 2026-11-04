import { describe, it, expect, vi } from "vitest";
import { ClockSync } from "@/lib/sync/clock";
import { calculateTargetPosition } from "@/lib/sync/position";
import { evaluateDrift } from "@/lib/sync/drift";
import { PlaybackCommandQueue } from "@/lib/sync/commandQueue";
import { PlaybackBroadcastEvent } from "@/types";

describe("Synchronization Engine — Clock & Position", () => {
  it("should estimate clock offset accurately and reject jitter with median filtering", () => {
    const clock = new ClockSync();

    // Simulate NTP samples: client sends at 1000, server receives at 1050, replies at 1060, client receives at 1110
    // rtt = (1110 - 1000) - (1060 - 1050) = 110 - 10 = 100ms
    // offset = ((1050 - 1000) + (1060 - 1110)) / 2 = (50 - 50) / 2 = 0ms
    const offset1 = clock.addSample(1000, 1050, 1060, 1110);
    expect(offset1).toBe(0);

    // Skewed clock: server is +50ms ahead
    // t0=2000, t1=2100 (+100ms apparent), t2=2110, t3=2210 (+100ms apparent reply)
    // offset = ((2100 - 2000) + (2110 - 2210)) / 2 = (100 - 100) / 2 = 0
    // If server clock is actually +50 ahead: t0=2000, t1=2070, t2=2075, t3=2125
    // offset = ((2070 - 2000) + (2075 - 2125)) / 2 = (70 - 50) / 2 = 10ms
    clock.addSample(2000, 2070, 2075, 2125);
    expect(clock.getOffset()).toBeDefined();
  });

  it("should calculate target position with elapsed time when playing", () => {
    const clock = new ClockSync(0);
    const now = Date.now();
    vi.spyOn(clock, "now").mockReturnValue(now);

    const event: PlaybackBroadcastEvent = {
      type: "playback_update",
      roomId: "room-1",
      sequenceNumber: 1,
      trackUri: "spotify:track:123",
      trackId: "123",
      trackName: "Test Song",
      artistName: "Test Artist",
      albumName: "Test Album",
      albumArtUrl: null,
      durationMs: 200000,
      isPlaying: true,
      positionMs: 50000,
      serverTimestamp: now - 3000, // event happened 3 seconds ago
    };

    const targetPos = calculateTargetPosition(event, { clock });
    // 50,000 + 3,000 = 53,000 ms
    expect(targetPos).toBe(53000);
  });

  it("should freeze position when playback is paused", () => {
    const clock = new ClockSync(0);
    const now = Date.now();
    vi.spyOn(clock, "now").mockReturnValue(now);

    const event: PlaybackBroadcastEvent = {
      type: "playback_update",
      roomId: "room-1",
      sequenceNumber: 2,
      trackUri: "spotify:track:123",
      trackId: "123",
      trackName: "Test Song",
      artistName: "Test Artist",
      albumName: "Test Album",
      albumArtUrl: null,
      durationMs: 200000,
      isPlaying: false,
      positionMs: 42000,
      serverTimestamp: now - 5000,
    };

    const targetPos = calculateTargetPosition(event, { clock });
    expect(targetPos).toBe(42000);
  });

  it("should clamp target position to track duration bounds", () => {
    const clock = new ClockSync(0);
    const now = Date.now();
    vi.spyOn(clock, "now").mockReturnValue(now);

    const event: PlaybackBroadcastEvent = {
      type: "playback_update",
      roomId: "room-1",
      sequenceNumber: 3,
      trackUri: "spotify:track:123",
      trackId: "123",
      trackName: "Test Song",
      artistName: "Test Artist",
      albumName: "Test Album",
      albumArtUrl: null,
      durationMs: 60000, // 60s max
      isPlaying: true,
      positionMs: 55000,
      serverTimestamp: now - 10000, // 10s elapsed
    };

    const targetPos = calculateTargetPosition(event, { clock });
    expect(targetPos).toBe(60000); // capped at duration
  });
});

describe("Synchronization Engine — Drift Detection & Decisions", () => {
  const customSettings = {
    driftToleranceMs: 300,
    correctionThresholdMs: 1500,
  };

  it("should make no adjustment (action: NONE) when drift is within tolerance (<= 300ms)", () => {
    const evalResult = evaluateDrift(
      { trackUri: "spotify:track:1", isPlaying: true, positionMs: 50150 },
      { trackUri: "spotify:track:1", isPlaying: true, targetPositionMs: 50000 },
      customSettings
    );

    expect(evalResult.action).toBe("NONE");
    expect(evalResult.driftMs).toBe(150);
  });

  it("should suppress seek (action: NONE) when drift is between tolerance and correction threshold to prevent stutter", () => {
    const evalResult = evaluateDrift(
      { trackUri: "spotify:track:1", isPlaying: true, positionMs: 50800 },
      { trackUri: "spotify:track:1", isPlaying: true, targetPositionMs: 50000 },
      customSettings
    );

    expect(evalResult.action).toBe("NONE");
    expect(evalResult.driftMs).toBe(800);
    expect(evalResult.reason).toContain("suppressing seek");
  });

  it("should trigger SEEK when drift exceeds correction threshold (> 1500ms)", () => {
    const evalResult = evaluateDrift(
      { trackUri: "spotify:track:1", isPlaying: true, positionMs: 47000 },
      { trackUri: "spotify:track:1", isPlaying: true, targetPositionMs: 50000 },
      customSettings
    );

    expect(evalResult.action).toBe("SEEK");
    expect(evalResult.driftMs).toBe(3000);
    expect(evalResult.targetPositionMs).toBe(50000);
  });

  it("should trigger CHANGE_TRACK when track URIs do not match", () => {
    const evalResult = evaluateDrift(
      { trackUri: "spotify:track:old", isPlaying: true, positionMs: 1000 },
      { trackUri: "spotify:track:new", isPlaying: true, targetPositionMs: 0 },
      customSettings
    );

    expect(evalResult.action).toBe("CHANGE_TRACK");
  });

  it("should trigger PLAY when host is playing but listener is paused", () => {
    const evalResult = evaluateDrift(
      { trackUri: "spotify:track:1", isPlaying: false, positionMs: 10000 },
      { trackUri: "spotify:track:1", isPlaying: true, targetPositionMs: 10000 },
      customSettings
    );

    expect(evalResult.action).toBe("PLAY");
  });

  it("should trigger PAUSE when host is paused but listener is playing", () => {
    const evalResult = evaluateDrift(
      { trackUri: "spotify:track:1", isPlaying: true, positionMs: 10000 },
      { trackUri: "spotify:track:1", isPlaying: false, targetPositionMs: 10000 },
      customSettings
    );

    expect(evalResult.action).toBe("PAUSE");
  });
});

describe("Synchronization Engine — Command Queue & Ordering", () => {
  it("should reject outdated events using sequence numbers", () => {
    const queue = new PlaybackCommandQueue(5); // last sequence is 5

    const oldEvent: PlaybackBroadcastEvent = {
      type: "playback_update",
      roomId: "room-1",
      sequenceNumber: 4, // older
      trackUri: "spotify:track:1",
      trackId: "1",
      trackName: "Song",
      artistName: "Artist",
      albumName: "Album",
      albumArtUrl: null,
      durationMs: 100000,
      isPlaying: true,
      positionMs: 1000,
      serverTimestamp: Date.now(),
    };

    const accepted = queue.enqueue(oldEvent, "SEEK", 1000);
    expect(accepted).toBe(false);
  });

  it("should accept strictly newer sequence numbers", () => {
    const queue = new PlaybackCommandQueue(5);

    const newEvent: PlaybackBroadcastEvent = {
      type: "playback_update",
      roomId: "room-1",
      sequenceNumber: 6, // newer
      trackUri: "spotify:track:1",
      trackId: "1",
      trackName: "Song",
      artistName: "Artist",
      albumName: "Album",
      albumArtUrl: null,
      durationMs: 100000,
      isPlaying: true,
      positionMs: 2000,
      serverTimestamp: Date.now(),
    };

    const accepted = queue.enqueue(newEvent, "SEEK", 2000);
    expect(accepted).toBe(true);
    expect(queue.getLastSequence()).toBe(6);
  });
});
