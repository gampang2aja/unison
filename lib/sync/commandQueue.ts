import { PlaybackBroadcastEvent, SyncActionType } from "@/types";

export interface QueuedCommand {
  sequenceNumber: number;
  action: SyncActionType;
  trackUri: string | null;
  targetPositionMs: number;
  contextUri?: string | null;
  albumUri?: string | null;
  timestamp: number;
}

export type CommandExecutor = (command: QueuedCommand) => Promise<void>;

export class PlaybackCommandQueue {
  private lastProcessedSequence: number = 0;
  private lastExecutedCommand: QueuedCommand | null = null;
  private isExecuting: boolean = false;
  private pendingCommand: QueuedCommand | null = null;
  private lastExecutionTime: number = 0;
  private readonly minCommandIntervalMs: number = 500; // prevent rapid API spam
  private executor: CommandExecutor | null = null;

  constructor(initialSequence: number = 0) {
    this.lastProcessedSequence = initialSequence;
  }

  public setExecutor(executor: CommandExecutor): void {
    this.executor = executor;
  }

  public getLastSequence(): number {
    return this.lastProcessedSequence;
  }

  public reset(sequence: number = 0): void {
    this.lastProcessedSequence = sequence;
    this.lastExecutedCommand = null;
    this.pendingCommand = null;
    this.isExecuting = false;
  }

  /**
   * Evaluates and enqueues an incoming playback event.
   * Returns true if accepted, false if rejected (outdated or duplicate).
   */
  public enqueue(
    event: PlaybackBroadcastEvent,
    action: SyncActionType,
    targetPositionMs: number
  ): boolean {
    // 1. Monotonic sequence check: reject older or equal sequence numbers
    if (event.sequenceNumber <= this.lastProcessedSequence) {
      return false;
    }

    const command: QueuedCommand = {
      sequenceNumber: event.sequenceNumber,
      action,
      trackUri: event.trackUri,
      contextUri: event.contextUri,
      albumUri: event.albumUri,
      targetPositionMs,
      timestamp: Date.now(),
    };

    // 2. Duplicate command rejection
    if (this.isDuplicate(command)) {
      this.lastProcessedSequence = event.sequenceNumber;
      return false;
    }

    this.lastProcessedSequence = event.sequenceNumber;
    this.pendingCommand = command;

    this.processQueue();
    return true;
  }

  private isDuplicate(cmd: QueuedCommand): boolean {
    if (!this.lastExecutedCommand) return false;
    const prev = this.lastExecutedCommand;

    if (cmd.action !== prev.action) return false;
    if (cmd.trackUri !== prev.trackUri) return false;

    // For seek or play, if position is within 200ms and occurred within 1.5 seconds, consider duplicate
    if (cmd.timestamp - prev.timestamp < 1500 && Math.abs(cmd.targetPositionMs - prev.targetPositionMs) < 200) {
      return true;
    }

    return false;
  }

  private async processQueue(): Promise<void> {
    if (this.isExecuting || !this.pendingCommand || !this.executor) {
      return;
    }

    const now = Date.now();
    const timeSinceLast = now - this.lastExecutionTime;
    if (timeSinceLast < this.minCommandIntervalMs) {
      const waitTime = this.minCommandIntervalMs - timeSinceLast;
      setTimeout(() => this.processQueue(), waitTime);
      return;
    }

    this.isExecuting = true;
    const commandToRun = this.pendingCommand;
    this.pendingCommand = null;

    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        await this.executor(commandToRun);
        this.lastExecutedCommand = commandToRun;
        this.lastExecutionTime = Date.now();
        break;
      } catch (err) {
        console.warn(`[PlaybackCommandQueue] Execution attempt ${attempts} failed:`, err);
        if (attempts >= maxAttempts) {
          // Log and discard failed command to avoid blocking queue
          console.error(`[PlaybackCommandQueue] Command dropped after ${maxAttempts} failures:`, commandToRun);
        } else {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    this.isExecuting = false;

    // If a newer command arrived while executing, process it immediately
    if (this.pendingCommand) {
      this.processQueue();
    }
  }
}

