/**
 * NTP-style Clock Offset Estimator.
 * Estimates time skew between client local clock and server/Spotify clock.
 */
export class ClockSync {
  private offsetMs: number = 0;
  private samples: number[] = [];
  private readonly maxSamples: number = 5;

  constructor(initialOffset: number = 0) {
    this.offsetMs = initialOffset;
  }

  /**
   * Record NTP-style roundtrip sample:
   * t0: client send time (ms)
   * t1: server receive time (ms)
   * t2: server reply time (ms)
   * t3: client receive time (ms)
   */
  public addSample(t0: number, t1: number, t2: number, t3: number): number {
    const offset = ((t1 - t0) + (t2 - t3)) / 2;

    this.samples.push(offset);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    // Median filter to eliminate network jitter spikes
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.offsetMs = Math.round(median);

    return this.offsetMs;
  }

  /**
   * Simplified one-way sync using server timestamp from broadcast event.
   */
  public updateFromServerTimestamp(serverTimestamp: number, clientReceivedTimestamp: number = Date.now()): void {
    const rawOffset = serverTimestamp - clientReceivedTimestamp;
    this.samples.push(rawOffset);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
    const sorted = [...this.samples].sort((a, b) => a - b);
    this.offsetMs = Math.round(sorted[Math.floor(sorted.length / 2)]);
  }

  /**
   * Current estimated server/world time in milliseconds.
   */
  public now(): number {
    return Date.now() + this.offsetMs;
  }

  public getOffset(): number {
    return this.offsetMs;
  }

  public reset(): void {
    this.offsetMs = 0;
    this.samples = [];
  }
}

export const globalClock = new ClockSync();
