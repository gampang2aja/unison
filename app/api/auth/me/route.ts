import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      userId: session.userId,
      spotifyUserId: session.spotifyUserId,
      displayName: session.displayName,
      product: session.product,
      avatarUrl: session.avatarUrl,
      isPremium: session.product === "premium",
    },
  });
}

