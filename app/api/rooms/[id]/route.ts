import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { globalRoomStore } from "@/lib/store/roomStore";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const { id } = await params;

  let room = globalRoomStore.getRoom(id);
  let members = room ? globalRoomStore.getMembers(room.id) : [];
  let playbackState = room ? globalRoomStore.getPlaybackState(room.id) : null;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    // Query by ID or room_code
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let query = supabase.from("rooms").select("*");
    if (isUuid) {
      query = query.eq("id", id);
    } else {
      query = query.eq("room_code", id.toUpperCase());
    }

    const { data: dbRoom } = await query.maybeSingle();

    if (dbRoom) {
      room = dbRoom;

      // Fetch members with profiles
      const { data: dbMembers } = await supabase
        .from("room_members")
        .select("*, profile:profiles(*)")
        .eq("room_id", dbRoom.id);

      if (dbMembers) {
        members = dbMembers;
      }

      // Fetch playback state
      const { data: dbPlayback } = await supabase
        .from("room_playback_states")
        .select("*")
        .eq("room_id", dbRoom.id)
        .maybeSingle();

      if (dbPlayback) {
        playbackState = dbPlayback;
      }
    }
  }

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const isHost = session?.userId === room.host_user_id;

  return NextResponse.json({
    room,
    members,
    playbackState,
    isHost,
    currentUserId: session?.userId || null,
  });
}

