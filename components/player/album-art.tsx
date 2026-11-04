"use client";

import React from "react";
import { Disc3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlbumArtProps {
  url: string | null;
  trackName: string | null;
  isPlaying: boolean;
  className?: string;
}

export function AlbumArt({ url, trackName, isPlaying, className }: AlbumArtProps) {
  return (
    <div
      className={cn(
        "relative aspect-square w-full max-w-[320px] mx-auto rounded-2xl overflow-hidden bg-gradient-to-b from-zinc-800 to-zinc-900 border border-zinc-700/50 shadow-2xl transition-all duration-500",
        isPlaying ? "shadow-violet-950/40 ring-1 ring-violet-500/30" : "opacity-85",
        className
      )}
    >
      {url ? (
        <img
          src={url}
          alt={trackName || "Album Artwork"}
          className="w-full h-full object-cover transition-transform duration-700 ease-out hover:scale-105"
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-3">
          <Disc3 className={cn("w-20 h-20 text-zinc-600", isPlaying && "animate-spin-slow")} />
          <p className="text-xs tracking-wider uppercase font-medium">No track selected</p>
        </div>
      )}

      {/* Subtle overlay gloss */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-white/5 pointer-events-none" />
    </div>
  );
}

