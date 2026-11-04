import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { globalRoomStore } from "@/lib/store/roomStore";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized. Please log in first." }, { status: 401 });
  }

  const { id } = await params;
  let body: { deviceId?: string; deviceName?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  let room = globalRoomStore.getRoom(id);

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let query = supabase.from("rooms").select("*");
    if (isUuid) {
      query = query.eq("id", id);
    } else {
      query = query.eq("room_code", id.toUpperCase());
    }

    const { data: dbRoom } = await query.maybeSingle();
    if (dbRoom) room = dbRoom;
  }

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const isHost = room.host_user_id === session.userId;
  const role = isHost ? "host" : "listener";

  // Register membership
  const member = globalRoomStore.addMember(
    room.id,
    session.userId,
    role,
    body.deviceId,
    body.deviceName
  );

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    await supabase.from("room_members").upsert({
      room_id: room.id,
      user_id: session.userId,
      role,
      device_id: body.deviceId || null,
      device_name: body.deviceName || null,
      connection_status: "connected",
      sync_status: "in_sync",
      last_seen_at: new Date().toISOString(),
    });
  }

  const playbackState = globalRoomStore.getPlaybackState(room.id);

  return NextResponse.json({
    success: true,
    room,
    member,
    playbackState,
    isHost,
  });
}

