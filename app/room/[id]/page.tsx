"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Copy,
  Check,
  Users,
  LogOut,
  AlertTriangle,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlbumArt } from "@/components/player/album-art";
import { ProgressBar } from "@/components/player/progress-bar";
import { DeviceSelector } from "@/components/player/device-selector";
import { MemberList } from "@/components/room/member-list";
import { SyncStatusBadge } from "@/components/room/sync-status-badge";
import { Room, RoomMember, RoomPlaybackState, SpotifyDevice, SyncStatus } from "@/types";
import { ListenerSyncEngine } from "@/lib/sync/listenerSync";
import { HostPlaybackMonitor } from "@/lib/sync/hostMonitor";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { RoomRealtimeManager } from "@/lib/sync/reconnect";

function ListeningRoomContent() {
  const params = useParams();
  const router = useRouter();
  const roomIdOrCode = params.id as string;

  // State
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [playbackState, setPlaybackState] = useState<RoomPlaybackState | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<SpotifyDevice | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("in_sync");
  const [driftMs, setDriftMs] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHostOnline, setIsHostOnline] = useState(true);
  const [loading, setLoading] = useState(true);

  // Engine refs
  const listenerEngineRef = useRef<ListenerSyncEngine | null>(null);
  const hostMonitorRef = useRef<HostPlaybackMonitor | null>(null);
  const realtimeManagerRef = useRef<RoomRealtimeManager | null>(null);
  const playbackStateRef = useRef<RoomPlaybackState | null>(null);
  const currentSequenceRef = useRef<number>(1);

  // Sync ref with state safely inside effect
  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  // Copy invitation link
  const copyInviteLink = () => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/room/${room?.room_code || roomIdOrCode}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Refresh members list from server
  const refreshMembers = useCallback(async () => {
    if (!room) return;
    try {
      const res = await fetch(`/api/rooms/${room.id}`);
      if (res.ok) {
        const details = await res.json();
        if (details.members) setMembers(details.members);
      }
    } catch {}
  }, [room]);

  // Handle active Spotify device selection and persist to room_members
  const handleDeviceSelect = useCallback(async (device: SpotifyDevice) => {
    setSelectedDevice(device);

    // Optimistically update device_name in members list
    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === currentUserId
          ? { ...m, device_id: device.id, device_name: device.name }
          : m
      )
    );

    if (room) {
      try {
        await fetch(`/api/rooms/${room.id}/device`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: device.id,
            deviceName: device.name,
          }),
        });

        // Broadcast device update to other participants in the room
        if (realtimeManagerRef.current) {
          await realtimeManagerRef.current.trackPresence({
            user_id: currentUserId,
            role: isHost ? "host" : "listener",
            device_id: device.id,
            device_name: device.name,
            updated_at: Date.now(),
          });
          await realtimeManagerRef.current.broadcastMembersUpdate();
        }
      } catch (err) {
        console.warn("[Room] Error syncing device to room:", err);
      }
    }
  }, [room, currentUserId, isHost]);

  // 1. Initial Room Join and Setup
  useEffect(() => {
    let isMounted = true;

    async function initRoom() {
      try {
        setLoading(true);
        // Step 1: Join room
        const joinRes = await fetch(`/api/rooms/${roomIdOrCode}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!joinRes.ok) {
          if (joinRes.status === 401) {
            router.push(`/api/auth/login?return_to=/room/${roomIdOrCode}`);
            return;
          }
          const errData = await joinRes.json().catch(() => ({}));
          throw new Error(errData.error || "Room not found or inaccessible");
        }

        const data = await joinRes.json();
        if (!isMounted) return;

        setRoom(data.room);
        setIsHost(data.isHost);
        if (data.playbackState) {
          setPlaybackState(data.playbackState);
          if (data.playbackState.sequence_number) {
            currentSequenceRef.current = Math.max(currentSequenceRef.current, data.playbackState.sequence_number);
          }
        }

        // If current user is host, auto-sync track & device from live Spotify immediately
        if (data.isHost) {
          fetch("/api/spotify/current")
            .then((r) => r.json())
            .then((curr) => {
              if (isMounted && curr?.item) {
                setPlaybackState((prev) => ({
                  ...(prev || ({} as RoomPlaybackState)),
                  room_id: data.room.id,
                  track_uri: curr.item.uri,
                  track_id: curr.item.id,
                  track_name: curr.item.name,
                  artist_name: curr.item.artistName,
                  album_name: curr.item.albumName,
                  album_art_url: curr.item.albumArtUrl,
                  duration_ms: curr.item.durationMs,
                  is_playing: curr.isPlaying,
                  position_ms: curr.progressMs,
                  sequence_number: (prev?.sequence_number || 1) + 1,
                  server_timestamp: curr.timestamp || Date.now(),
                  synced_at: new Date().toISOString(),
                  host_device_id: curr.device?.id || null,
                }));

                // Auto-sync host device
                if (curr.device) {
                  setSelectedDevice(curr.device);
                  fetch(`/api/rooms/${data.room.id}/device`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      deviceId: curr.device.id,
                      deviceName: curr.device.name,
                    }),
                  }).catch(() => {});
                  setMembers((prev) =>
                    prev.map((m) =>
                      m.user_id === data.room.host_user_id
                        ? { ...m, device_id: curr.device.id, device_name: curr.device.name }
                        : m
                    )
                  );
                }
              }
            })
            .catch(() => {});
        }

        // Fetch full room details (members list)
        const roomDetailsRes = await fetch(`/api/rooms/${data.room.id}`);
        if (roomDetailsRes.ok) {
          const details = await roomDetailsRes.json();
          if (isMounted) {
            setMembers(details.members || []);
            setCurrentUserId(details.currentUserId);
          }
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (isMounted) setErrorMessage(error.message || "Failed to enter room");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initRoom();

    return () => {
      isMounted = false;
    };
  }, [roomIdOrCode, router]);

  // 2. Setup Realtime Broadcast / Presence
  useEffect(() => {
    if (!room || !currentUserId) return;

    const supabase = getSupabaseBrowserClient();
    const manager = new RoomRealtimeManager(supabase, room.id, currentUserId, {
      onPlaybackUpdate: (event) => {
        currentSequenceRef.current = Math.max(currentSequenceRef.current, event.sequenceNumber);
        setPlaybackState((prev) => ({
          ...(prev || ({} as RoomPlaybackState)),
          room_id: event.roomId,
          track_uri: event.trackUri,
          track_id: event.trackId,
          track_name: event.trackName,
          artist_name: event.artistName,
          album_name: event.albumName,
          album_art_url: event.albumArtUrl,
          duration_ms: event.durationMs,
          is_playing: event.isPlaying,
          position_ms: event.positionMs,
          sequence_number: event.sequenceNumber,
          server_timestamp: event.serverTimestamp,
          synced_at: new Date().toISOString(),
          host_device_id: null,
        }));

        // Notify listener sync engine
        if (!isHost && listenerEngineRef.current) {
          listenerEngineRef.current.handleBroadcastEvent(event);
        }
      },
      onMembersChange: () => {
        refreshMembers();
      },
      onPresenceSync: () => {
        refreshMembers();
      },
      onConnectionStatusChange: (status) => {
        if (status === "reconnecting") setSyncStatus("reconnecting");
      },
      onHostStatusChange: (online) => {
        setIsHostOnline(online);
      },
    });

    realtimeManagerRef.current = manager;
    manager.subscribe();

    // Polling fallback to guarantee fresh member list across any network conditions
    const memberPollInterval = setInterval(() => {
      refreshMembers();
    }, 4000);

    return () => {
      clearInterval(memberPollInterval);
      manager.unsubscribe();
    };
  }, [room, currentUserId, isHost, refreshMembers]);

  // 3. Host Playback Monitoring Engine (Only when current user is Host)
  useEffect(() => {
    if (!isHost || !room) return;

    const monitor = new HostPlaybackMonitor(
      room.id,
      currentSequenceRef.current,
      {
        onStateChange: async (event) => {
          currentSequenceRef.current = event.sequenceNumber;
          setPlaybackState((prev) => ({
            ...(prev || ({} as RoomPlaybackState)),
            room_id: event.roomId,
            track_uri: event.trackUri,
            track_id: event.trackId,
            track_name: event.trackName,
            artist_name: event.artistName,
            album_name: event.albumName,
            album_art_url: event.albumArtUrl,
            duration_ms: event.durationMs,
            is_playing: event.isPlaying,
            position_ms: event.positionMs,
            sequence_number: event.sequenceNumber,
            server_timestamp: event.serverTimestamp,
            synced_at: new Date().toISOString(),
            host_device_id: selectedDevice?.id || null,
          }));

          // Broadcast to Realtime channel
          if (realtimeManagerRef.current) {
            await realtimeManagerRef.current.broadcastPlaybackUpdate(event);
          }

          // Persist to server
          await fetch(`/api/rooms/${room.id}/playback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(event),
          });
        },
        onError: (err) => {
          console.warn("[HostMonitor] Poll warning:", err.message);
        },
      },
      async () => {
        // Query current playback directly from Spotify Web API
        const res = await fetch("/api/spotify/current");
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || !data.item) return null;

        return {
          isPlaying: data.isPlaying,
          progressMs: data.progressMs,
          timestamp: data.timestamp || Date.now(),
          item: data.item,
          deviceId: data.device?.id || null,
        };
      }
    );

    hostMonitorRef.current = monitor;
    monitor.start();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        monitor.triggerImmediateCheck();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      monitor.stop();
    };
  }, [isHost, room, selectedDevice?.id]);

  // 4. Listener Automatic Synchronization Engine (Only when current user is Listener)
  useEffect(() => {
    if (isHost || !room) return;

    const engine = new ListenerSyncEngine(
      {
        onSyncStatusChange: (status, evaluation) => {
          setSyncStatus(status);
          if (evaluation) {
            setDriftMs(evaluation.driftMs);
          }
        },
        executePlaybackCommand: async (cmd) => {
          const res = await fetch("/api/spotify/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: cmd.action,
              trackUri: cmd.trackUri,
              positionMs: cmd.targetPositionMs,
              deviceId: selectedDevice?.id,
            }),
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Sync playback command failed");
          }
        },
        getLocalPlaybackStatus: async () => {
          try {
            const res = await fetch("/api/spotify/current");
            if (res.ok) {
              const data = await res.json();
              if (data && data.item) {
                return {
                  trackUri: data.item.uri || null,
                  isPlaying: Boolean(data.isPlaying),
                  positionMs: data.progressMs || 0,
                };
              }
            }
          } catch (e) {
            console.warn("[ListenerSync] Error querying current playback:", e);
          }
          return {
            trackUri: null,
            isPlaying: false,
            positionMs: 0,
          };
        },
        onError: (err) => {
          setErrorMessage(err.message);
        },
      },
      room.settings
    );

    listenerEngineRef.current = engine;
    engine.start();

    // If room already has playback state, seed listener engine immediately upon joining!
    const currentPb = playbackStateRef.current;
    if (currentPb && currentPb.track_uri) {
      engine.handleBroadcastEvent({
        type: "playback_update",
        roomId: room.id,
        trackUri: currentPb.track_uri,
        trackId: currentPb.track_id,
        trackName: currentPb.track_name,
        artistName: currentPb.artist_name,
        albumName: currentPb.album_name,
        albumArtUrl: currentPb.album_art_url,
        durationMs: currentPb.duration_ms,
        isPlaying: currentPb.is_playing,
        positionMs: currentPb.position_ms,
        sequenceNumber: currentPb.sequence_number,
        serverTimestamp: currentPb.server_timestamp,
      });
    }

    return () => {
      engine.stop();
    };
  }, [isHost, room, selectedDevice?.id]);

  // Host playback controls
  const executeHostControl = async (action: string, positionMs?: number) => {
    setErrorMessage(null);
    try {
      const res = await fetch("/api/spotify/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          positionMs,
          deviceId: selectedDevice?.id,
          trackUri: playbackState?.track_uri,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json();
        setErrorMessage(errorJson.error || "Playback command failed");
      } else {
        // Optimistic state update for instant UI feedback
        if (action === "play") {
          setPlaybackState((p) => (p ? { ...p, is_playing: true } : null));
        } else if (action === "pause") {
          setPlaybackState((p) => (p ? { ...p, is_playing: false } : null));
        } else if (action === "seek" && positionMs !== undefined) {
          setPlaybackState((p) => (p ? { ...p, position_ms: positionMs } : null));
        }

        // Trigger immediate Spotify check and Realtime broadcast for low latency
        setTimeout(() => hostMonitorRef.current?.triggerImmediateCheck(), 350);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(error.message);
    }
  };

  const handleLeaveRoom = async () => {
    if (room) {
      await fetch(`/api/rooms/${room.id}/leave`, { method: "POST" });
    }
    router.push("/dashboard");
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        <p className="text-xs text-zinc-400">Entering Listening Room...</p>
      </div>
    );
  }

  if (errorMessage && !room) {
    return (
      <div className="max-w-md mx-auto my-auto p-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">Unable to Enter Room</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">{errorMessage}</p>
        <Link href="/dashboard">
          <Button variant="secondary" size="sm">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const trackName = playbackState?.track_name || (isHost ? "No track playing" : "Waiting for Host");
  const artistName = playbackState?.artist_name || (isHost ? "Open Spotify on your device to play music" : "Host has not started playback yet");
  const albumName = playbackState?.album_name || "";
  const isPlaying = playbackState?.is_playing || false;
  const currentPos = playbackState?.position_ms || 0;
  const durationMs = playbackState?.duration_ms || 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Room Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-white">{room?.name}</h1>
            <Badge variant="outline" className="font-mono text-xs">
              Code: {room?.room_code}
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
            <span>{isHost ? "You are the Host" : "Joined as Listener"}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-zinc-500" />
              {members.length} listening
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Share Invitation Link */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyInviteLink}
            className="flex-1 sm:flex-initial text-xs gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Link Copied!" : "Invite Friends"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLeaveRoom}
            className="text-xs text-zinc-400 hover:text-rose-400 gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            Leave
          </Button>
        </div>
      </div>

      {/* Host Disconnect Warning Banner */}
      {!isHost && !isHostOnline && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Host is currently disconnected. Synchronization is paused until the Host reconnects.</span>
        </div>
      )}

      {/* API Notice / Error banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-zinc-400 hover:text-white text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Player on left, Member list on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Primary Player Card */}
        <div className="lg:col-span-2 p-6 sm:p-8 rounded-3xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-xl shadow-2xl space-y-6">
          {/* Top Status Bar: Sync Badge & Spotify Device */}
          <div className="flex items-center justify-between gap-2">
            {isHost ? (
              <Badge variant="default" className="text-xs">
                <Crown className="w-3 h-3 text-amber-300 mr-1" /> Host Broadcasting
              </Badge>
            ) : (
              <SyncStatusBadge status={syncStatus} driftMs={driftMs} />
            )}

            <DeviceSelector
              selectedDeviceId={selectedDevice?.id || null}
              onDeviceSelect={handleDeviceSelect}
            />
          </div>

          {/* High-quality Album Artwork */}
          <AlbumArt
            url={playbackState?.album_art_url || null}
            trackName={trackName}
            isPlaying={isPlaying}
          />

          {/* Track Info */}
          <div className="text-center space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate max-w-lg mx-auto">
              {trackName}
            </h2>
            <p className="text-sm text-zinc-400 font-medium truncate max-w-md mx-auto">
              {artistName} {albumName ? `• ${albumName}` : ""}
            </p>
          </div>

          {/* Progress Bar */}
          <ProgressBar
            currentPositionMs={currentPos}
            durationMs={durationMs}
            isPlaying={isPlaying}
            isHost={isHost}
            onSeek={(seekMs) => executeHostControl("seek", seekMs)}
          />

          {/* Playback Controls (Host Only) */}
          {isHost ? (
            <div className="pt-2 flex items-center justify-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-zinc-300 hover:text-white"
                onClick={() => executeHostControl("previous")}
                title="Previous track"
              >
                <SkipBack className="w-5 h-5" />
              </Button>

              <Button
                variant="default"
                size="icon"
                className="h-14 w-14 rounded-full bg-violet-500 hover:bg-violet-600 shadow-xl shadow-violet-500/25"
                onClick={() => executeHostControl(isPlaying ? "pause" : "play")}
                title={isPlaying ? "Pause playback" : "Start playback"}
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current translate-x-0.5" />}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-zinc-300 hover:text-white"
                onClick={() => executeHostControl("next")}
                title="Next track"
              >
                <SkipForward className="w-5 h-5" />
              </Button>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-center text-xs text-zinc-400">
              <span className="text-violet-300 font-medium">Automatic Follower Active.</span> Your Spotify playback device will mirror the Host&apos;s actions automatically.
            </div>
          )}
        </div>

        {/* Room Sidebar: Members & Room Info */}
        <div className="space-y-6">
          <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
            <MemberList
              members={members}
              currentUserId={currentUserId}
            />
          </div>

          {/* Synchronization Engine Diagnostics Card */}
          <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-md space-y-3 text-xs">
            <div className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px]">
              Engine Diagnostics
            </div>
            <div className="space-y-2 text-zinc-400 font-mono text-[11px]">
              <div className="flex justify-between">
                <span>Tolerance:</span>
                <span className="text-zinc-200">±300 ms</span>
              </div>
              <div className="flex justify-between">
                <span>Correction Threshold:</span>
                <span className="text-zinc-200">1500 ms</span>
              </div>
              <div className="flex justify-between">
                <span>Sequence Number:</span>
                <span className="text-violet-300">#{playbackState?.sequence_number || 1}</span>
              </div>
              <div className="flex justify-between">
                <span>Channel:</span>
                <span className="text-emerald-400">Supabase Realtime</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ListeningRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <p className="text-xs text-zinc-400">Loading Listening Room...</p>
        </div>
      }
    >
      <ListeningRoomContent />
    </Suspense>
  );
}
