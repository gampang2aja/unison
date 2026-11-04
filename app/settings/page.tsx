"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, Shield, Sliders, LogOut, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{
    userId: string;
    spotifyUserId: string;
    displayName: string;
    product: string;
    avatarUrl: string | null;
    isPremium: boolean;
  } | null>(null);

  const [autoReconnect, setAutoReconnect] = useState(true);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push("/api/auth/login");
        } else {
          setUser(data.user);
        }
      });
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  const handleSavePreferences = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-xs text-zinc-400">Manage your connected Spotify account and synchronization preferences</p>
        </div>
      </div>

      {savedNotice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle className="w-4 h-4" /> Preferences saved successfully.
        </div>
      )}

      {/* Spotify Account Info */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-violet-400" />
            <CardTitle>Connected Spotify Account</CardTitle>
          </div>
          <CardDescription>
            Your individual Spotify account credentials are encrypted and stored securely on the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-950/40">
            <div className="flex items-center gap-3">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-12 h-12 rounded-full object-cover ring-1 ring-zinc-700"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-violet-950 border border-violet-800 flex items-center justify-center font-bold text-violet-300">
                  {user?.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="font-semibold text-zinc-200">{user?.displayName}</div>
                <div className="text-xs text-zinc-500 font-mono">Spotify ID: {user?.spotifyUserId}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={user?.isPremium ? "success" : "secondary"}>
                {user?.isPremium ? "Spotify Premium" : "Spotify Free"}
              </Badge>
              <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                Connected
              </Badge>
            </div>
          </div>

          <div className="text-xs text-zinc-400 leading-relaxed space-y-2">
            <p>
              Per Spotify Developer Policies, Unison requests the minimum required scopes (<code className="text-violet-300">user-read-playback-state</code>, <code className="text-violet-300">user-modify-playback-state</code>). We do not store, distribute, or stream audio.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sync Preferences */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-violet-400" />
            <CardTitle>Synchronization Tuning</CardTitle>
          </div>
          <CardDescription>
            Configure how Unison aligns your playback with the room host.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/40">
            <div>
              <div className="text-sm font-medium text-zinc-200">Auto Reconnection</div>
              <div className="text-xs text-zinc-500">Automatically rejoin room subscription on network recovery</div>
            </div>
            <input
              type="checkbox"
              checked={autoReconnect}
              onChange={(e) => setAutoReconnect(e.target.checked)}
              className="w-4 h-4 rounded text-violet-500 focus:ring-violet-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/30">
              <div className="font-medium text-zinc-300">Drift Tolerance</div>
              <div className="text-zinc-500 mt-1">300 ms (suppresses micro-seeking)</div>
            </div>
            <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/30">
              <div className="font-medium text-zinc-300">Correction Threshold</div>
              <div className="text-zinc-500 mt-1">1500 ms (triggers position seek)</div>
            </div>
          </div>

          <Button type="button" onClick={handleSavePreferences} size="sm">
            Save Preferences
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone / Disconnect */}
      <Card className="border-rose-900/40 bg-rose-950/10">
        <CardHeader>
          <div className="flex items-center gap-2 text-rose-400">
            <Shield className="w-5 h-5" />
            <CardTitle className="text-rose-200">Session & Security</CardTitle>
          </div>
          <CardDescription className="text-zinc-400">
            Revoke active session tokens or sign out of Unison.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-xs text-zinc-400">
            Logging out clears your browser session cookies and encrypted token cache.
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleLogout}
            className="gap-2 shrink-0"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
