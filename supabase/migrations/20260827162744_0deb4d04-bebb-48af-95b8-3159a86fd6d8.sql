DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE command ILIKE '%cleanup_expired_receipts%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.cleanup_expired_receipts();

ALTER TABLE public.route_receipts ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE public.route_receipts ALTER COLUMN expires_at DROP DEFAULT;
UPDATE public.route_receipts SET expires_at = NULL WHERE expires_at IS NOT NULL;