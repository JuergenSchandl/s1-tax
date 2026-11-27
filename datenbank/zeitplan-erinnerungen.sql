-- S1 Tax: Zeitplan für den Erinnerungsdienst (alle 15 Minuten)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Dienstschlüssel: Der Zeitplan weist sich damit bei der Funktion aus (Kopfzeile x-dienst).
-- Ohne ihn lehnt die Funktion den Lauf ab, damit niemand von außen einen Lauf anstoßen kann.
-- Der Schlüssel entsteht in der Datenbank und steht nirgends im Code. push_keys ist für die App gesperrt
-- (RLS ohne Regeln), nur der Server liest sie.
alter table public.push_keys add column if not exists cron_key text;
update public.push_keys set cron_key = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where cron_key is null;
alter table public.push_keys alter column cron_key set default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
alter table public.push_keys alter column cron_key set not null;

-- Wichtig: Funktion und Zeitplan gehören zusammen. Wer diesen Zeitplan ohne die Kopfzeile x-dienst neu anlegt,
-- schaltet die Erinnerungen ab (die Funktion antwortet dann mit 401).
select cron.unschedule(jobid) from cron.job where jobname = 's1tax-erinnerungen';
select cron.schedule('s1tax-erinnerungen', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://iseuubmjgvckvcvxvfyk.supabase.co/functions/v1/erinnerungen',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dienst', (select cron_key from public.push_keys where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
