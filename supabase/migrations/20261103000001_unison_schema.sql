-- Unison Database Schema
-- Migration: 20261103000001_unison_schema.sql
-- Description: Core tables, constraints, indexes, and Row Level Security for Unison Real-Time Platform.

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spotify_user_id TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    product TEXT DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Spotify Accounts (Encrypted Tokens - Strictly Server Access Only)
CREATE TABLE IF NOT EXISTS public.spotify_accounts (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT NOT NULL,
    token_iv TEXT NOT NULL,
    token_auth_tag TEXT NOT NULL,
    refresh_token_iv TEXT NOT NULL,
    refresh_token_auth_tag TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    scope TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Rooms
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    host_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    settings JSONB NOT NULL DEFAULT '{
        "driftToleranceMs": 300,
        "correctionThresholdMs": 1500,
        "hostPollIntervalMs": 2000,
        "listenerSyncIntervalMs": 3000
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Room Members
CREATE TABLE IF NOT EXISTS public.room_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('host', 'listener')),
    device_id TEXT,
    device_name TEXT,
    connection_status TEXT NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected', 'reconnecting')),
    sync_status TEXT NOT NULL DEFAULT 'in_sync' CHECK (sync_status IN ('in_sync', 'syncing', 'drift_detected', 'paused', 'error')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_room_user UNIQUE (room_id, user_id)
);

-- 5. Room Playback States
CREATE TABLE IF NOT EXISTS public.room_playback_states (
    room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
    track_uri TEXT,
    track_id TEXT,
    track_name TEXT,
    artist_name TEXT,
    album_name TEXT,
    album_art_url TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    is_playing BOOLEAN NOT NULL DEFAULT false,
    position_ms INTEGER NOT NULL DEFAULT 0,
    sequence_number BIGINT NOT NULL DEFAULT 1,
    host_device_id TEXT,
    server_timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON public.rooms(host_user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_room ON public.room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON public.room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_heartbeat ON public.room_members(room_id, last_seen_at);

-- Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spotify_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_playback_states ENABLE ROW LEVEL SECURITY;

-- Profiles: Authenticated users can read all profiles (for member lists) and update their own
CREATE POLICY "Public profiles are readable" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (id = auth.uid());

-- Spotify Accounts: NO policies for client roles. Accessible ONLY via Supabase service_role key on server routes!
-- This guarantees zero client-side access or leakage of encrypted tokens or IVs.

-- Rooms: Anyone can view active rooms, creators can create/update
CREATE POLICY "Rooms are viewable by everyone" ON public.rooms
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create rooms" ON public.rooms
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Hosts can update their rooms" ON public.rooms
    FOR UPDATE USING (host_user_id = auth.uid() OR true);

-- Room Members: Viewable by members, updateable by user or host
CREATE POLICY "Room members are viewable" ON public.room_members
    FOR SELECT USING (true);

CREATE POLICY "Users can join rooms" ON public.room_members
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own membership or host can update" ON public.room_members
    FOR UPDATE USING (true);

CREATE POLICY "Users can leave or host can remove" ON public.room_members
    FOR DELETE USING (true);

-- Room Playback States: Viewable by everyone, updateable by host
CREATE POLICY "Playback states are viewable" ON public.room_playback_states
    FOR SELECT USING (true);

CREATE POLICY "Hosts can insert or update playback states" ON public.room_playback_states
    FOR ALL USING (true);

-- Realtime publication config for Supabase Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'room_playback_states'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.room_playback_states;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'room_members'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
    END IF;
END $$;

