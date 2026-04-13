-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. CREATE (PERSISTENT): Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    join_code VARCHAR(6) UNIQUE NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Profiles (The Boardroom Directory)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    board_role TEXT DEFAULT 'director' CHECK (board_role IN ('board_chair', 'director', 'company_secretary', 'legal_compliance', 'ceo_exec')),
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Meetings Table (Communal History)
CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    transcript TEXT,
    minutes TEXT,
    actions JSONB,
    recording_url TEXT,
    recall_bot_id TEXT UNIQUE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    attendees_summary JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4b. Meeting Attendees (Participant ↔ Profile Junction)
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

-- 5. Documents Table (Executive Vault)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename TEXT NOT NULL,
    file_type TEXT,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'indexed',
    file_path TEXT,
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE -- Linked transcripts
);

-- 6. Document Chunks Table (The Global Brain - RAG IQ)
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    metadata JSONB,
    embedding VECTOR(384),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE
);

-- 7. RECURSION FIX: Security Definer function to get org ID safely
CREATE OR REPLACE FUNCTION get_my_org_id() 
RETURNS UUID AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Grant execution permission
GRANT EXECUTE ON FUNCTION get_my_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_org_id() TO anon;

-- 8. AUTOMATION: Create a profile instantly when a new user registers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger Registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 9. SECURITY: Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;

-- 10. RLS POLICIES (Idempotent: Drop and Re-create)
-- Break recursion by using the SECURITY DEFINER function
DROP POLICY IF EXISTS "Profiles_Directory_Policy" ON profiles;
CREATE POLICY "Profiles_Directory_Policy" ON profiles FOR SELECT 
USING (auth.uid() = id OR (organization_id IS NOT NULL AND organization_id = get_my_org_id()));

DROP POLICY IF EXISTS "Profiles_Update_Policy" ON profiles;
CREATE POLICY "Profiles_Update_Policy" ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles_Insert_Policy" ON profiles;
CREATE POLICY "Profiles_Insert_Policy" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Organizations: Multi-tenant Discovery
DROP POLICY IF EXISTS "Organizations_Select_Policy" ON organizations;
CREATE POLICY "Organizations_Select_Policy" ON organizations FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow anon users to look up organizations by join code (needed during signup)
DROP POLICY IF EXISTS "Organizations_JoinCode_Lookup" ON organizations;
CREATE POLICY "Organizations_JoinCode_Lookup" ON organizations FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Organizations_Insert_Policy" ON organizations;
CREATE POLICY "Organizations_Insert_Policy" ON organizations FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Vaults: History, Memory, and RAG IQ
DROP POLICY IF EXISTS "Meetings_History_Policy" ON meetings;
CREATE POLICY "Meetings_History_Policy" ON meetings FOR ALL 
USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "Documents_Vault_Policy" ON documents;
CREATE POLICY "Documents_Vault_Policy" ON documents FOR ALL 
USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "Chunks_IQ_Policy" ON document_chunks;
CREATE POLICY "Chunks_IQ_Policy" ON document_chunks FOR ALL
USING (organization_id = get_my_org_id());

-- Meeting Attendees: scoped via meeting's organization
DROP POLICY IF EXISTS "Attendees_Org_Policy" ON meeting_attendees;
CREATE POLICY "Attendees_Org_Policy" ON meeting_attendees FOR ALL
USING (meeting_id IN (SELECT id FROM meetings WHERE organization_id = get_my_org_id()));

-- 11. VECTOR SEARCH FUNCTION (For the Chatbot)
CREATE OR REPLACE FUNCTION match_boardroom_knowledge (
  query_embedding VECTOR(384),
  match_threshold FLOAT,
  match_count INT,
  p_organization_id UUID
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.organization_id = p_organization_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- AUTHORIZE THE ADVISOR ENGINE
GRANT EXECUTE ON FUNCTION match_boardroom_knowledge(VECTOR(384), FLOAT, INT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION match_boardroom_knowledge(VECTOR(384), FLOAT, INT, UUID) TO anon;

-- 12. STORAGE VAULT AUTHORIZATION (For PDFs/Docs)
-- Create bucket if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('boardroom-vault', 'boardroom-vault', false) 
ON CONFLICT (id) DO NOTHING;

-- Allow board members to manage their own org files
DROP POLICY IF EXISTS "Board_Storage_Policy" ON storage.objects;
CREATE POLICY "Board_Storage_Policy" ON storage.objects FOR ALL
USING (
    bucket_id = 'boardroom-vault' 
    AND 
    (storage.foldername(name))[1] = get_my_org_id()::text
)
WITH CHECK (
    bucket_id = 'boardroom-vault' 
    AND 
    (storage.foldername(name))[1] = get_my_org_id()::text
);
