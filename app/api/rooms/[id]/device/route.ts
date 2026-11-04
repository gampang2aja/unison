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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: { deviceId?: string; deviceName?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { deviceId, deviceName } = body;
  if (!deviceId || !deviceName) {
    return NextResponse.json(
      { error: "deviceId and deviceName are required" },
      { status: 400 }
    );
  }

  const room = globalRoomStore.getRoom(id);
  let roomId = room?.id || id;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let query = supabase.from("rooms").select("id");
    if (isUuid) {
      query = query.eq("id", id);
    } else {
      query = query.eq("room_code", id.toUpperCase());
    }
    const { data: dbRoom } = await query.maybeSingle();
    if (dbRoom) roomId = dbRoom.id;

    // Update room_members table
    await supabase
      .from("room_members")
      .update({
        device_id: deviceId,
        device_name: deviceName,
        last_seen_at: new Date().toISOString(),
      })
      .eq("room_id", roomId)
      .eq("user_id", session.userId);
  }

  globalRoomStore.updateMemberDevice(roomId, session.userId, deviceId, deviceName);

  return NextResponse.json({ success: true, deviceId, deviceName });
}
