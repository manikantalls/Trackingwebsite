/*
  # Add custom_clearance to shipments

  1. Changes
    - Adds `custom_clearance` (integer) column to `shipments` table
      - Stores the number of days for customs clearance lead time
      - Defaults to 10 days
      - Used to compute DDP Lead Time = ETA + custom_clearance days

  2. Notes
    - DDP Lead Time is computed in the frontend (ETA + custom_clearance)
    - custom_clearance is admin-only visible/editable in the UI
    - All existing rows get the default value of 10
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shipments' AND column_name = 'custom_clearance'
  ) THEN
    ALTER TABLE shipments ADD COLUMN custom_clearance integer NOT NULL DEFAULT 10;
  END IF;
END $$;
