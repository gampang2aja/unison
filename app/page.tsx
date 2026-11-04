import Link from "next/link";
import { Users, Disc3, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AuthErrorBanner } from "@/components/layout/auth-error-banner";

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-violet-600/10 blur-[130px] rounded-full pointer-events-none" />

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 px-4 max-w-5xl mx-auto text-center">
        <AuthErrorBanner />

        <Badge variant="default" className="mb-6 px-3 py-1 text-xs bg-violet-500/10 text-violet-300 border-violet-500/30">
          <Sparkles className="w-3 h-3 mr-1 text-violet-400" /> Real-Time Spotify Synchronization
        </Badge>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white max-w-4xl mx-auto leading-[1.1]">
          Music is better <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-300 via-purple-300 to-indigo-300">together.</span>
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto font-light leading-relaxed">
          Listen together, wherever you are. Unison synchronizes playback across your friends’ individual Spotify accounts in real-time.
        </p>

        {/* Action Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/api/auth/login">
            <Button variant="spotify" size="lg" className="w-full sm:w-auto text-base gap-2 px-8">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.485 17.31c-.215.353-.674.464-1.027.249-2.813-1.718-6.353-2.107-10.523-1.155-.404.092-.81-.161-.902-.565-.092-.404.161-.81.565-.902 4.568-1.042 8.49-.604 11.638 1.346.353.215.464.674.249 1.027zm1.464-3.255c-.27.44-.848.58-1.288.31-3.22-1.978-8.128-2.55-11.936-1.393-.497.151-1.026-.134-1.177-.631-.151-.497.134-1.026.631-1.177 4.354-1.322 9.773-.687 13.46 1.58.44.27.58.848.31 1.288zm.126-3.39c-3.86-2.292-10.222-2.503-13.88-1.392-.593.18-1.222-.153-1.402-.746-.18-.593.153-1.222.746-1.402 4.215-1.28 11.237-1.034 15.688 1.609.533.316.708 1.008.392 1.541-.316.533-1.008.708-1.541.392z" />
              </svg>
              Connect with Spotify
            </Button>
          </Link>
        </div>

        {/* Live Sync Preview Mockup Card */}
        <div className="mt-16 max-w-3xl mx-auto rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8 backdrop-blur-xl shadow-2xl text-left relative">
          <div className="flex items-center justify-between pb-6 border-b border-zinc-800/80">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-semibold text-zinc-200">Room: ECHO-4092</span>
              <Badge variant="outline" className="text-[11px] text-zinc-400">Host Active</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-violet-300 font-mono">Realtime Sync ±28ms</span>
              <span className="w-2 h-2 rounded-full bg-violet-400" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Album artwork presentation */}
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-gradient-to-tr from-violet-950 via-zinc-900 to-zinc-800 border border-zinc-700/60 shadow-lg flex items-center justify-center">
              <Disc3 className="w-16 h-16 text-violet-400 animate-spin-slow" />
              <div className="absolute bottom-2 left-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[10px] text-zinc-300">
                Playing via Spotify Connect
              </div>
            </div>

            <div className="md:col-span-2 space-y-4">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Midnight City</h3>
                <p className="text-sm text-zinc-400">M83 • Hurry Up, We&apos;re Dreaming</p>
              </div>

              {/* Progress */}
              <div className="space-y-1.5">
                <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-violet-400 rounded-full w-2/3" />
                </div>
                <div className="flex justify-between text-xs font-mono text-zinc-400">
                  <span>2:42</span>
                  <span>4:03</span>
                </div>
              </div>

              {/* Connected listeners */}
              <div className="pt-2 flex items-center justify-between text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-violet-400" />
                  <span>4 listeners in sync</span>
                </div>
                <span className="text-emerald-400 font-medium">All devices aligned</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How Unison Works */}
      <section className="py-20 px-4 max-w-5xl mx-auto border-t border-zinc-850/80">
        <div className="text-center mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">How Unison Works</h2>
          <p className="mt-2 text-zinc-400 text-sm sm:text-base">
            No audio streaming. No proxying. Pure, decentralized synchronization.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="bg-zinc-900/40 border-zinc-800/80 hover:border-violet-500/30 transition-all">
            <CardContent className="pt-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300 font-bold">
                1
              </div>
              <h3 className="text-lg font-semibold text-white">Host starts a Room</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                One user creates a room and becomes the Host. Unison reads the Host&apos;s current playback state and active Spotify device.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/40 border-zinc-800/80 hover:border-violet-500/30 transition-all">
            <CardContent className="pt-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300 font-bold">
                2
              </div>
              <h3 className="text-lg font-semibold text-white">Friends Join Instantly</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Listeners enter using a shareable link or room code with their own individual Spotify accounts. No shared passwords or accounts.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/40 border-zinc-800/80 hover:border-violet-500/30 transition-all">
            <CardContent className="pt-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300 font-bold">
                3
              </div>
              <h3 className="text-lg font-semibold text-white">Automatic Micro-Sync</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                When the Host changes tracks, pauses, or seeks, the synchronization engine keeps all listeners aligned with sub-second accuracy.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Compliance & Policy Footer */}
      <footer className="py-12 border-t border-zinc-900 text-center text-xs text-zinc-500 space-y-3 max-w-4xl mx-auto px-4">
        <p>
          Unison is powered by the Spotify Web API. Content, metadata, and playback are provided directly by Spotify. Unison does not host, download, or stream copyrighted audio files.
        </p>
        <div className="flex items-center justify-center gap-4 text-zinc-400">
          <span>Listen together</span>
          <span>•</span>
          <span>Spotify Web API compliant</span>
          <span>•</span>
          <span>PKCE OAuth 2.0</span>
        </div>
      </footer>
    </div>
  );
}
