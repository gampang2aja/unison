import { Room, RoomMember, RoomPlaybackState, UserProfile } from "@/types";
import { generateRoomCode } from "@/lib/utils";

/**
 * In-memory fallback repository for rooms and members.
 * Enables zero-setup local development, robust unit testing, and instant dev mode.
 */
class RoomStore {
  private profiles = new Map<string, UserProfile>();
  private rooms = new Map<string, Room>();
  private roomMembers = new Map<string, Map<string, RoomMember>>();
  private playbackStates = new Map<string, RoomPlaybackState>();

  // Profiles
  public upsertProfile(profile: UserProfile): UserProfile {
    this.profiles.set(profile.id, profile);
    return profile;
  }

  public getProfile(id: string): UserProfile | null {
    return this.profiles.get(id) || null;
  }

  public getProfileBySpotifyId(spotifyUserId: string): UserProfile | null {
    for (const p of this.profiles.values()) {
      if (p.spotify_user_id === spotifyUserId) return p;
    }
    return null;
  }

  // Rooms
  public createRoom(name: string, hostUserId: string): Room {
    const roomId = crypto.randomUUID();
    const roomCode = generateRoomCode();
    const now = new Date().toISOString();

    const room: Room = {
      id: roomId,
      room_code: roomCode,
      name,
      host_user_id: hostUserId,
      status: "active",
      settings: {
        driftToleranceMs: 300,
        correctionThresholdMs: 1500,
        hostPollIntervalMs: 2000,
        listenerSyncIntervalMs: 3000,
      },
      created_at: now,
      updated_at: now,
    };

    this.rooms.set(roomId, room);

    // Add host as member
    this.addMember(roomId, hostUserId, "host");

    // Initialize playback state
    this.playbackStates.set(roomId, {
      room_id: roomId,
      track_uri: null,
      track_id: null,
      track_name: null,
      artist_name: null,
      album_name: null,
      album_art_url: null,
      duration_ms: 0,
      is_playing: false,
      position_ms: 0,
      sequence_number: 1,
      host_device_id: null,
      server_timestamp: Date.now(),
      synced_at: now,
    });

    return room;
  }

  public saveRoom(room: Room): Room {
    this.rooms.set(room.id, room);
    if (!this.playbackStates.has(room.id)) {
      this.playbackStates.set(room.id, {
        room_id: room.id,
        track_uri: null,
        track_id: null,
        track_name: null,
        artist_name: null,
        album_name: null,
        album_art_url: null,
        duration_ms: 0,
        is_playing: false,
        position_ms: 0,
        sequence_number: 1,
        host_device_id: null,
        server_timestamp: Date.now(),
        synced_at: new Date().toISOString(),
      });
    }
    return room;
  }

  public getRoom(idOrCode: string): Room | null {
    if (this.rooms.has(idOrCode)) {
      return this.rooms.get(idOrCode)!;
    }
    for (const r of this.rooms.values()) {
      if (r.room_code.toUpperCase() === idOrCode.toUpperCase()) {
        return r;
      }
    }
    return null;
  }

  public getRecentRoomsForUser(userId: string): Room[] {
    const matched: Room[] = [];
    for (const room of this.rooms.values()) {
      const members = this.roomMembers.get(room.id);
      if (room.host_user_id === userId || (members && members.has(userId))) {
        matched.push(room);
      }
    }
    return matched.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  // Members
  public addMember(
    roomId: string,
    userId: string,
    role: "host" | "listener",
    deviceId?: string,
    deviceName?: string
  ): RoomMember {
    if (!this.roomMembers.has(roomId)) {
      this.roomMembers.set(roomId, new Map());
    }

    const members = this.roomMembers.get(roomId)!;
    const now = new Date().toISOString();
    const member: RoomMember = {
      id: crypto.randomUUID(),
      room_id: roomId,
      user_id: userId,
      role,
      device_id: deviceId || null,
      device_name: deviceName || null,
      connection_status: "connected",
      sync_status: "in_sync",
      joined_at: now,
      last_seen_at: now,
      profile: this.getProfile(userId) || undefined,
    };

    members.set(userId, member);
    return member;
  }

  public getMembers(roomId: string): RoomMember[] {
    const members = this.roomMembers.get(roomId);
    if (!members) return [];
    return Array.from(members.values()).map((m) => ({
      ...m,
      profile: this.getProfile(m.user_id) || undefined,
    }));
  }

  public removeMember(roomId: string, userId: string): void {
    const members = this.roomMembers.get(roomId);
    if (members) {
      members.delete(userId);
    }
  }

  public updateMemberDevice(roomId: string, userId: string, deviceId: string, deviceName?: string): void {
    const members = this.roomMembers.get(roomId);
    const member = members?.get(userId);
    if (member) {
      member.device_id = deviceId;
      if (deviceName) member.device_name = deviceName;
      member.last_seen_at = new Date().toISOString();
    }
  }

  public updateMemberStatus(
    roomId: string,
    userId: string,
    connectionStatus?: RoomMember["connection_status"],
    syncStatus?: RoomMember["sync_status"]
  ): void {
    const members = this.roomMembers.get(roomId);
    const member = members?.get(userId);
    if (member) {
      if (connectionStatus) member.connection_status = connectionStatus;
      if (syncStatus) member.sync_status = syncStatus;
      member.last_seen_at = new Date().toISOString();
    }
  }

  // Playback state
  public getPlaybackState(roomId: string): RoomPlaybackState | null {
    return this.playbackStates.get(roomId) || null;
  }

  public updatePlaybackState(roomId: string, updates: Partial<RoomPlaybackState>): RoomPlaybackState {
    const prev = this.getPlaybackState(roomId) || {
      room_id: roomId,
      track_uri: null,
      track_id: null,
      track_name: null,
      artist_name: null,
      album_name: null,
      album_art_url: null,
      duration_ms: 0,
      is_playing: false,
      position_ms: 0,
      sequence_number: 1,
      host_device_id: null,
      server_timestamp: Date.now(),
      synced_at: new Date().toISOString(),
    };

    const next: RoomPlaybackState = {
      ...prev,
      ...updates,
      room_id: roomId,
      server_timestamp: Date.now(),
      synced_at: new Date().toISOString(),
    };

    this.playbackStates.set(roomId, next);
    return next;
  }
}

export const globalRoomStore = new RoomStore();

