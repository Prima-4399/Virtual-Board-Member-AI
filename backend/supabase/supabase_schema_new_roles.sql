-- 1. Update profiles role check
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('ceo', 'manager', 'developer', 'intern'));

-- 2. Update invitations role check
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check CHECK (role IN ('ceo', 'manager', 'developer', 'intern'));

-- 3. Map existing roles (idempotent)
UPDATE profiles SET role = 'ceo' WHERE role = 'owner';
UPDATE profiles SET role = 'manager' WHERE role = 'admin';
UPDATE profiles SET role = 'developer' WHERE role = 'member';
UPDATE profiles SET role = 'intern' WHERE role = 'viewer';

UPDATE invitations SET role = 'ceo' WHERE role = 'owner';
UPDATE invitations SET role = 'manager' WHERE role = 'admin';
UPDATE invitations SET role = 'developer' WHERE role = 'member';
UPDATE invitations SET role = 'intern' WHERE role = 'viewer';

-- Default to developer for new users instead of member
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'developer';
ALTER TABLE invitations ALTER COLUMN role SET DEFAULT 'developer';
