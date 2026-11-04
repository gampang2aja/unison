"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowRight, Users, Radio, Crown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Room } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{
    userId: string;
    displayName: string;
    product: string;
    avatarUrl: string | null;
    isPremium: boolean;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomNameInput, setRoomNameInput] = useState("");
  const [recentRooms, setRecentRooms] = useState<Room[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Fetch user session
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push("/api/auth/login");
        } else {
          setUser(data.user);
          // 2. Fetch rooms
          return fetch("/api/rooms").then((r) => r.json());
        }
      })
      .then((roomsData) => {
        if (roomsData?.rooms) {
          setRecentRooms(roomsData.rooms);
        }
      })
      .catch((err) => console.error("Error loading dashboard:", err))
      .finally(() => setLoading(false));
  }, [router]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomNameInput.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.room) {
        router.push(`/room/${data.room.id}`);
      }
    } catch (err) {
      console.error("Failed to create room:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) return;

    // Direct navigate to room by code
    router.push(`/room/${encodeURIComponent(code)}`);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {/* Profile & Status Card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              className="w-14 h-14 rounded-full object-cover ring-2 ring-violet-500/40"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-violet-950 border border-violet-700/60 flex items-center justify-center text-xl font-bold text-violet-300">
              {user?.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Welcome back, {user?.displayName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Spotify Connected
              </span>
              <span className="text-zinc-600">•</span>
              {user?.isPremium ? (
                <span className="flex items-center gap-1 text-xs text-amber-300 font-medium">
                  <Crown className="w-3 h-3" /> Premium Account
                </span>
              ) : (
                <span className="text-xs text-zinc-400">Free Account</span>
              )}
            </div>
          </div>
        </div>

        {!user?.isPremium && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Note: Automated Spotify playback control requires Spotify Premium.</span>
          </div>
        )}
      </div>

      {/* Main Room Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create Room */}
        <Card className="flex flex-col justify-between border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 mb-2">
              <Plus className="w-5 h-5" />
            </div>
            <CardTitle>Create a Listening Room</CardTitle>
            <CardDescription>
              Start a new session as Host. Control the music while listeners follow automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <Input
                placeholder="Room name (e.g., Chill Waves, Late Night)"
                value={roomNameInput}
                onChange={(e) => setRoomNameInput(e.target.value)}
                maxLength={40}
              />
              <Button type="submit" disabled={creating} className="w-full gap-2">
                {creating ? "Creating..." : "Create Room"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Join Room */}
        <Card className="flex flex-col justify-between border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-300 mb-2">
              <Users className="w-5 h-5" />
            </div>
            <CardTitle>Join an Existing Room</CardTitle>
            <CardDescription>
              Enter a 8-character room code (e.g. ECHO-4092) or paste an invitation link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <Input
                placeholder="Enter room code (e.g. ECHO-4092)"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                maxLength={20}
              />
              {joinError && <p className="text-xs text-rose-400">{joinError}</p>}
              <Button type="submit" variant="secondary" className="w-full gap-2">
                Join Room
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Recent Rooms */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Radio className="w-4 h-4 text-violet-400" />
          Recent Rooms
        </h2>

        {recentRooms.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-zinc-800/80 bg-zinc-900/30 text-zinc-500 text-sm">
            You haven&apos;t joined or created any rooms yet. Create your first room above!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recentRooms.map((room) => {
              const isHost = room.host_user_id === user?.userId;
              return (
                <Link
                  key={room.id}
                  href={`/room/${room.id}`}
                  className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-850 hover:border-violet-500/30 transition-all flex items-center justify-between group"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-200 group-hover:text-violet-300 truncate">
                        {room.name}
                      </span>
                      {isHost && (
                        <span className="text-[10px] bg-amber-400/10 text-amber-300 border border-amber-400/20 px-1.5 py-0.2 rounded font-medium">
                          Host
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 font-mono mt-1">
                      Code: {room.room_code}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 group-hover:translate-x-1 transition-all shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
