-- Allow admins to update any profile (including role) with explicit WITH CHECK
DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
