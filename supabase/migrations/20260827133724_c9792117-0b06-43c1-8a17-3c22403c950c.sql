ALTER TABLE public.payment_methods DROP CONSTRAINT IF EXISTS payment_methods_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_company_name_key ON public.payment_methods (company_id, lower(name));

ALTER TABLE public.consultants DROP CONSTRAINT IF EXISTS consultants_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS consultants_company_name_key ON public.consultants (company_id, lower(name));

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_plate_key;
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_company_plate_key ON public.vehicles (company_id, upper(plate));