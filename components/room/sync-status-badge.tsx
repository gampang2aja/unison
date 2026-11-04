import React from "react";
import { SyncStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface SyncStatusBadgeProps {
  status: SyncStatus;
  driftMs?: number;
  className?: string;
}

export function SyncStatusBadge({ status, driftMs, className }: SyncStatusBadgeProps) {
  switch (status) {
    case "in_sync":
      return (
        <Badge variant="success" className={className}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>In Sync {driftMs !== undefined ? `(±${Math.round(driftMs)}ms)` : ""}</span>
        </Badge>
      );

    case "syncing":
      return (
        <Badge variant="default" className={className}>
          <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
          <span>Aligning Playback...</span>
        </Badge>
      );

    case "drift_detected":
      return (
        <Badge variant="warning" className={className}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
          <span>Drift Correction {driftMs ? `(${Math.round(driftMs)}ms)` : ""}</span>
        </Badge>
      );

    case "paused":
      return (
        <Badge variant="secondary" className={className}>
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
          <span>Host Paused</span>
        </Badge>
      );

    case "reconnecting":
      return (
        <Badge variant="outline" className={className}>
          <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
          <span>Reconnecting...</span>
        </Badge>
      );

    case "error":
    default:
      return (
        <Badge variant="destructive" className={className}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
          <span>Sync Alert</span>
        </Badge>
      );
  }
}

