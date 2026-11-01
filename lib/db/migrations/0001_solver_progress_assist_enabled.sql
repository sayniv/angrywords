ALTER TABLE solver_progress
ADD COLUMN IF NOT EXISTS assist_enabled boolean NOT NULL DEFAULT false;
