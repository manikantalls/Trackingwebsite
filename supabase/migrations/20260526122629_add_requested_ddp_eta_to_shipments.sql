/*
  # Add requested_ddp_eta column to shipments

  ## Summary
  Adds a new column `requested_ddp_eta` to the shipments table to store the
  "Requested DDP ETA KN-MX" date, which comes directly from the Excel import
  rather than being computed from ETA + lead time days.

  ## Changes
  - `shipments.requested_ddp_eta` (date, nullable) — stores the date imported from
    the "Requested DDP ETA KN-MX" column in Excel spreadsheets.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shipments' AND column_name = 'requested_ddp_eta'
  ) THEN
    ALTER TABLE shipments ADD COLUMN requested_ddp_eta date;
  END IF;
END $$;
