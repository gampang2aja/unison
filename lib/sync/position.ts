import { PlaybackBroadcastEvent, RoomPlaybackState } from "@/types";
import { ClockSync, globalClock } from "./clock";

export interface PositionOptions {
  clock?: ClockSync;
  transitLatencyMs?: number;
}

/**
 * Calculate expected target playback position based on an event snapshot.
 * Formula: targetPosition = eventPosition + elapsedTimeSinceEvent
 */
export function calculateTargetPosition(
  stateOrEvent: PlaybackBroadcastEvent | RoomPlaybackState,
  options: PositionOptions = {}
): number {
  const clock = options.clock || globalClock;
  const transitLatency = options.transitLatencyMs || 0;

  const isPlaying = "is_playing" in stateOrEvent ? stateOrEvent.is_playing : stateOrEvent.isPlaying;
  const positionMs = "position_ms" in stateOrEvent ? stateOrEvent.position_ms : stateOrEvent.positionMs;
  const durationMs = "duration_ms" in stateOrEvent ? stateOrEvent.duration_ms : stateOrEvent.durationMs;
  const serverTimestamp = "server_timestamp" in stateOrEvent ? stateOrEvent.server_timestamp : stateOrEvent.serverTimestamp;

  if (!isPlaying) {
    return Math.max(0, positionMs);
  }

  const currentEstimatedTime = clock.now();
  const timeSinceEvent = Math.max(0, currentEstimatedTime - serverTimestamp);
  const elapsedWithTransit = timeSinceEvent + transitLatency;

  const calculatedPosition = positionMs + elapsedWithTransit;

  if (durationMs > 0) {
    return Math.min(Math.max(0, calculatedPosition), durationMs);
  }

  return Math.max(0, calculatedPosition);
}
