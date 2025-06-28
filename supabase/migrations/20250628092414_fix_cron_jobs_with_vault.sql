-- Fix cron jobs by using Supabase Vault for secrets

-- First, unschedule the problematic cron jobs
SELECT cron.unschedule('update-streaks-daily');
SELECT cron.unschedule('send-streak-reminders');

-- Store project configuration in vault
-- Note: You'll need to update these values with your actual project details
-- For local development, use: http://localhost:54321
-- For production, use: https://YOUR-PROJECT-REF.supabase.co
SELECT vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url', 'Supabase project URL');
SELECT vault.create_secret('YOUR-SERVICE-ROLE-KEY', 'service_role_key', 'Supabase service role key');

-- Recreate the cron jobs using vault secrets
-- Update streaks daily at 02:05 UTC
SELECT cron.schedule(
  'update-streaks-daily',
  '5 2 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/updateStreaksDaily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Send streak reminders at 18:00 UTC  
SELECT cron.schedule(
  'send-streak-reminders',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/sendStreakReminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('now_iso', now()::text)
  );
  $$
);

-- Also create a helper function to easily check if vault secrets are configured
CREATE OR REPLACE FUNCTION check_vault_secrets()
RETURNS TABLE (
  secret_name text,
  is_configured boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.name::text,
    (s.decrypted_secret != 'https://YOUR-PROJECT-REF.supabase.co' 
     AND s.decrypted_secret != 'YOUR-SERVICE-ROLE-KEY')::boolean
  FROM vault.decrypted_secrets s
  WHERE s.name IN ('project_url', 'service_role_key');
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_vault_secrets() TO authenticated;
