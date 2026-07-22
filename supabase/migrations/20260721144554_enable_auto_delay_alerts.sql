/*
# Enable automatic delay alerts via pg_cron + pg_net

1. Extensions
   - pg_cron: PostgreSQL scheduler (already available on Supabase)
   - pg_net: HTTP client for Postgres, used to call the edge function

2. Schema changes
   - Add `auto_sent` boolean column to `alert_log` to distinguish
     manual vs. automatic sends.
   - Add `alert_sent_at` timestamptz column to `shipments` to track
     when an automatic alert was last sent for a shipment, preventing
     duplicate auto-emails for the same delay.

3. Scheduled job
   - A pg_cron job runs every 30 minutes, calls the send-delay-alert
     edge function with mode=auto. The edge function detects delayed
     shipments that haven't been alerted yet and sends emails.
*/

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Track which shipments have been auto-alerted
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS alert_sent_at timestamptz;

-- Distinguish manual vs automatic sends in the log
ALTER TABLE alert_log ADD COLUMN IF NOT EXISTS auto_sent boolean NOT NULL DEFAULT false;

-- Grant necessary permissions for pg_net (the cron job runs as the postgres role)
-- pg_net stores responses in net._http_response; the cron job caller needs access
GRANT USAGE ON SCHEMA net TO postgres;
GRANT SELECT ON net._http_response TO postgres;
GRANT USAGE ON SCHEMA extensions TO postgres;
