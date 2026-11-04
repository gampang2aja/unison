import React from "react";
import { RoomMember } from "@/types";
import { Crown, Laptop } from "lucide-react";
import { SyncStatusBadge } from "./sync-status-badge";

interface MemberListProps {
  members: RoomMember[];
  currentUserId?: string | null;
  className?: string;
}

export function MemberList({ members, currentUserId, className }: MemberListProps) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="flex items-center justify-between pb-1 border-b border-zinc-800/80">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Listening Together ({members.length})
        </span>
      </div>

      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
        {members.map((member) => {
          const isCurrentUser = member.user_id === currentUserId;
          const isHost = member.role === "host";
          const displayName = member.profile?.display_name || (isHost ? "Host" : "Listener");
          const avatarUrl = member.profile?.avatar_url;

          return (
            <div
              key={member.id || member.user_id}
              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                isCurrentUser
                  ? "bg-zinc-850/80 border-violet-500/30 shadow-sm"
                  : "bg-zinc-900/40 border-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-8 h-8 rounded-full object-cover ring-1 ring-zinc-700 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-violet-950/60 border border-violet-700/50 flex items-center justify-center text-xs font-semibold text-violet-300 shrink-0">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-200 truncate">
                      {displayName}
                    </span>
                    {isHost ? (
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded-md border border-amber-400/20">
                        <Crown className="w-2.5 h-2.5" /> Host
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500">
                        {isCurrentUser ? "(You)" : ""}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-[11px] text-zinc-400 truncate">
                    {member.device_name ? (
                      <>
                        <Laptop className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span className="truncate">{member.device_name}</span>
                      </>
                    ) : (
                      <span className="text-zinc-500 italic">No device connected</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0 pl-2">
                {isHost ? (
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block ring-4 ring-amber-400/20" title="Host Online" />
                ) : (
                  <SyncStatusBadge status={member.sync_status} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
