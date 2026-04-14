-- Add Google Calendar integration columns to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
ADD COLUMN IF NOT EXISTS google_connected BOOLEAN DEFAULT false;

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS initial_attendees JSONB DEFAULT '[]';
