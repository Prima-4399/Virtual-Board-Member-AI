-- Add automation columns to meetings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS bot_join_status TEXT DEFAULT 'pending'; -- pending, joined, failed
