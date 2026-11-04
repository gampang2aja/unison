"use client";

import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Suspense } from "react";

function AuthErrorBannerContent() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("auth_error");

  if (!authError) return null;

  return (
    <div className="mb-6 max-w-lg mx-auto p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-xs text-rose-200 text-left">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
      <div>
        <div className="font-semibold text-rose-300">Gagal Login ke Spotify</div>
        <div>{decodeURIComponent(authError)}</div>
      </div>
    </div>
  );
}

export function AuthErrorBanner() {
  return (
    <Suspense fallback={null}>
      <AuthErrorBannerContent />
    </Suspense>
  );
}

