-- Invitations Table
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(email, organization_id)
);

-- Enable RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Invitations_Select_Policy" ON invitations;
CREATE POLICY "Invitations_Select_Policy" ON invitations FOR SELECT 
USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "Invitations_Insert_Policy" ON invitations;
CREATE POLICY "Invitations_Insert_Policy" ON invitations FOR INSERT 
WITH CHECK (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "Invitations_Delete_Policy" ON invitations;
CREATE POLICY "Invitations_Delete_Policy" ON invitations FOR DELETE 
USING (organization_id = get_my_org_id());
