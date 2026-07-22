/*
  Create a SECURITY DEFINER function so the edge function (service role)
  can read Outlook credentials out of the Supabase vault without needing
  direct access to vault.decrypted_secrets.
*/
CREATE OR REPLACE FUNCTION get_outlook_credentials()
RETURNS TABLE (name text, secret text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault
AS $$
  SELECT name, decrypted_secret AS secret
  FROM vault.decrypted_secrets
  WHERE name IN ('OUTLOOK_CLIENT_ID', 'OUTLOOK_TENANT_ID', 'OUTLOOK_CLIENT_SECRET', 'CRON_SECRET');
$$;

-- Only the service_role (used by edge functions) can call this
REVOKE ALL ON FUNCTION get_outlook_credentials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_outlook_credentials() TO service_role;
