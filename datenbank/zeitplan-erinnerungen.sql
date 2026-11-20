-- S1 Tax: Zeitplan für den Erinnerungsdienst (alle 15 Minuten)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 's1tax-erinnerungen';
select cron.schedule('s1tax-erinnerungen', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://iseuubmjgvckvcvxvfyk.supabase.co/functions/v1/erinnerungen',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
