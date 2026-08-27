select cron.unschedule('expedition-auto-sync') where exists (select 1 from cron.job where jobname = 'expedition-auto-sync');

select cron.schedule(
  'expedition-auto-sync',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://yuxvypdqujobkjkudqet.supabase.co/functions/v1/expedition-auto-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1eHZ5cGRxdWpvYmtqa3VkcWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNjYxOTgsImV4cCI6MjA3Nzk0MjE5OH0.5uXjvZ3203wjdK1VXwh8OczAxRr__h61VOmV8S-pTDY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) as request_id;
  $$
);