"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Laptop, Smartphone, Speaker, Check, RefreshCw } from "lucide-react";
import { SpotifyDevice } from "@/types";
import { Button } from "@/components/ui/button";

interface DeviceSelectorProps {
  selectedDeviceId: string | null;
  onDeviceSelect: (device: SpotifyDevice) => void;
  className?: string;
}

export function DeviceSelector({
  selectedDeviceId,
  onDeviceSelect,
  className,
}: DeviceSelectorProps) {
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/spotify/devices");
      if (res.ok) {
        const data = await res.json();
        const list: SpotifyDevice[] = data.devices || [];
        setDevices(list);

        if (!selectedDeviceId && list.length > 0) {
          const active = list.find((d) => d.is_active) || list[0];
          onDeviceSelect(active);
        }
      }
    } catch (err) {
      console.error("Failed to load devices:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId, onDeviceSelect]);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const res = await fetch("/api/spotify/devices");
        if (res.ok && !ignore) {
          const data = await res.json();
          const list: SpotifyDevice[] = data.devices || [];
          setDevices(list);

          if (!selectedDeviceId && list.length > 0) {
            const active = list.find((d) => d.is_active) || list[0];
            onDeviceSelect(active);
          }
        }
      } catch (err) {
        if (!ignore) console.error("Failed to load devices:", err);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, [selectedDeviceId, onDeviceSelect]);

  const activeDevice = devices.find((d) => d.id === selectedDeviceId);

  const getDeviceIcon = (type: string) => {
    const lower = type.toLowerCase();
    if (lower.includes("phone")) return <Smartphone className="w-4 h-4" />;
    if (lower.includes("speaker") || lower.includes("cast")) return <Speaker className="w-4 h-4" />;
    return <Laptop className="w-4 h-4" />;
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-xs border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800"
        >
          {activeDevice ? getDeviceIcon(activeDevice.type) : <Laptop className="w-4 h-4" />}
          <span className="truncate max-w-[140px]">
            {activeDevice ? activeDevice.name : "Select Device"}
          </span>
          {activeDevice?.is_active && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-950" />
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-white"
          onClick={() => fetchDevices()}
          title="Refresh Spotify devices"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-64 rounded-xl border border-zinc-800 bg-zinc-950/95 p-2 shadow-2xl backdrop-blur-xl z-50 space-y-1">
          <div className="px-2 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Spotify Playback Devices
          </div>

          {devices.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-zinc-500">
              No devices found. Open Spotify on your phone, laptop, or desktop and tap refresh.
            </div>
          ) : (
            devices.map((device) => {
              const isSelected = device.id === selectedDeviceId;
              return (
                <button
                  key={device.id}
                  onClick={() => {
                    onDeviceSelect(device);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-xs text-left transition-colors ${
                    isSelected
                      ? "bg-violet-950/40 text-violet-200 border border-violet-800/40"
                      : "text-zinc-300 hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {getDeviceIcon(device.type)}
                    <div className="truncate">
                      <div className="font-medium truncate">{device.name}</div>
                      <div className="text-[10px] text-zinc-500">
                        {device.type} {device.is_active ? "• Active" : ""}
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
