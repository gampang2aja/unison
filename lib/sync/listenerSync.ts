import {
  PlaybackBroadcastEvent,
  SyncStatus,
  SyncEvaluation,
  RoomSettings,
} from "@/types";
import { ClockSync, globalClock } from "./clock";
import { calculateTargetPosition } from "./position";
import { evaluateDrift, DEFAULT_SYNC_SETTINGS, LocalPlaybackStatus } from "./drift";
import { PlaybackCommandQueue, QueuedCommand } from "./commandQueue";

export interface ListenerSyncCallbacks {
  onSyncStatusChange: (status: SyncStatus, evaluation?: SyncEvaluation) => void;
  executePlaybackCommand: (command: QueuedCommand) => Promise<void>;
  getLocalPlaybackStatus: () => Promise<LocalPlaybackStatus | null>;
  onError?: (err: Error) => void;
}

export class ListenerSyncEngine {
  private commandQueue: PlaybackCommandQueue;
  private clock: ClockSync;
  private settings: RoomSettings;
  private latestEvent: PlaybackBroadcastEvent | null = null;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;
  private status: SyncStatus = "in_sync";
  private callbacks: ListenerSyncCallbacks;

  constructor(
    callbacks: ListenerSyncCallbacks,
    settings?: Partial<RoomSettings>,
    clock?: ClockSync
  ) {
    this.callbacks = callbacks;
    this.clock = clock || globalClock;
    this.settings = { ...DEFAULT_SYNC_SETTINGS, ...settings };
    this.commandQueue = new PlaybackCommandQueue(0);

    this.commandQueue.setExecutor(async (cmd) => {
      this.setStatus("syncing");
      try {
        await this.callbacks.executePlaybackCommand(cmd);
        this.setStatus("in_sync");
      } catch (err) {
        this.setStatus("error");
        this.callbacks.onError?.(err as Error);
        throw err;
      }
    });
  }

  public start(): void {
    if (this.syncIntervalId) return;
    this.syncIntervalId = setInterval(
      () => this.checkAndCorrectDrift(),
      this.settings.listenerSyncIntervalMs
    );
  }

  public stop(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  public getStatus(): SyncStatus {
    return this.status;
  }

  public setStatus(status: SyncStatus, evaluation?: SyncEvaluation): void {
    if (this.status !== status || evaluation) {
      this.status = status;
      this.callbacks.onSyncStatusChange(status, evaluation);
    }
  }

  /**
   * Handle incoming realtime broadcast or room state snapshot.
   */
  public handleBroadcastEvent(event: PlaybackBroadcastEvent): void {
    // Calibrate clock offset from server timestamp
    this.clock.updateFromServerTimestamp(event.serverTimestamp);

    this.latestEvent = event;

    if (!event.isPlaying) {
      this.setStatus("paused");
      this.commandQueue.enqueue(event, "PAUSE", event.positionMs);
      return;
    }

    const targetPos = calculateTargetPosition(event, { clock: this.clock });
    this.commandQueue.enqueue(event, "CHANGE_TRACK", targetPos);
  }

  /**
   * Periodic drift verification against actual local playback status.
   */
  public async checkAndCorrectDrift(): Promise<SyncEvaluation | null> {
    if (!this.latestEvent || this.isChecking) return null;
    this.isChecking = true;

    try {
      const local = await this.callbacks.getLocalPlaybackStatus();
      if (!local) {
        this.isChecking = false;
        return null;
      }

      const targetPos = calculateTargetPosition(this.latestEvent, { clock: this.clock });
      const evaluation = evaluateDrift(
        local,
        {
          trackUri: this.latestEvent.trackUri,
          isPlaying: this.latestEvent.isPlaying,
          targetPositionMs: targetPos,
        },
        this.settings
      );

      if (evaluation.action !== "NONE") {
        this.setStatus("drift_detected", evaluation);
        this.commandQueue.enqueue(
          {
            ...this.latestEvent,
            sequenceNumber: this.commandQueue.getLastSequence() + 1,
          },
          evaluation.action,
          evaluation.targetPositionMs
        );
      } else {
        this.setStatus(this.latestEvent.isPlaying ? "in_sync" : "paused", evaluation);
      }

      return evaluation;
    } catch (err) {
      this.callbacks.onError?.(err as Error);
      return null;
    } finally {
      this.isChecking = false;
    }
  }
}
