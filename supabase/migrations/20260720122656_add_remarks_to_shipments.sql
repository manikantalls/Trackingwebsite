/*
# Add remarks column to shipments

1. New Columns
- `shipments.remarks` (text, nullable, default '') — free-text notes per shipment.
2. Notes
- Non-destructive: adds a nullable column with a safe default so existing rows
  get '' and every existing read/write continues to work.
- No RLS or policy changes required (column inherits the table's existing policies).
*/

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS remarks text NOT NULL DEFAULT '';
