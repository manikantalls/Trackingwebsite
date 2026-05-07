/*
  # Add full_name column to profiles

  The profiles table was created without the full_name column.
  This migration adds it with a default empty string.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN full_name text NOT NULL DEFAULT '';
  END IF;
END $$;
