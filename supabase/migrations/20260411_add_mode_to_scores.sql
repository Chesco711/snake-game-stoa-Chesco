-- Add mode column to scores table to support per-mode leaderboards
-- Mode values: 'solo' | 'multiplayer' | 'party'
ALTER TABLE scores ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'solo';

-- Update leaderboard view to filter by mode
-- If your leaderboard is a view, recreate it with mode support:
-- (Skip this block if leaderboard is a table, not a view)
/*
CREATE OR REPLACE VIEW leaderboard AS
  SELECT username, mode, MAX(score) AS best_score
  FROM scores
  GROUP BY username, mode
  ORDER BY best_score DESC;
*/

-- If leaderboard is a table, add the mode column there too:
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'solo';
