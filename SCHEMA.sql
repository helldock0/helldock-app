-- ============================================================
-- HELLDOCK · Supabase Postgres schema · MVP v1
-- ============================================================
-- Run this in Supabase SQL Editor after project creation.
-- Single user (James). No multi-tenant logic.
-- ============================================================

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,             -- 'scylla', 'hydra'
  name            TEXT NOT NULL,                    -- 'SOP Scylla'
  main_riot_name  TEXT,                             -- 'Igawr'
  main_riot_tag   TEXT,                             -- 'xuu许'
  region          TEXT DEFAULT 'ap',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PLAYERS (roster per team)
-- ============================================================
CREATE TABLE players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID REFERENCES teams(id) ON DELETE CASCADE,
  display_name    TEXT NOT NULL,                    -- 'Yaki' (helldock display)
  riot_name       TEXT,                             -- primary riot name (legacy; see player_accounts)
  riot_tag        TEXT,                             -- primary riot tag
  main_role       TEXT,                             -- 'Duelist', 'Controller', etc.
  main_agent      TEXT,                             -- 'Raze'
  roster_status   TEXT NOT NULL DEFAULT 'main'
                  CHECK (roster_status IN ('main', 'sub', 'trial')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, riot_name, riot_tag)
);

-- ============================================================
-- PLAYER_ACCOUNTS (one player -> many Riot accounts / alts)
-- ============================================================
CREATE TABLE player_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  riot_name   TEXT NOT NULL,
  riot_tag    TEXT NOT NULL,
  puuid       TEXT,                                 -- learned from match data
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  label       TEXT,                                 -- 'main', 'ranked alt', 'smurf', etc.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (riot_name, riot_tag),
  UNIQUE (puuid)
);

CREATE INDEX idx_player_accounts_riot   ON player_accounts(riot_name, riot_tag);
CREATE INDEX idx_player_accounts_puuid  ON player_accounts(puuid);
CREATE INDEX idx_player_accounts_player ON player_accounts(player_id);

-- ============================================================
-- MATCHES (one row per scrim/game)
-- ============================================================
CREATE TABLE matches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id_helldock   TEXT UNIQUE NOT NULL,         -- 'M001', 'M002'
  team_id             UUID REFERENCES teams(id),
  henrik_id           TEXT UNIQUE,                  -- henrikdev matchid (NULL for manual entries)
  is_manual_entry     BOOLEAN DEFAULT FALSE,
  match_date          DATE NOT NULL,
  match_type          TEXT,                         -- 'Scrim', 'Premier', 'Tournament', etc.
  session_num         INTEGER,
  opponent_name       TEXT,
  map_name            TEXT,
  pick                TEXT,                         -- 'Our Pick', 'Their Pick', 'Decider'
  start_side          TEXT,                         -- 'Attack' or 'Defense'
  our_score           INTEGER,
  opp_score           INTEGER,
  result              TEXT,                         -- 'W' or 'L'
  our_agents          TEXT[],                       -- ['Viper', 'Raze', ...]
  opp_agents          TEXT[],
  rounds_played       INTEGER,
  scrim_format        TEXT,                         -- 'First to 13', '24 rounds', 'Other'
  vibe_tag            TEXT,
  coach_grade         TEXT,
  vod_link            TEXT,
  notes               TEXT,
  imported_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_matches_date ON matches(match_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_matches_team ON matches(team_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_matches_opp ON matches(opponent_name) WHERE deleted_at IS NULL;

-- ============================================================
-- ROUNDS (one per round of each match)
-- ============================================================
CREATE TABLE rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID REFERENCES matches(id) ON DELETE CASCADE,
  round_num       INTEGER NOT NULL,
  half            TEXT,                             -- '1st', '2nd', 'OT'
  side            TEXT,                             -- 'Attack' or 'Defense'
  our_econ        INTEGER,
  their_econ      INTEGER,
  round_type      TEXT,                             -- 'Pistol', 'Eco', 'Anti-Eco', 'Bonus', 'Full Buy'
  site            TEXT,                             -- 'A', 'B', 'C', 'Mid', 'N/A'
  outcome         TEXT,                             -- 'W' or 'L'
  first_blood     TEXT,                             -- 'Us' or 'Them'
  fb_player       TEXT,                             -- roster display name or 'Opp Player'
  fb_weapon       TEXT,
  was_traded      BOOLEAN,
  planter         TEXT,
  defuser         TEXT,
  clutch_type     TEXT,                             -- '1v1', '1v2', etc.
  clutch_player   TEXT,
  mvp             TEXT,
  note            TEXT,
  setup           TEXT,
  fd_player       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (match_id, round_num)
);

CREATE INDEX idx_rounds_match ON rounds(match_id);

-- ============================================================
-- MATCH_PLAYERS (our team's per-match stats, 5 rows per match)
-- ============================================================
CREATE TABLE match_players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID REFERENCES matches(id) ON DELETE CASCADE,
  player_id       UUID REFERENCES players(id),
  riot_name       TEXT,                             -- captured at ingest, used for alt-account linking
  riot_tag        TEXT,
  puuid           TEXT,                             -- Riot's stable per-account ID
  agent           TEXT,
  role            TEXT,
  attendance      BOOLEAN DEFAULT TRUE,
  k               INTEGER,
  d               INTEGER,
  a               INTEGER,
  acs             NUMERIC(6, 1),
  econ            NUMERIC(7, 1),
  plants          INTEGER,
  defuses         INTEGER,
  fk              INTEGER,
  fd              INTEGER,
  two_k           INTEGER,
  three_k         INTEGER,
  four_k          INTEGER,
  aces            INTEGER,
  clutches        INTEGER,
  clutch_1v2plus  INTEGER,
  plus_minus      INTEGER,
  rating          NUMERIC(4, 2),
  aim_score       INTEGER,                          -- 1-10 manual
  decision_score  INTEGER,                          -- 1-10 manual
  comms_score     INTEGER,                          -- 1-10 manual
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_match_players_match  ON match_players(match_id);
CREATE INDEX idx_match_players_player ON match_players(player_id);
CREATE INDEX idx_match_players_riot   ON match_players(riot_name, riot_tag);

-- ============================================================
-- OPP_PLAYERS (opp team's per-match stats, 5 rows per match)
-- ============================================================
CREATE TABLE opp_players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID REFERENCES matches(id) ON DELETE CASCADE,
  opp_player_name TEXT,
  riot_id_full    TEXT,                             -- 'name#tag' if visible, 'Player1' if hidden
  agent           TEXT,
  acs             NUMERIC(6, 1),
  k               INTEGER,
  d               INTEGER,
  a               INTEGER,
  econ            NUMERIC(7, 1),
  fb              INTEGER,
  plants          INTEGER,
  defuses         INTEGER,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_opp_players_match ON opp_players(match_id);

-- ============================================================
-- SEED DATA — Scylla + Hydra
-- ============================================================
INSERT INTO teams (slug, name, main_riot_name, main_riot_tag, region) VALUES
  ('scylla', 'SOP Scylla', 'Igawr', 'xuu许', 'ap'),
  ('hydra',  'SOP Hydra (Academy)', 'Trippie', '0114', 'ap');

-- Scylla roster
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'Igawr', 'Igawr', 'xuu许', 'Controller', 'Viper' FROM teams WHERE slug = 'scylla';
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'MAK', 'MAK', '1103', 'Initiator', 'Fade' FROM teams WHERE slug = 'scylla';
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'Benjy', 'Scooby dooby doo', 'benjy', 'Sentinel', 'Chamber' FROM teams WHERE slug = 'scylla';
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'Yaki', 'Yaki', 'hers', 'Duelist', 'Raze' FROM teams WHERE slug = 'scylla';
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'EPIC', 'EPIC', 'bhop', 'Controller', 'Omen' FROM teams WHERE slug = 'scylla';
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'XKoR', 'XkOr', 'APAC', 'Controller', 'Harbor' FROM teams WHERE slug = 'scylla';

-- Hydra roster
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'Trippie', 'Trippie', '0114', 'Controller', 'Viper' FROM teams WHERE slug = 'hydra';
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'Gin', 'Gin', '0114', 'Controller', 'Viper' FROM teams WHERE slug = 'hydra';
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'default', 'default', 'aimy', 'Initiator', 'Fade' FROM teams WHERE slug = 'hydra';
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'Ark', 'Ark', 'VCSA', 'Controller', 'Omen' FROM teams WHERE slug = 'hydra';
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'dukeeww', 'dukeeww', 'kvck', 'Initiator', 'Skye' FROM teams WHERE slug = 'hydra';
INSERT INTO players (team_id, display_name, riot_name, riot_tag, main_role, main_agent)
SELECT id, 'S one', 'S one', 'VCT', 'Duelist', 'Raze' FROM teams WHERE slug = 'hydra';

-- ============================================================
-- ROW-LEVEL SECURITY (single user — only authenticated)
-- ============================================================
ALTER TABLE teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE players       ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds        ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE opp_players   ENABLE ROW LEVEL SECURITY;

-- Permissive policy for the single authenticated user
CREATE POLICY "all access for authenticated" ON teams         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON players       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON matches       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON rounds        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON match_players FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON opp_players   FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-update)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teams_updated_at   BEFORE UPDATE ON teams   FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER matches_updated_at BEFORE UPDATE ON matches FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- CAPTURE_TOKENS (S18 — bearer tokens for helldock-capture tray agent)
-- ============================================================
CREATE TABLE capture_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    TEXT UNIQUE NOT NULL,             -- sha256 hex of plaintext
  label         TEXT NOT NULL,                    -- 'James gaming PC'
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id       UUID NOT NULL REFERENCES teams(id)   ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX idx_capture_tokens_team_active
  ON capture_tokens(team_id) WHERE revoked_at IS NULL;

ALTER TABLE capture_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all access for authenticated" ON capture_tokens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- KILL_EVENTS (S15 — per-kill heatmap + impact source)
-- ============================================================
-- One row per kill in a match. Drives:
--   – kill-position heatmaps (MapHeatmap.tsx, discord-heatmap.ts)
--   – S16 impact metrics (trade rate, drag, carry in impact.ts)
--   – S17 KST%, opening duels, pre/post-plant split
--   – Gems tab first-blood weapon breakdown
-- Coordinates are in Valorant game-space; transform via gameCoordToRadar()
-- in src/lib/valorant-maps.ts for radar rendering.
CREATE TABLE kill_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_num       INTEGER NOT NULL,
  ts_in_round_ms  INTEGER,                            -- ms into the round
  killer_puuid    TEXT,
  victim_puuid    TEXT,
  killer_is_ours  BOOLEAN,                            -- true = our team killed
  weapon_id       TEXT,                               -- Henrik weapon UUID
  weapon_name     TEXT,                               -- denormalized for display
  headshot        BOOLEAN,
  killer_x        DOUBLE PRECISION,                   -- game-space coords
  killer_y        DOUBLE PRECISION,
  victim_x        DOUBLE PRECISION,
  victim_y        DOUBLE PRECISION,
  is_first_blood  BOOLEAN,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kill_events_match ON kill_events(match_id);
CREATE INDEX idx_kill_events_match_round ON kill_events(match_id, round_num);

ALTER TABLE kill_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all access for authenticated" ON kill_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- SCRIM_SCHEDULE (Calendar — future/scheduled scrims)
-- ============================================================
-- Calendar page reads from this for upcoming events. On completion,
-- the matching match row is linked via match_id and status flips to 'completed'.
CREATE TABLE scrim_schedule (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scheduled_at   TIMESTAMPTZ NOT NULL,
  opponent_name  TEXT,
  map_planned    TEXT,
  match_format   TEXT,                                -- 'First to 13', etc.
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  match_id       UUID REFERENCES matches(id),         -- set when completed
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scrim_schedule_team_date
  ON scrim_schedule(team_id, scheduled_at);

ALTER TABLE scrim_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all access for authenticated" ON scrim_schedule
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER scrim_schedule_updated_at BEFORE UPDATE ON scrim_schedule
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ============================================================
-- PLAYER_MMR_CACHE (Henrik MMR lookups for opponent intel)
-- ============================================================
-- Cached competitive rank for each opponent puuid we've encountered.
-- Written by /api/mmr/refresh (manual + batched). Read by Opponents tab
-- to display rank chips per enemy player.
CREATE TABLE player_mmr_cache (
  puuid                          TEXT PRIMARY KEY,
  riot_id                        TEXT NOT NULL,        -- 'name#tag'
  region                         TEXT NOT NULL,        -- 'ap', 'na', 'eu'
  current_tier_name              TEXT,
  current_rr                     INTEGER,
  current_elo                    INTEGER,
  current_leaderboard_placement  INTEGER,
  peak_tier_name                 TEXT,
  peak_season_id                 TEXT,
  fetched_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_player_mmr_cache_fetched ON player_mmr_cache(fetched_at);

ALTER TABLE player_mmr_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all access for authenticated" ON player_mmr_cache
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- COLUMN ADDITIONS to base tables (applied via migrations between S15–S19)
-- ============================================================
-- These ALTERs document drift between the original CREATE TABLE blocks above
-- and the current live schema. If you re-run this file against a fresh DB,
-- the columns will be created by the ALTER statements below.

-- teams: Discord webhook integration (Settings page)
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT;

-- rounds: S15+ Henrik V4 fields (plant/defuse timing, econ spend, ult casts, coach grading)
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS plant_time_in_round   NUMERIC,
  ADD COLUMN IF NOT EXISTS defuse_time_in_round  NUMERIC,
  ADD COLUMN IF NOT EXISTS our_econ_spent        INTEGER,
  ADD COLUMN IF NOT EXISTS their_econ_spent      INTEGER,
  ADD COLUMN IF NOT EXISTS our_ults_used         INTEGER,
  ADD COLUMN IF NOT EXISTS their_ults_used       INTEGER,
  ADD COLUMN IF NOT EXISTS coach_grade           INTEGER
    CHECK (coach_grade IS NULL OR (coach_grade >= 1 AND coach_grade <= 5)),
  ADD COLUMN IF NOT EXISTS coach_tags            TEXT[] DEFAULT ARRAY[]::TEXT[];

-- match_players: S16+ Henrik V4 fields (headshot/body/leg, damage, ADR, ability casts, AFK/FF, identity)
ALTER TABLE match_players
  ADD COLUMN IF NOT EXISTS hs                     INTEGER,
  ADD COLUMN IF NOT EXISTS bs                     INTEGER,
  ADD COLUMN IF NOT EXISTS ls                     INTEGER,
  ADD COLUMN IF NOT EXISTS damage_made            INTEGER,
  ADD COLUMN IF NOT EXISTS damage_received        INTEGER,
  ADD COLUMN IF NOT EXISTS adr                    NUMERIC,
  ADD COLUMN IF NOT EXISTS ability_c              INTEGER,
  ADD COLUMN IF NOT EXISTS ability_q              INTEGER,
  ADD COLUMN IF NOT EXISTS ability_e              INTEGER,
  ADD COLUMN IF NOT EXISTS ability_x              INTEGER,
  ADD COLUMN IF NOT EXISTS rounds_afk             INTEGER,
  ADD COLUMN IF NOT EXISTS friendly_fire_outgoing NUMERIC,
  ADD COLUMN IF NOT EXISTS friendly_fire_incoming NUMERIC;
-- Note: riot_name, riot_tag, puuid are already in the base CREATE TABLE above.

-- opp_players: S16+ Henrik V4 fields (headshot/body/leg, damage, ADR)
ALTER TABLE opp_players
  ADD COLUMN IF NOT EXISTS hs              INTEGER,
  ADD COLUMN IF NOT EXISTS bs              INTEGER,
  ADD COLUMN IF NOT EXISTS ls              INTEGER,
  ADD COLUMN IF NOT EXISTS damage_made     INTEGER,
  ADD COLUMN IF NOT EXISTS damage_received INTEGER,
  ADD COLUMN IF NOT EXISTS adr             NUMERIC;

-- ============================================================
-- INGEST_FAILURES (2026-05-20 — replaces silent fire-and-forget catches)
-- ============================================================
-- Written when a non-blocking step of ingestion fails (e.g., kill_events
-- insert, Discord webhook). Surfaced via /api/admin/failures and a Home
-- badge so failures stop disappearing into the void.
CREATE TABLE ingest_failures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          UUID REFERENCES matches(id) ON DELETE SET NULL,
  match_id_helldock TEXT,
  henrik_id         TEXT,
  source            TEXT NOT NULL,           -- 'kill_events' | 'discord' | 'cron' | ...
  error             TEXT NOT NULL,
  payload           JSONB,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX idx_ingest_failures_unresolved
  ON ingest_failures(occurred_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE ingest_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all access for authenticated" ON ingest_failures
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- PLAYER_ACCOUNTS RLS (applied 2026-05-20)
-- ============================================================
-- The base CREATE TABLE above (line ~43) did not enable RLS originally.
-- Applied to match the other tables' single-user permissive pattern:
ALTER TABLE player_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all access for authenticated" ON player_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
