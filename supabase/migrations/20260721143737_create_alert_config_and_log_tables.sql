/*
# Create alert_config and alert_log tables

1. New Tables
   - `alert_config` — single-row configuration table for delay email alerts.
     Stores recipient lists (To/CC), email subject/body templates with
     {remarks}/{booking}/{vessel}/{cw}/{ets}/{eta}/{transit_days} placeholders,
     the from-address, and the transit-day threshold (default 42).
   - `alert_log` — audit trail of every alert email sent (shipment id,
     recipient, subject, status, error message, sent_at).

2. Security
   - RLS enabled on both tables.
   - Only admins can SELECT/INSERT/UPDATE/DELETE (matches existing shipments pattern).
   - The send-delay-alert edge function uses the service-role key, which
     bypasses RLS, so it can read config and write logs without anon access.
*/

CREATE TABLE IF NOT EXISTS alert_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address    text NOT NULL DEFAULT '',
  to_recipients   text[] NOT NULL DEFAULT '{}',
  cc_recipients   text[] NOT NULL DEFAULT '{}',
  subject_template text NOT NULL DEFAULT 'Shipment Delay Alert - {booking} - {vessel}',
  body_template   text NOT NULL DEFAULT 'Dear Team,\n\nThe shipment for CW{cw} (Booking: {booking}, Vessel: {vessel}) is delayed.\n\nReason: {remarks}\nTransit time: {transit_days} days (ETS: {ets}, ETA: {eta})\n\nPlease take necessary action.\n\nRegards,\nLLS Mexico Team',
  transit_threshold integer NOT NULL DEFAULT 42,
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE alert_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read alert_config" ON alert_config;
CREATE POLICY "Admins can read alert_config"
  ON alert_config FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert alert_config" ON alert_config;
CREATE POLICY "Admins can insert alert_config"
  ON alert_config FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can update alert_config" ON alert_config;
CREATE POLICY "Admins can update alert_config"
  ON alert_config FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete alert_config" ON alert_config;
CREATE POLICY "Admins can delete alert_config"
  ON alert_config FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));


CREATE TABLE IF NOT EXISTS alert_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id text,
  recipient   text NOT NULL DEFAULT '',
  subject     text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'sent',
  error       text DEFAULT '',
  sent_at     timestamptz DEFAULT now()
);

ALTER TABLE alert_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read alert_log" ON alert_log;
CREATE POLICY "Admins can read alert_log"
  ON alert_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert alert_log" ON alert_log;
CREATE POLICY "Admins can insert alert_log"
  ON alert_log FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete alert_log" ON alert_log;
CREATE POLICY "Admins can delete alert_log"
  ON alert_log FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Seed a default config row so the page has something to show
INSERT INTO alert_config (from_address, to_recipients, cc_recipients)
VALUES ('', '{}', '{}')
ON CONFLICT DO NOTHING;
