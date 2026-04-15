-- Create join_requests table
CREATE TABLE IF NOT EXISTS public.join_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, organization_id)
);

-- Note: In Supabase, if row level security is enabled, you might need policies. If you are using the service role key on the backend, it will bypass RLS.
-- But it's good practice to enable RLS:
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

-- Allow all read/write for now, or just let service role handle it
CREATE POLICY "Enable all for authenticated users" ON public.join_requests
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
