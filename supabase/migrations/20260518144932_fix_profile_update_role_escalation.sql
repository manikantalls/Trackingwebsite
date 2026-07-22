/*
  # Fix Role Escalation Vulnerability in Profiles Policy

  ## Problem
  The "Users can update own must_reset_password" policy uses only `auth.uid() = id`
  as its WITH CHECK condition, allowing any user to update ANY column on their own
  profile row — including the `role` column — effectively promoting themselves to admin.

  ## Fix
  Replace the policy with a stricter version that locks down role and full_name columns
  so a user can only change must_reset_password (its intended purpose).

  ## Also adds
  - Non-negative CHECK constraints on shipments.kilo and shipments.custom_clearance
    to prevent invalid business data.
*/

-- Drop the vulnerable policy
DROP POLICY IF EXISTS "Users can update own must_reset_password" ON profiles;

-- Recreate it with column-level protection:
-- User can only update their own row AND must not change role or full_name
CREATE POLICY "Users can update own must_reset_password"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles p WHERE p.id = auth.uid())
    AND full_name = (SELECT full_name FROM profiles p WHERE p.id = auth.uid())
  );

-- Add constraint: weight cannot be negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'check_kilo_non_negative'
  ) THEN
    ALTER TABLE shipments ADD CONSTRAINT check_kilo_non_negative CHECK (kilo >= 0);
  END IF;
END $$;

-- Add constraint: custom clearance days cannot be negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'check_custom_clearance_non_negative'
  ) THEN
    ALTER TABLE shipments ADD CONSTRAINT check_custom_clearance_non_negative CHECK (custom_clearance >= 0);
  END IF;
END $$;
