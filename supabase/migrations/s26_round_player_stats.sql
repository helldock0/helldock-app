-- ============================================================
-- HELLDOCK · Session 26 · round_player_stats
-- ============================================================
-- Per-round-per-player breakdown. One row per (match, round_num, puuid).
-- Henrik V4 round.stats[] provides per-round economy + score + k/d/a + damage.
-- Per-round ability_casts are NULL in V4 (known bug); ability_x_cast is
-- populated as a lower-bound proxy via ult-kill count attribution.
-- Foundation for util/econ efficiency, role impact, post-scrim reports.
-- ============================================================

CREATE TABLE round_player_stats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_num       INTEGER NOT NULL,
  player_id       UUID REFERENCES players(id),         -- nullable: opp players have no FK
  puuid           TEXT NOT NULL,                       -- always populated (ours + opp)
  is_ours         BOOLEAN NOT NULL,
  k               INTEGER NOT NULL DEFAULT 0,
  d               INTEGER NOT NULL DEFAULT 0,
  a               INTEGER NOT NULL DEFAULT 0,
  score           INTEGER NOT NULL DEFAULT 0,          -- combat score this round
  damage_made     INTEGER,                             -- nullable: V4 may omit on older matches
  damage_received INTEGER,
  ability_c_cast  INTEGER,                             -- NULL: V4 per-round ability_casts is null
  ability_q_cast  INTEGER,                             -- NULL: same
  ability_e_cast  INTEGER,                             -- NULL: same
  ability_x_cast  INTEGER,                             -- ult kills as lower-bound proxy
  econ_spent      INTEGER NOT NULL DEFAULT 0,          -- loadout_value
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, round_num, puuid)
);

CREATE INDEX idx_round_player_stats_match_round ON round_player_stats(match_id, round_num);
CREATE INDEX idx_round_player_stats_puuid_match ON round_player_stats(puuid, match_id);
CREATE INDEX idx_round_player_stats_is_ours_match ON round_player_stats(is_ours, match_id);
CREATE INDEX idx_round_player_stats_player ON round_player_stats(player_id) WHERE player_id IS NOT NULL;

ALTER TABLE round_player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all access for authenticated"
  ON round_player_stats FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
