import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(ms: number): string {
  if (!ms || isNaN(ms) || ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function generateRoomCode(): string {
  const syllables = ["ECHO", "BEAT", "TUNE", "SYNC", "WAVE", "FLOW", "HARP", "LUSH", "VIBE", "AURA"];
  const randomSyllable = syllables[Math.floor(Math.random() * syllables.length)];
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${randomSyllable}-${randomNum}`;
}

