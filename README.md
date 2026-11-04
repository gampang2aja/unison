# Unison — Real-Time Collaborative Music Listening Platform

> **Listen together. Stay in sync.**

Unison is a real-time collaborative music listening platform that enables multiple users to listen to music simultaneously using their own individual Spotify accounts and playback devices.

Each user plays audio independently through their authenticated Spotify Connect device. One user acts as the **Host**, and other users join as **Listeners**. When the Host plays, pauses, seeks, or skips tracks, all Listeners automatically follow the Host as closely as technically possible.

---

## 1. Core Architecture & Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript (Strict mode enabled)
- **Styling & UI:** Tailwind CSS, custom dark-first design system with lavender / soft purple accents, Lucide icons
- **Database & Realtime:** Supabase PostgreSQL with Row Level Security (RLS) & Supabase Realtime (Broadcast and Presence)
- **Audio & Playback API:** Spotify Web API (OpenAPI 3.0.3 compliant)
- **Authentication:** Spotify OAuth 2.0 Authorization Code Flow with PKCE (`S256` SHA-256 challenge)
- **Security:** AES-256-GCM encrypted token storage with per-record initialization vectors and authentication tags
- **Testing:** Vitest unit and integration test suite

---

## 2. Automatic Synchronization Engine

The synchronization engine is decoupled from UI components into a dedicated modular subsystem (`lib/sync/`):

### A. Clock Offset Estimation (`lib/sync/clock.ts`)
Calculates clock skew between client device time and server/Spotify timestamp using round-trip NTP-style sampling and a median filter to eliminate network jitter:
$$\text{offset} = \frac{(t_1 - t_0) + (t_2 - t_3)}{2}$$

### B. Position Calculation (`lib/sync/position.ts`)
Estimates the exact position of the host's playback:
$$\text{targetPosition} = \text{eventPosition} + \text{elapsedTimeSinceEvent}$$
where $\text{elapsedTimeSinceEvent} = (\text{now}() + \text{clockOffset} - \text{serverTimestamp}) \times (\text{isPlaying} ? 1 : 0)$, bounded strictly by $[0, \text{durationMs}]$.

### C. Drift Detection & Correction (`lib/sync/drift.ts`)
Configurable synchronization thresholds:
- **Drift Tolerance:** `300 ms` — within this range, playback is considered in sync. Micro-seeking is suppressed to prevent audio stutter.
- **Correction Threshold:** `1500 ms` — minor drift between 300 ms and 1500 ms is tolerated; drift exceeding 1500 ms triggers an immediate corrective seek.
- **Track Transition:** Immediately triggers `CHANGE_TRACK` with target position.
- **Play/Pause Toggle:** Aligns playback state immediately.

### D. Ordered Command Queue (`lib/sync/commandQueue.ts`)
- **Monotonic Sequence Ordering:** Rejects any event with `sequenceNumber <= lastProcessedSequence`.
- **Deduplication:** Prevents redundant Spotify API calls if the action and target position match within 250 ms.
- **Rate Limit Cooldown:** Enforces a minimum 500 ms interval between consecutive Spotify Web API calls to comply with rate limits.
- **Execution Lock:** Concurrency mutex ensuring playback commands do not overlap or interleave.

### E. Reconnection & Offline Recovery (`lib/sync/reconnect.ts`)
- Subscribes to Supabase Realtime broadcast channel (`room:{roomId}`) and Presence tracking.
- Exponential backoff retry upon socket disconnection.
- Snapshot state re-fetch upon reconnecting.
- Host offline detection: Listeners are immediately notified if the Host disconnects, pausing playback commands rather than looping indefinitely.

---

## 3. Spotify API Compliance & Verified Policy Capabilities

Before and during implementation, Spotify Developer documentation and policies were strictly verified:

1. **Spotify Premium Requirement:**
   - As stated in the official Spotify Web API documentation: *"Controlling playback requires Spotify Premium"*.
   - Both Host and Listeners must have an active Spotify Premium subscription to allow programmatic playback control (`/me/player/play`, `/me/player/pause`, `/me/player/seek`).
   - Free accounts are identified via `product: "free"` and displayed with informative banners.
2. **Active Device Requirement:**
   - Spotify Connect endpoints require an active Spotify client (open desktop, mobile app, or Web Player). Unison provides a Device Selector (`components/player/device-selector.tsx`) to switch and activate devices.
3. **Redirect URIs:**
   - Follows Spotify's strict URI requirements: requires HTTPS (or `http://127.0.0.1:3000/api/auth/callback` for local development). Wildcard URIs and `localhost` are strictly rejected.
4. **Minimal OAuth Scopes:**
   - Only requests the 5 essential scopes: `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`, `user-read-email`, `user-read-private`.
5. **Rate Limits:**
   - Implements exponential backoff and parses the `Retry-After` header on HTTP 429 responses.
6. **No Audio Streaming or Redistribution:**
   - Unison **never** streams, proxies, downloads, caches, or redistributes Spotify audio. All audio is rendered natively on each user's authenticated Spotify Connect device.
7. **Spotify Development Mode Quota:**
   - New apps in Spotify Developer Dashboard can be used by up to 25 allowlisted user accounts before requesting quota extension.
   - For immediate local evaluation without Spotify credentials, Unison includes a built-in **Demo Mode** (`/api/auth/demo-login?role=host`).

---

## 4. Database Schema & Security

Migrations are located in `supabase/migrations/20261103000001_unison_schema.sql`.

### Tables:
- `profiles`: User information, display name, avatar, and Spotify product tier.
- `spotify_accounts`: **Strictly server-side access only**. Stores tokens encrypted via AES-256-GCM (`encrypted_access_token`, `encrypted_refresh_token`, `token_iv`, `token_auth_tag`). RLS blocks all client access; accessed solely by server routes via Supabase service-role keys.
- `rooms`: Unique `room_code`, `host_user_id`, room settings, and status.
- `room_members`: Room membership, roles (`host` / `listener`), device tracking, connection status, and sync status.
- `room_playback_states`: Room playback snapshot, sequence number, and server timestamps.

---

## 5. Local Setup & Quick Start

### Prerequisites
- Node.js 20+ (Node 24 recommended)
- npm 10+
- (Optional) Spotify Developer Application credentials from [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
- (Optional) Supabase project credentials

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Configure your environment variables:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/callback

TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### Step 3: Run Database Migrations (Supabase)
Execute `supabase/migrations/20261103000001_unison_schema.sql` in your Supabase SQL Editor.

### Step 4: Run Tests
```bash
npm run test
```

### Step 5: Start Development Server
```bash
npm run dev
```
Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

> **Tip:** You can click **Try Demo** on the landing page or header to explore room creation, host controls, device selection, and listener auto-sync instantly without configuring Spotify credentials!

---

## 6. Vercel Deployment

Unison is pre-configured for one-click deployment on Vercel:

1. Import this repository into Vercel.
2. Add the environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` (Set to `https://your-domain.vercel.app/api/auth/callback`)
   - `TOKEN_ENCRYPTION_KEY`
3. Add `https://your-domain.vercel.app/api/auth/callback` to **Redirect URIs** in your Spotify Developer Dashboard.
4. Deploy!
