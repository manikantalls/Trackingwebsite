/*
  # Remove eta_knipping column, add lls_invoice column

  ## Changes
  - `shipments` table:
    - Remove `eta_knipping` column (no longer needed)
    - Add `lls_invoice` column (text, new LLS Invoice Number field)

  ## Notes
  - eta_knipping data will be lost on this migration; the column is intentionally dropped per user request.
  - lls_invoice defaults to empty string to match existing column conventions.
*/

ALTER TABLE shipments DROP COLUMN IF EXISTS eta_knipping;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shipments' AND column_name = 'lls_invoice'
  ) THEN
    ALTER TABLE shipments ADD COLUMN lls_invoice text NOT NULL DEFAULT '';
  END IF;
END $$;
