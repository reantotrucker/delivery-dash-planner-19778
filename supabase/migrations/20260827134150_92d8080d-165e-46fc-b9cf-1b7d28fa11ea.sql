ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS drivers_company_name_key ON public.drivers (company_id, lower(name));