export type SubscriptionTier = "premium" | "free" | "open";

export interface UserProfile {
  id: string;
  spotify_user_id: string;
  display_name: string;
  email?: string | null;
  avatar_url?: string | null;
  product: SubscriptionTier;
  created_at: string;
  updated_at: string;
}

export interface EncryptedTokenRecord {
  user_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  token_iv: string;
  token_auth_tag: string;
  refresh_token_iv: string;
  refresh_token_auth_tag: string;
  expires_at: string;
  scope: string;
  created_at: string;
  updated_at: string;
}

export interface RoomSettings {
  driftToleranceMs: number;
  correctionThresholdMs: number;
  hostPollIntervalMs: number;
  listenerSyncIntervalMs: number;
}

export interface Room {
  id: string;
  room_code: string;
  name: string;
  host_user_id: string;
  status: "active" | "closed";
  settings: RoomSettings;
  created_at: string;
  updated_at: string;
}

export type MemberRole = "host" | "listener";
export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";
export type SyncStatus = "in_sync" | "syncing" | "drift_detected" | "paused" | "error" | "reconnecting";

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: MemberRole;
  device_id: string | null;
  device_name: string | null;
  connection_status: ConnectionStatus;
  sync_status: SyncStatus;
  joined_at: string;
  last_seen_at: string;
  profile?: UserProfile;
}

export interface RoomPlaybackState {
  room_id: string;
  track_uri: string | null;
  track_id: string | null;
  track_name: string | null;
  artist_name: string | null;
  album_name: string | null;
  album_art_url: string | null;
  duration_ms: number;
  is_playing: boolean;
  position_ms: number;
  sequence_number: number;
  host_device_id: string | null;
  server_timestamp: number;
  synced_at: string;
}

export interface PlaybackBroadcastEvent {
  type: "playback_update";
  roomId: string;
  sequenceNumber: number;
  trackUri: string | null;
  trackId: string | null;
  trackName: string | null;
  artistName: string | null;
  albumName: string | null;
  albumArtUrl: string | null;
  durationMs: number;
  isPlaying: boolean;
  positionMs: number;
  serverTimestamp: number;
}

export interface SpotifyDevice {
  id: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
}

export type SyncActionType = "NONE" | "PLAY" | "PAUSE" | "SEEK" | "CHANGE_TRACK";

export interface SyncEvaluation {
  action: SyncActionType;
  driftMs: number;
  targetPositionMs: number;
  currentPositionMs: number;
  reason: string;
}

export interface SpotifyAuthSession {
  userId: string;
  spotifyUserId: string;
  displayName: string;
  product: SubscriptionTier;
  avatarUrl: string | null;
  expiresAt: number;
}

