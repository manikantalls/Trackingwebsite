-- CW column accepts calendar week values in the format CW<number> or <number>,
-- including sub-week variants like 35/1, 35/2, 35/3, etc.
-- The column is text with no format constraint — values are stored as-is.
-- This comment documents the accepted formats:
--   CW30, 30, CW35/1, 35/1, CW35/2, 35/2, etc.

COMMENT ON COLUMN shipments.cw IS
  'Calendar week identifier. Accepts plain week numbers (e.g. 30, CW30) and sub-week variants (e.g. 35/1, CW35/2). Stored as text.';
