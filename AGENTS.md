<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Unison — AI Agent & Developer Guidelines

This document provides complete instructions, architecture invariants, security rules, and development practices for AI coding agents and human contributors working on the **Unison** codebase.

---

## 1. Product Context & Principles

**Product Name:** Unison  
**Tagline:** *Listen together. Stay in sync.*  
**Category:** Real-Time Collaborative Music Listening Platform  

### Core Operating Principles:
1. **Not an Audio Streaming Service:** Unison **never** streams, proxies, caches, downloads, or redistributes audio files. All audio playback occurs natively on each user's authenticated Spotify Connect device.
2. **Decentralized Multi-User Sync:** One user acts as **Host**, others join as **Listeners**. Listeners mirror the Host's playback state as closely as technically feasible via their own independent Spotify accounts.
3. **Spotify Premium Requirement:** Spotify Web API requires an active Spotify Premium subscription for programmatic playback controls (`PUT /me/player/play`, `PUT /me/player/pause`, `PUT /me/player/seek`). Agents must ensure free accounts are gracefully handled with informative feedback without application crashes.
4. **Active Playback Device Requirement:** Spotify Connect endpoints cannot awaken dormant devices remotely. An active Spotify player (desktop client, mobile app, or Web Player) must be running.

---

## 2. Technology Stack & Directory Conventions

- **Framework:** Next.js 16 (App Router, Turbopack, React 19)
- **Language:** TypeScript with strict mode enabled (`"strict": true` in `tsconfig.json`)
- **Styling:** Tailwind CSS (Dark-first aesthetic: dark charcoal background `#111217`, card surfaces `#181920`, lavender accents `#A78BFA` / `#8B5CF6`)
- **Database:** Supabase PostgreSQL with Row Level Security (RLS) & Supabase Realtime (Broadcast and Presence)
- **Music API:** Spotify Web API (adhering strictly to `open-api-schema.yaml`)
- **Testing:** Vitest (`npm run test`)

### Directory Layout:
```text
├── app/
│   ├── (auth routes)/       # /api/auth/login, /api/auth/callback, /api/auth/demo-login, /api/auth/me, /api/auth/logout
│   ├── (room routes)/       # /api/rooms, /api/rooms/[id], /api/rooms/[id]/join, /api/rooms/[id]/leave, /api/rooms/[id]/playback
│   ├── (spotify proxy)/     # /api/spotify/devices, /api/spotify/transfer, /api/spotify/control, /api/spotify/sync
│   ├── dashboard/page.tsx   # User profile, room creation, joining by code, recent rooms
│   ├── room/[id]/page.tsx   # Live Listening Room (Player, Artwork, Host controls, Member list, Sync status)
│   ├── settings/page.tsx    # Spotify account info, tuning preferences, session revocation
│   ├── globals.css          # Theme design tokens & custom scrollbars
│   ├── layout.tsx           # Root layout with Geist fonts & Header
│   └── page.tsx             # Public landing page with live preview & ToS compliance
├── components/
│   ├── layout/              # Header, navigation, user chips
│   ├── player/              # AlbumArt, ProgressBar (React 19 pure), DeviceSelector
│   ├── room/                # MemberList, SyncStatusBadge
│   └── ui/                  # Button, Card, Badge, Input (shadcn/ui aesthetic)
├── lib/
│   ├── auth/                # AES-256-GCM token encryption, PKCE helper, HMAC session cookies
│   ├── spotify/             # Spotify Web API typed client, error classes, token refresh manager
│   ├── store/               # In-memory room store fallback (zero-setup dev & test)
│   ├── supabase/            # Client (Realtime) & Server (admin service role) helpers
│   ├── sync/                # Modular synchronization subsystem (clock, position, drift, commandQueue, hostMonitor, listenerSync, reconnect)
│   └── utils.ts             # cn, formatTime, generateRoomCode
├── supabase/
│   └── migrations/          # SQL migrations with RLS policies and publication triggers
├── tests/                   # Vitest unit & integration test suites
├── open-api-schema.yaml     # Official Spotify Web API OpenAPI 3.0.3 specification
└── README.md                # Project documentation & deployment manual
```

---

## 3. Spotify Web API Strict Rules

When modifying or adding Spotify endpoints:

1. **OpenAPI Specification Compliance:**
   - Refer to `open-api-schema.yaml` for all paths, query parameters, request bodies, and response schemas.
   - Never guess endpoint URLs or field names.
2. **Authorization & PKCE:**
   - Use the **Authorization Code with PKCE** flow (`code_verifier` + `code_challenge` using SHA-256 `S256`).
   - If a client secret is configured on the backend, use HTTP Basic auth on `https://accounts.spotify.com/api/token`.
   - Never use the deprecated Implicit Grant flow.
3. **Redirect URIs:**
   - Always use HTTPS redirect URIs (or `http://127.0.0.1:3000/api/auth/callback` for local development).
   - **Never** use `http://localhost` or wildcard URIs (Spotify strictly forbids them).
4. **Scope Least-Privilege:**
   - Request only the 5 essential scopes:
     - `user-read-playback-state`
     - `user-modify-playback-state`
     - `user-read-currently-playing`
     - `user-read-email`
     - `user-read-private`
5. **Rate Limiting & Retries:**
   - When receiving HTTP `429 Too Many Requests`, read the `Retry-After` header and apply exponential backoff.
   - Never retry in tight polling loops.
6. **Avoid Deprecated Endpoints:**
   - Prefer modern endpoints (e.g., `/playlists/{id}/items` over `/playlists/{id}/tracks`, `/me/library` over type-specific endpoints).
7. **Error Handling:**
   - Use typed errors (`SpotifyPremiumRequiredError`, `SpotifyNoActiveDeviceError`, `SpotifyApiError`).
   - Inspect `error.message` and `error.reason` to deliver clear user guidance.

---

## 4. Automatic Synchronization Engine Invariants

The synchronization engine in `lib/sync/` must maintain these invariants:

1. **Clock Offset Estimation (`ClockSync`):**
   - Must account for clock skew using roundtrip NTP-style sampling with a median filter:
     $$\text{offset} = \frac{(t_1 - t_0) + (t_2 - t_3)}{2}$$
2. **Position Calculation (`calculateTargetPosition`):**
   - Formula:
     $$\text{targetPosition} = \text{eventPosition} + \text{elapsedTimeSinceEvent}$$
     where $\text{elapsedTimeSinceEvent} = (\text{clock.now}() - \text{serverTimestamp}) \times (\text{isPlaying} ? 1 : 0)$.
   - Position must be bounded between `0` and `durationMs`.
3. **Drift Evaluation (`evaluateDrift`):**
   - **Drift Tolerance (`300 ms`):** If drift $\le 300\text{ ms}$, return action `NONE` (healthy sync).
   - **Correction Threshold (`1500 ms`):** If $300\text{ ms} < \text{drift} \le 1500\text{ ms}$, return action `NONE` to suppress micro-seeks and prevent audio stuttering.
   - If $\text{drift} > 1500\text{ ms}$, return action `SEEK` to `targetPositionMs`.
   - If `trackUri` mismatches, return action `CHANGE_TRACK`.
   - If play/pause state mismatches, return action `PLAY` or `PAUSE`.
4. **Command Queue & Monotonic Ordering (`PlaybackCommandQueue`):**
   - Any event with `sequenceNumber <= lastProcessedSequence` **must be rejected** to prevent old events from overwriting fresh state.
   - Reject duplicate commands (same action and position within 250 ms).
   - Enforce minimum interval (`minCommandIntervalMs: 500 ms`) between consecutive Spotify API calls to prevent 429 lockouts.
   - Concurrency mutex lock ensures only one playback command executes at a time.
5. **Reconnection & Host Offline Detection:**
   - If the Host disconnects from the Realtime channel, notify Listeners and pause synchronization commands instead of looping stale playback.

---

## 5. Security & Token Storage Invariants

1. **Zero Client-Side Token Exposure:**
   - Never send Spotify access tokens, refresh tokens, client secrets, or Supabase service-role keys to the browser.
2. **AES-256-GCM Encryption:**
   - Tokens stored in the database (`spotify_accounts`) must be encrypted using AES-256-GCM with a 12-byte IV and 16-byte authentication tag via `lib/auth/encryption.ts`.
3. **Row Level Security (RLS):**
   - `spotify_accounts` has **no public/authenticated policies**. It is exclusively queried and updated server-side using the Supabase `service_role` key.
4. **Session Cookie Security:**
   - Session cookies (`unison_session`) are signed with HMAC-SHA256, set to `httpOnly: true`, `sameSite: "lax"`, and `secure: true` in production.
5. **CSRF State Verification:**
   - OAuth login sets a cryptographically secure random `state` in an HTTP-only cookie (`unison_oauth_state`) and verifies strict constant-time equality on callback.

---

## 6. Testing & Quality Verification

Before declaring any change complete, run the following verification pipeline:

```bash
# 1. Run unit and integration tests
npm run test

# 2. Verify strict TypeScript compilation
npx tsc --noEmit

# 3. Run ESLint
npm run lint

# 4. Verify production build
npm run build
```

All 4 steps must exit with code 0 without errors.

---

## 7. Absolute Working Tree Rules

1. **NO GIT COMMIT OR PUSH:** Do not execute `git commit` or `git push` unless the user explicitly instructs you to do so.
2. **NO GIT CHECKOUT OR RESTORE:** Do not run `git checkout` or `git restore` in the terminal. If file changes need to be reverted or corrected, edit the file directly using tools.
3. **MAINTAIN NEXT.JS HEADER:** Keep the top comment block `<!-- BEGIN:nextjs-agent-rules --> ... <!-- END:nextjs-agent-rules -->` intact in this file.
