import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://unison-spotify.vercel.app";
  return NextResponse.redirect(new URL("/api/auth/login", baseUrl));
}

