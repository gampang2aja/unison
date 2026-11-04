import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { globalRoomStore } from "@/lib/store/roomStore";
import { RoomPlaybackState } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const room = globalRoomStore.getRoom(id);
  const roomId = room?.id || id;

  let state = globalRoomStore.getPlaybackState(roomId);

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data: dbPlayback } = await supabase
      .from("room_playback_states")
      .select("*")
      .eq("room_id", roomId)
      .maybeSingle();

    if (dbPlayback) {
      state = dbPlayback;
    }
  }

  const serverTimestamp = Date.now();

  return NextResponse.json({
    playbackState: state,
    serverTimestamp,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let room = globalRoomStore.getRoom(id);

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data: dbRoom } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (dbRoom) room = dbRoom;
  }

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  // 1. Host authorization check
  if (room.host_user_id !== session.userId) {
    return NextResponse.json(
      { error: "Forbidden: Only the Host can update room playback state" },
      { status: 403 }
    );
  }

  const raw = await request.json();
  const serverTimestamp = Date.now();

  // Normalize camelCase (from PlaybackBroadcastEvent) and snake_case (from RoomPlaybackState)
  const normalized: Partial<RoomPlaybackState> = {
    room_id: room.id,
    track_uri: raw.track_uri !== undefined ? raw.track_uri : (raw.trackUri ?? null),
    track_id: raw.track_id !== undefined ? raw.track_id : (raw.trackId ?? null),
    track_name: raw.track_name !== undefined ? raw.track_name : (raw.trackName ?? null),
    artist_name: raw.artist_name !== undefined ? raw.artist_name : (raw.artistName ?? null),
    album_name: raw.album_name !== undefined ? raw.album_name : (raw.albumName ?? null),
    album_art_url: raw.album_art_url !== undefined ? raw.album_art_url : (raw.albumArtUrl ?? null),
    duration_ms: raw.duration_ms !== undefined ? raw.duration_ms : (raw.durationMs ?? 0),
    is_playing: raw.is_playing !== undefined ? raw.is_playing : (raw.isPlaying ?? false),
    position_ms: raw.position_ms !== undefined ? raw.position_ms : (raw.positionMs ?? 0),
    sequence_number: raw.sequence_number !== undefined ? raw.sequence_number : (raw.sequenceNumber ?? 1),
    host_device_id: raw.host_device_id !== undefined ? raw.host_device_id : (raw.hostDeviceId ?? null),
    server_timestamp: raw.server_timestamp !== undefined ? raw.server_timestamp : (raw.serverTimestamp ?? serverTimestamp),
    synced_at: new Date().toISOString(),
  };

  const updatedState = globalRoomStore.updatePlaybackState(room.id, normalized);

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    await supabase.from("room_playback_states").upsert({
      room_id: room.id,
      track_uri: updatedState.track_uri,
      track_id: updatedState.track_id,
      track_name: updatedState.track_name,
      artist_name: updatedState.artist_name,
      album_name: updatedState.album_name,
      album_art_url: updatedState.album_art_url,
      duration_ms: updatedState.duration_ms,
      is_playing: updatedState.is_playing,
      position_ms: updatedState.position_ms,
      sequence_number: updatedState.sequence_number,
      host_device_id: updatedState.host_device_id,
      server_timestamp: serverTimestamp,
      synced_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    success: true,
    playbackState: updatedState,
    serverTimestamp,
  });
}
