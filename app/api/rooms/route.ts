import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { globalRoomStore } from "@/lib/store/roomStore";
import { generateRoomCode } from "@/lib/utils";
import { Room } from "@/types";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    // Get rooms user has joined or created
    const { data: memberEntries } = await supabase
      .from("room_members")
      .select("room_id")
      .eq("user_id", session.userId);

    const roomIds = memberEntries?.map((m) => m.room_id) || [];

    const { data: rooms, error } = await supabase
      .from("rooms")
      .select("*")
      .or(`host_user_id.eq.${session.userId},id.in.(${roomIds.length > 0 ? roomIds.join(",") : "00000000-0000-0000-0000-000000000000"})`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[GET /api/rooms] Supabase error:", error);
    } else if (rooms && rooms.length > 0) {
      return NextResponse.json({ rooms });
    }
  }

  const rooms = globalRoomStore.getRecentRoomsForUser(session.userId);
  return NextResponse.json({ rooms });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string } = {};
  try {
    body = await request.json();
  } catch {
    // defaults
  }

  const roomName = body.name?.trim() || `${session.displayName}'s Room`;
  const roomCode = generateRoomCode();
  const roomId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newRoom: Room = {
    id: roomId,
    room_code: roomCode,
    name: roomName,
    host_user_id: session.userId,
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

  // Keep fallback store in sync
  const createdRoom = newRoom;
  globalRoomStore.saveRoom(createdRoom);

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { error: roomErr } = await supabase.from("rooms").insert({
      id: createdRoom.id,
      room_code: createdRoom.room_code,
      name: createdRoom.name,
      host_user_id: session.userId,
      status: "active",
      settings: createdRoom.settings,
    });

    if (roomErr) {
      console.error("[POST /api/rooms] Error creating room in Supabase:", roomErr);
      return NextResponse.json({ error: roomErr.message || "Failed to create room in database" }, { status: 500 });
    }

    // Insert host member
    await supabase.from("room_members").upsert({
      room_id: createdRoom.id,
      user_id: session.userId,
      role: "host",
      connection_status: "connected",
      sync_status: "in_sync",
    });

    // Initialize playback state
    await supabase.from("room_playback_states").upsert({
      room_id: createdRoom.id,
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
      server_timestamp: Date.now(),
    });
  }

  return NextResponse.json({ room: createdRoom }, { status: 201 });
}

