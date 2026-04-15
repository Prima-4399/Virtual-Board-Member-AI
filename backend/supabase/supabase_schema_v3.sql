-- 1. Add username to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- 2. Create a index for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
