-- Migration: Board Member Persona Identification & Participant Tracking
-- Run this in Supabase SQL Editor against your existing database

-- 1. Add board_role and display_name to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS board_role TEXT DEFAULT 'director'
  CHECK (board_role IN ('board_chair', 'director', 'company_secretary', 'legal_compliance', 'ceo_exec'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- 2. Add attendees_summary to meetings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendees_summary JSONB;

-- 3. Create meeting_attendees junction table
CREATE TABLE IF NOT EXISTS meeting_attendees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    participant_name TEXT NOT NULL,
    board_role TEXT,
    matched BOOLEAN DEFAULT false,
    speaking_segments INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(meeting_id, participant_name)
);

-- 4. Enable RLS on meeting_attendees
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attendees_Org_Policy" ON meeting_attendees;
CREATE POLICY "Attendees_Org_Policy" ON meeting_attendees FOR ALL
USING (meeting_id IN (SELECT id FROM meetings WHERE organization_id = get_my_org_id()));

-- 5. Set org owner's board_role to board_chair
UPDATE profiles
SET board_role = 'board_chair'
WHERE role = 'owner' AND board_role = 'director';
