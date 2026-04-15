-- Join Requests Table
CREATE TABLE IF NOT EXISTS join_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, organization_id)
);

-- Enable RLS
ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Join_Requests_Select_Policy" ON join_requests;
CREATE POLICY "Join_Requests_Select_Policy" ON join_requests FOR SELECT 
USING (
    user_id = auth.uid() OR 
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.organization_id = join_requests.organization_id 
        AND profiles.role IN ('ceo', 'manager')
    )
);

DROP POLICY IF EXISTS "Join_Requests_Insert_Policy" ON join_requests;
CREATE POLICY "Join_Requests_Insert_Policy" ON join_requests FOR INSERT 
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Join_Requests_Update_Policy" ON join_requests;
CREATE POLICY "Join_Requests_Update_Policy" ON join_requests FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.organization_id = join_requests.organization_id 
        AND profiles.role IN ('ceo', 'manager')
    )
);
