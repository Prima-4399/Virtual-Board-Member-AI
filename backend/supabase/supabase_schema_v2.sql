-- 1. Organizations Table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    join_code VARCHAR(6) UNIQUE NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Update Profiles to include Organization & Role
ALTER TABLE profiles 
ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
ADD COLUMN role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

-- 3. Update Documents table for Isolation
ALTER TABLE documents 
ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 4. Update Memory Chunks for Isolation
ALTER TABLE memory_chunks 
ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 5. Create a function to generate a unique 6-digit code
CREATE OR REPLACE FUNCTION generate_join_code() RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code TEXT := '';
    i INTEGER := 0;
BEGIN
    FOR i IN 1..6 LOOP
        code := code || substr(chars, floor(random() * length(chars))::integer + 1, 1);
    END LOOP;
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- 6. Enable RLS (Row Level Security) for isolation
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_chunks ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
-- Users can only see documents from their own organization
CREATE POLICY "Users can only see documents from their own org" 
ON documents FOR ALL 
USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can only see chunks from their own org" 
ON memory_chunks FOR ALL 
USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
