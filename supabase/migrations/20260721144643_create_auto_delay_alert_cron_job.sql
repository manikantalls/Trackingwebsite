/*
# Create pg_cron job for automatic delay alerts

This job runs every 30 minutes and calls the send-delay-alert edge
function with mode=auto. The edge function:
  1. Reads the alert_config (recipients, templates, threshold)
  2. Finds shipments where transit time (ETA - ETS) > threshold
     AND alert_sent_at IS NULL (not yet alerted)
  3. Sends personalized emails via Microsoft Graph API
  4. Marks each shipment with alert_sent_at to prevent duplicate emails
  5. Logs every send in alert_log

The CRON_SECRET must be set as an edge function secret to match.
*/

-- Create a cron job that calls the edge function every 30 minutes
-- pg_cron runs in the GMT timezone by default

SELECT cron.schedule(
  'auto-delay-alert',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ahgmbsyyvgjowqfcueqa.supabase.co/functions/v1/send-delay-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key', true)
    ),
    body := jsonb_build_object(
      'mode', 'auto',
      'cron_secret', 'af4c79fbc5c55351ce927118d2ab60a3aeaffe846371879fc23313353f5fd5ef'
    )
  ) AS request_id;
  $$
);
