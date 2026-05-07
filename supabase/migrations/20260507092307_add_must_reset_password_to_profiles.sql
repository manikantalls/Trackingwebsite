/*
  # Add must_reset_password to profiles

  Adds a boolean column `must_reset_password` to the profiles table.
  When an admin creates a user with a temporary password this flag is set to true.
  After the user successfully resets their password the flag is cleared to false.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'must_reset_password'
  ) THEN
    ALTER TABLE profiles ADD COLUMN must_reset_password boolean NOT NULL DEFAULT false;
  END IF;
END $$;
