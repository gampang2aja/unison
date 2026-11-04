"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Radio, LogOut, Settings as SettingsIcon, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<{
    displayName: string;
    product: string;
    avatarUrl: string | null;
    isPremium: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  };

  return (
    <header className={`sticky top-0 z-40 border-b border-zinc-850/80 bg-zinc-950/80 backdrop-blur-xl ${className}`}>
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-400 group-hover:scale-105 group-hover:border-violet-400 transition-all shadow-md shadow-violet-500/10">
            <Radio className="w-5 h-5 text-violet-300" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-lg tracking-tight text-white group-hover:text-violet-300 transition-colors">
                Unison
              </span>
              <span className="text-[10px] uppercase font-mono tracking-wider text-violet-400/80 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">
                Beta
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">
              Listen together. Stay in sync.
            </p>
          </div>
        </Link>

        {/* User Navigation */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-violet-950 border border-violet-800 flex items-center justify-center text-[10px] font-bold text-violet-300">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium text-zinc-200 max-w-[120px] truncate">
                  {user.displayName}
                </span>
                {user.isPremium ? (
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">
                    <Crown className="w-2.5 h-2.5 mr-0.5" /> Premium
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Free
                  </Badge>
                )}
              </div>

              <Link href="/settings">
                <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:text-white" title="Settings">
                  <SettingsIcon className="w-4 h-4" />
                </Button>
              </Link>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="h-9 w-9 text-zinc-400 hover:text-rose-400"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/api/auth/login">
                <Button variant="spotify" size="sm" className="text-xs">
                  Connect Spotify
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

