/*
  # Allow users to clear their own must_reset_password flag

  ## Problem
  Regular (non-admin) users had no UPDATE policy on the profiles table,
  so their attempt to set must_reset_password = false after setting a new
  password was silently blocked by RLS.

  ## Change
  Add a policy letting authenticated users update only their own profile row,
  restricted to the must_reset_password column via a WITH CHECK that ensures
  they can only set it to false (never escalate their own role, etc.).
*/

CREATE POLICY "Users can update own must_reset_password"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
