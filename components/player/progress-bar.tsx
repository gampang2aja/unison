"use client";

import React, { useState, useEffect } from "react";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  currentPositionMs: number;
  durationMs: number;
  isPlaying: boolean;
  isHost: boolean;
  onSeek?: (targetPositionMs: number) => void;
  className?: string;
}

export function ProgressBar({
  currentPositionMs,
  durationMs,
  isPlaying,
  isHost,
  onSeek,
  className,
}: ProgressBarProps) {
  const [prevPosition, setPrevPosition] = useState(currentPositionMs);
  const [displayPosition, setDisplayPosition] = useState(currentPositionMs);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);

  // Official React pattern: adjust state during render when a prop changes
  if (currentPositionMs !== prevPosition) {
    setPrevPosition(currentPositionMs);
    setDisplayPosition(currentPositionMs);
  }

  // Smooth periodic 1s ticker while playing
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setDisplayPosition((prev) => {
        if (durationMs > 0 && prev >= durationMs) return durationMs;
        return prev + 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, durationMs]);

  const activePosition = scrubPosition !== null ? scrubPosition : displayPosition;
  const percentage = durationMs > 0 ? Math.min(100, Math.max(0, (activePosition / durationMs) * 100)) : 0;

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScrubPosition(Number(e.target.value));
  };

  const handleSeekCommit = () => {
    if (scrubPosition !== null) {
      onSeek?.(scrubPosition);
      setDisplayPosition(scrubPosition);
      setScrubPosition(null);
    }
  };

  return (
    <div className={cn("w-full space-y-2", className)}>
      <div className="relative flex items-center group">
        {/* Track bar */}
        <div className="relative h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-violet-400 rounded-full transition-all duration-150 group-hover:bg-violet-300"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Input scrub slider (only interactive if host) */}
        {isHost && (
          <input
            type="range"
            min={0}
            max={Math.max(1, durationMs)}
            value={activePosition}
            onChange={handleSeekChange}
            onMouseUp={handleSeekCommit}
            onTouchEnd={handleSeekCommit}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Seek track position"
          />
        )}
      </div>

      <div className="flex justify-between text-xs font-mono text-zinc-400 select-none">
        <span>{formatTime(activePosition)}</span>
        <span>{formatTime(durationMs)}</span>
      </div>
    </div>
  );
}
