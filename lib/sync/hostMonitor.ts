import { PlaybackBroadcastEvent, RoomSettings } from "@/types";
import { DEFAULT_SYNC_SETTINGS } from "./drift";

export interface HostMonitorCallbacks {
  onStateChange: (event: PlaybackBroadcastEvent) => void | Promise<void>;
  onError?: (error: Error) => void;
}

export interface SpotifyPlayerSnapshot {
  isPlaying: boolean;
  progressMs: number;
  item: {
    id: string;
    uri: string;
    name: string;
    durationMs: number;
    artistName: string;
    albumName: string;
    albumArtUrl: string | null;
    albumUri?: string | null;
    contextUri?: string | null;
  } | null;
  deviceId?: string | null;
  timestamp: number;
}

export class HostPlaybackMonitor {
  private roomId: string;
  private sequenceNumber: number;
  private timeoutId: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private isStopped: boolean = true;
  private pollIntervalMs: number;
  private lastSnapshot: SpotifyPlayerSnapshot | null = null;
  private lastPollTime: number = 0;
  private callbacks: HostMonitorCallbacks;
  private fetchPlayerSnapshot: () => Promise<SpotifyPlayerSnapshot | null>;

  constructor(
    roomId: string,
    initialSequence: number = 0,
    callbacks: HostMonitorCallbacks,
    fetchSnapshot: () => Promise<SpotifyPlayerSnapshot | null>,
    settings?: Partial<RoomSettings>
  ) {
    this.roomId = roomId;
    this.sequenceNumber = initialSequence;
    this.callbacks = callbacks;
    this.fetchPlayerSnapshot = fetchSnapshot;
    this.pollIntervalMs = settings?.hostPollIntervalMs ?? DEFAULT_SYNC_SETTINGS.hostPollIntervalMs;
  }

  public start(): void {
    if (!this.isStopped && this.timeoutId) return;
    this.isStopped = false;
    this.scheduleNext(0); // immediate initial check
  }

  public stop(): void {
    this.isStopped = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  public triggerImmediateCheck(): void {
    if (this.isStopped) return;
    this.scheduleNext(0);
  }

  public getSequenceNumber(): number {
    return this.sequenceNumber;
  }

  private scheduleNext(delayMs: number): void {
    if (this.isStopped) return;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.timeoutId = setTimeout(() => this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
    if (this.isPolling || this.isStopped) return;
    this.isPolling = true;

    let nextDelay = this.pollIntervalMs;

    try {
      const now = Date.now();
      const current = await this.fetchPlayerSnapshot();

      if (!current) {
        // Player inactive / no active device: back off to 6s
        nextDelay = Math.max(this.pollIntervalMs * 2, 6000);
        return;
      }

      // If paused: back off to 5s to conserve Vercel/Spotify quotas
      if (!current.isPlaying) {
        nextDelay = Math.max(this.pollIntervalMs * 1.6, 5000);
      }

      // If browser tab is hidden in background: throttle to 10s
      if (typeof document !== "undefined" && document.hidden) {
        nextDelay = 10000;
      }

      const hasChanged = this.detectStateChange(this.lastSnapshot, current, now);

      if (hasChanged) {
        this.sequenceNumber++;
        const event: PlaybackBroadcastEvent = {
          type: "playback_update",
          roomId: this.roomId,
          sequenceNumber: this.sequenceNumber,
          trackUri: current.item?.uri ?? null,
          trackId: current.item?.id ?? null,
          trackName: current.item?.name ?? null,
          artistName: current.item?.artistName ?? null,
          albumName: current.item?.albumName ?? null,
          albumArtUrl: current.item?.albumArtUrl ?? null,
          albumUri: current.item?.albumUri ?? null,
          contextUri: current.item?.contextUri ?? null,
          durationMs: current.item?.durationMs ?? 0,
          isPlaying: current.isPlaying,
          positionMs: current.progressMs,
          serverTimestamp: now,
        };

        this.lastSnapshot = current;
        this.lastPollTime = now;
        await this.callbacks.onStateChange(event);
      } else {
        this.lastSnapshot = current;
        this.lastPollTime = now;
      }
    } catch (err) {
      this.callbacks.onError?.(err as Error);
      nextDelay = Math.max(this.pollIntervalMs * 2, 5000);
    } finally {
      this.isPolling = false;
      this.scheduleNext(nextDelay);
    }
  }

  public detectStateChange(
    prev: SpotifyPlayerSnapshot | null,
    curr: SpotifyPlayerSnapshot,
    now: number
  ): boolean {
    if (!prev) return true;

    // Track change
    if (prev.item?.uri !== curr.item?.uri) {
      return true;
    }

    // Play/Pause toggle
    if (prev.isPlaying !== curr.isPlaying) {
      return true;
    }

    // Detect Seek jump
    if (prev.isPlaying && curr.isPlaying) {
      const elapsedWallClock = now - this.lastPollTime;
      const expectedProgress = prev.progressMs + elapsedWallClock;
      const jump = Math.abs(curr.progressMs - expectedProgress);

      // If user jumped more than 2.5 seconds ahead or backwards
      if (jump > 2500) {
        return true;
      }
    }

    return false;
  }
}
