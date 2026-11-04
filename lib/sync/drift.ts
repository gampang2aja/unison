import { SyncEvaluation, RoomSettings } from "@/types";

export const DEFAULT_SYNC_SETTINGS: RoomSettings = {
  driftToleranceMs: 100, // target tight sync tolerance <= 100ms
  correctionThresholdMs: 250, // triggers corrective seek when drift exceeds 250ms
  hostPollIntervalMs: 2000,
  listenerSyncIntervalMs: 3000,
  predictiveAdvanceMs: 450, // predictive advance offset to compensate for network + Spotify API transit
};

export interface LocalPlaybackStatus {
  trackUri: string | null;
  isPlaying: boolean;
  positionMs: number;
}

export interface TargetPlaybackStatus {
  trackUri: string | null;
  isPlaying: boolean;
  targetPositionMs: number;
}

/**
 * Evaluates drift and decides the necessary synchronization action.
 */
export function evaluateDrift(
  local: LocalPlaybackStatus,
  target: TargetPlaybackStatus,
  settings: Partial<RoomSettings> = {}
): SyncEvaluation {
  const driftTolerance = settings.driftToleranceMs ?? DEFAULT_SYNC_SETTINGS.driftToleranceMs;
  const correctionThreshold = settings.correctionThresholdMs ?? DEFAULT_SYNC_SETTINGS.correctionThresholdMs;

  // 1. Track Mismatch
  if (target.trackUri && local.trackUri !== target.trackUri) {
    return {
      action: "CHANGE_TRACK",
      driftMs: Math.abs(local.positionMs - target.targetPositionMs),
      targetPositionMs: target.targetPositionMs,
      currentPositionMs: local.positionMs,
      reason: `Track changed from ${local.trackUri || "none"} to ${target.trackUri}`,
    };
  }

  // 2. Play/Pause state mismatch
  if (target.isPlaying && !local.isPlaying) {
    return {
      action: "PLAY",
      driftMs: Math.abs(local.positionMs - target.targetPositionMs),
      targetPositionMs: target.targetPositionMs,
      currentPositionMs: local.positionMs,
      reason: "Host resumed playback",
    };
  }

  if (!target.isPlaying && local.isPlaying) {
    return {
      action: "PAUSE",
      driftMs: Math.abs(local.positionMs - target.targetPositionMs),
      targetPositionMs: target.targetPositionMs,
      currentPositionMs: local.positionMs,
      reason: "Host paused playback",
    };
  }

  // 3. Both paused
  if (!target.isPlaying && !local.isPlaying) {
    return {
      action: "NONE",
      driftMs: 0,
      targetPositionMs: target.targetPositionMs,
      currentPositionMs: local.positionMs,
      reason: "Both host and listener are paused",
    };
  }

  // 4. Both playing - calculate drift
  const driftMs = Math.abs(local.positionMs - target.targetPositionMs);

  if (driftMs <= driftTolerance) {
    return {
      action: "NONE",
      driftMs,
      targetPositionMs: target.targetPositionMs,
      currentPositionMs: local.positionMs,
      reason: `In sync (drift ${driftMs}ms <= tolerance ${driftTolerance}ms)`,
    };
  }

  if (driftMs <= correctionThreshold) {
    return {
      action: "NONE",
      driftMs,
      targetPositionMs: target.targetPositionMs,
      currentPositionMs: local.positionMs,
      reason: `Minor drift (${driftMs}ms) within correction threshold (${correctionThreshold}ms); suppressing seek to prevent audio stutter`,
    };
  }

  // Drift exceeded correction threshold -> Seek
  return {
    action: "SEEK",
    driftMs,
    targetPositionMs: target.targetPositionMs,
    currentPositionMs: local.positionMs,
    reason: `Significant drift detected (${driftMs}ms > ${correctionThreshold}ms threshold); seeking to target position`,
  };
}

