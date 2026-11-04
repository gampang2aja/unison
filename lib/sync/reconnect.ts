import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { PlaybackBroadcastEvent } from "@/types";

export interface RoomConnectionCallbacks {
  onPlaybackUpdate: (event: PlaybackBroadcastEvent) => void;
  onPresenceSync: (members: Record<string, unknown>[]) => void;
  onConnectionStatusChange: (status: "connected" | "disconnected" | "reconnecting") => void;
  onHostStatusChange: (isHostOnline: boolean) => void;
  onError?: (error: Error) => void;
}

export class RoomRealtimeManager {
  private supabase: SupabaseClient;
  private roomId: string;
  private currentUserId: string;
  private channel: RealtimeChannel | null = null;
  private callbacks: RoomConnectionCallbacks;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 5;
  private isDisposed: boolean = false;

  constructor(
    supabase: SupabaseClient,
    roomId: string,
    currentUserId: string,
    callbacks: RoomConnectionCallbacks
  ) {
    this.supabase = supabase;
    this.roomId = roomId;
    this.currentUserId = currentUserId;
    this.callbacks = callbacks;
  }

  public subscribe(): void {
    if (this.isDisposed) return;

    this.callbacks.onConnectionStatusChange("reconnecting");
    const channelName = `room:${this.roomId}`;

    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { ack: true },
        presence: { key: this.currentUserId },
      },
    });

    // Listen to broadcast playback updates
    this.channel.on(
      "broadcast",
      { event: "playback_update" },
      ({ payload }) => {
        this.callbacks.onPlaybackUpdate(payload as PlaybackBroadcastEvent);
      }
    );

    // Track room presence (members in room)
    this.channel.on("presence", { event: "sync" }, () => {
      if (!this.channel) return;
      const state = this.channel.presenceState();
      const members = Object.values(state).flat() as Record<string, unknown>[];
      this.callbacks.onPresenceSync(members);

      // Check if host is present in the presence list
      const hasHost = members.some((m) => m.role === "host");
      this.callbacks.onHostStatusChange(hasHost);
    });

    this.channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        this.reconnectAttempts = 0;
        this.callbacks.onConnectionStatusChange("connected");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        this.callbacks.onConnectionStatusChange("disconnected");
        this.handleReconnect();
      }
    });
  }

  public async trackPresence(memberData: Record<string, unknown>): Promise<void> {
    if (this.channel) {
      await this.channel.track(memberData);
    }
  }

  public async broadcastPlaybackUpdate(event: PlaybackBroadcastEvent): Promise<void> {
    if (this.channel) {
      await this.channel.send({
        type: "broadcast",
        event: "playback_update",
        payload: event,
      });
    }
  }

  private handleReconnect(): void {
    if (this.isDisposed) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);
      console.warn(`[RoomRealtimeManager] Reconnecting in ${delayMs}ms (attempt ${this.reconnectAttempts})...`);

      setTimeout(() => {
        if (!this.isDisposed) {
          if (this.channel) {
            this.supabase.removeChannel(this.channel);
          }
          this.subscribe();
        }
      }, delayMs);
    } else {
      this.callbacks.onError?.(
        new Error("Failed to re-establish realtime room connection after maximum retries.")
      );
    }
  }

  public unsubscribe(): void {
    this.isDisposed = true;
    if (this.channel) {
      this.channel.untrack();
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
