-- ============================================================
-- HELLDOCK · PRO SCOUTING · Supabase schema additions
-- ============================================================
-- VCT-level competitive data (separate from scrim tables).
-- Source: VLR.gg scrape. Naming: `pro_*` prefix throughout.
-- ============================================================

-- ============================================================
-- PRO_EVENTS — tournaments / leagues / stages
-- ============================================================
CREATE TABLE pro_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vlr_event_id    INTEGER UNIQUE NOT NULL,
  name            TEXT NOT NULL,                      -- 'VCT 2026: China Stage 1'
  region          TEXT,                               -- 'CN', 'Pacific', 'EMEA', 'AMER'
  tier            TEXT,                               -- 'VCT', 'Evolution', 'EWC-Qual', 'Other'
  prize_pool      TEXT,
  start_date      DATE,
  end_date        DATE,
  url             TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pro_events_region ON pro_events(region);
CREATE INDEX idx_pro_events_dates  ON pro_events(start_date DESC);

-- ============================================================
-- PRO_TEAMS — VCT-level orgs
-- ============================================================
CREATE TABLE pro_teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vlr_team_id     INTEGER UNIQUE NOT NULL,
  name            TEXT NOT NULL,                      -- 'All Gamers'
  tag             TEXT,                               -- 'AG'
  slug            TEXT,                               -- 'all-gamers'
  region          TEXT NOT NULL DEFAULT 'CN',
  country         TEXT,
  url             TEXT,
  logo_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pro_teams_region ON pro_teams(region);
CREATE INDEX idx_pro_teams_slug   ON pro_teams(slug);

-- ============================================================
-- PRO_PLAYERS — VCT-level player records
-- ============================================================
-- current_team_id is "primary" / latest known team.
-- For historical "who played for which team in this match" use
-- pro_player_map_stats.team_id (snapshot at-the-time).
CREATE TABLE pro_players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vlr_player_id   INTEGER UNIQUE,
  ign             TEXT NOT NULL,                      -- 'whzy'
  real_name       TEXT,                               -- 'Wang Haozhe'
  country         TEXT,
  current_team_id UUID REFERENCES pro_teams(id),
  url             TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pro_players_team ON pro_players(current_team_id);
CREATE INDEX idx_pro_players_ign  ON pro_players(ign);

-- ============================================================
-- PRO_MATCHES — one row per series (Bo1 / Bo3 / Bo5)
-- ============================================================
CREATE TABLE pro_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vlr_match_id    INTEGER UNIQUE NOT NULL,
  event_id        UUID REFERENCES pro_events(id),
  event_stage     TEXT,                               -- 'Playoffs - UBQF', 'Group - W3'
  team_a_id       UUID NOT NULL REFERENCES pro_teams(id),
  team_b_id       UUID NOT NULL REFERENCES pro_teams(id),
  team_a_score    INTEGER,                            -- maps won (series score)
  team_b_score    INTEGER,
  winner_team_id  UUID REFERENCES pro_teams(id),
  format          TEXT,                               -- 'Bo1', 'Bo3', 'Bo5'
  match_date      DATE,
  match_datetime  TIMESTAMPTZ,
  url             TEXT,
  patch           TEXT,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (team_a_id <> team_b_id)
);

CREATE INDEX idx_pro_matches_event   ON pro_matches(event_id);
CREATE INDEX idx_pro_matches_team_a  ON pro_matches(team_a_id);
CREATE INDEX idx_pro_matches_team_b  ON pro_matches(team_b_id);
CREATE INDEX idx_pro_matches_date    ON pro_matches(match_date DESC);

-- ============================================================
-- PRO_MAP_RESULTS — one row per map within a series
-- ============================================================
CREATE TABLE pro_map_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID NOT NULL REFERENCES pro_matches(id) ON DELETE CASCADE,
  map_order           INTEGER NOT NULL,               -- 1, 2, 3 in series
  map_name            TEXT NOT NULL,                  -- 'Bind', 'Haven', etc.
  pick_team_id        UUID REFERENCES pro_teams(id),  -- which team picked this map
  team_a_score        INTEGER,                        -- final rounds won
  team_b_score        INTEGER,
  team_a_atk_score    INTEGER,                        -- rounds won on attack
  team_a_def_score    INTEGER,                        -- rounds won on defense
  team_b_atk_score    INTEGER,
  team_b_def_score    INTEGER,
  team_a_start_side   TEXT CHECK (team_a_start_side IN ('Attack', 'Defense')),
  winner_team_id      UUID REFERENCES pro_teams(id),
  duration_minutes    INTEGER,
  UNIQUE (match_id, map_order)
);

CREATE INDEX idx_pmr_match ON pro_map_results(match_id);
CREATE INDEX idx_pmr_map   ON pro_map_results(map_name);

-- ============================================================
-- PRO_PLAYER_MAP_STATS — 10 rows per map (5 per team)
-- ============================================================
CREATE TABLE pro_player_map_stats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_result_id   UUID NOT NULL REFERENCES pro_map_results(id) ON DELETE CASCADE,
  player_id       UUID REFERENCES pro_players(id),
  team_id         UUID NOT NULL REFERENCES pro_teams(id),
  ign             TEXT NOT NULL,                      -- snapshot in case player_id null
  agent           TEXT,
  rating          NUMERIC(4,2),                       -- VLR proprietary rating
  acs             INTEGER,
  k               INTEGER,
  d               INTEGER,
  a               INTEGER,
  plus_minus      INTEGER,
  kast            NUMERIC(5,2),                       -- 0-100
  adr             NUMERIC(6,1),
  hs_pct          NUMERIC(5,2),
  fk              INTEGER,
  fd              INTEGER,
  fk_fd_diff      INTEGER,
  -- Side splits when VLR exposes them
  acs_atk         INTEGER,
  acs_def         INTEGER,
  k_atk           INTEGER,
  k_def           INTEGER,
  d_atk           INTEGER,
  d_def           INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ppms_map    ON pro_player_map_stats(map_result_id);
CREATE INDEX idx_ppms_player ON pro_player_map_stats(player_id);
CREATE INDEX idx_ppms_team   ON pro_player_map_stats(team_id);
CREATE INDEX idx_ppms_agent  ON pro_player_map_stats(agent);

-- ============================================================
-- PRO_ROUNDS — round-result strip from VLR
-- ============================================================
-- NOTE on depth: VLR gives only round winner + end-type icon.
-- We CANNOT get plant_time, killer/victim, positions, or
-- per-player per-round data. plant_happened is DERIVED:
--   defuse   → plant happened, defense won
--   detonate → plant happened, attack won
--   elim     → no plant info (often no plant)
--   time     → no plant, defense won (timer expired)
CREATE TABLE pro_rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_result_id   UUID NOT NULL REFERENCES pro_map_results(id) ON DELETE CASCADE,
  round_num       INTEGER NOT NULL,
  half            TEXT CHECK (half IN ('1st', '2nd', 'OT')),
  winner_team_id  UUID REFERENCES pro_teams(id),
  end_type        TEXT CHECK (end_type IN ('elim', 'defuse', 'detonate', 'time')),
  plant_happened  BOOLEAN,
  team_a_side     TEXT CHECK (team_a_side IN ('Attack', 'Defense')),
  team_b_side     TEXT CHECK (team_b_side IN ('Attack', 'Defense')),
  UNIQUE (map_result_id, round_num)
);

CREATE INDEX idx_pro_rounds_map ON pro_rounds(map_result_id);

-- ============================================================
-- PRO_SCOUT_NARRATIVES — cached AI-generated coach memos
-- ============================================================
CREATE TABLE pro_scout_narratives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES pro_teams(id) ON DELETE CASCADE,
  scope_label     TEXT NOT NULL,                      -- 'last-10', 'vct-cn-stage-1', 'all'
  content_md      TEXT NOT NULL,
  model           TEXT,                               -- 'claude-opus-4-7'
  prompt_version  TEXT NOT NULL DEFAULT 'v1',
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, scope_label, prompt_version)
);

CREATE INDEX idx_psn_team ON pro_scout_narratives(team_id);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
-- Pattern: authenticated users have full access (same as scrim tables).
-- ALSO: anon can READ pro_* tables — pro data is public-source anyway,
-- and we want TEC's evaluator to view the deployed report without login.

ALTER TABLE pro_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_teams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_players           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_matches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_map_results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_player_map_stats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_rounds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_scout_narratives  ENABLE ROW LEVEL SECURITY;

-- Authenticated: full access
CREATE POLICY "all access for authenticated" ON pro_events            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON pro_teams             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON pro_players           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON pro_matches           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON pro_map_results       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON pro_player_map_stats  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON pro_rounds            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all access for authenticated" ON pro_scout_narratives  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon: read-only
CREATE POLICY "anon read pro_events"           ON pro_events            FOR SELECT TO anon USING (true);
CREATE POLICY "anon read pro_teams"            ON pro_teams             FOR SELECT TO anon USING (true);
CREATE POLICY "anon read pro_players"          ON pro_players           FOR SELECT TO anon USING (true);
CREATE POLICY "anon read pro_matches"          ON pro_matches           FOR SELECT TO anon USING (true);
CREATE POLICY "anon read pro_map_results"      ON pro_map_results       FOR SELECT TO anon USING (true);
CREATE POLICY "anon read pro_player_map_stats" ON pro_player_map_stats  FOR SELECT TO anon USING (true);
CREATE POLICY "anon read pro_rounds"           ON pro_rounds            FOR SELECT TO anon USING (true);
CREATE POLICY "anon read pro_scout_narratives" ON pro_scout_narratives  FOR SELECT TO anon USING (true);

-- ============================================================
-- UPDATED_AT TRIGGERS (reuses set_updated_at() from SCHEMA.sql)
-- ============================================================
CREATE TRIGGER pro_teams_updated_at   BEFORE UPDATE ON pro_teams   FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER pro_players_updated_at BEFORE UPDATE ON pro_players FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER pro_matches_updated_at BEFORE UPDATE ON pro_matches FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
