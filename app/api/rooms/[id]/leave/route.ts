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
  const room = globalRoomStore.getRoom(id);
  const roomId = room?.id || id;

  globalRoomStore.removeMember(roomId, session.userId);

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    await supabase
      .from("room_members")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", session.userId);
  }

  return NextResponse.json({ success: true, message: "Left room successfully" });
}

