ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS is_boat boolean NOT NULL DEFAULT false;
INSERT INTO public.expedition_infos (company_id, name)
SELECT c.id, 'BARCO' FROM public.companies c
WHERE c.has_expedition AND NOT EXISTS (SELECT 1 FROM public.expedition_infos e WHERE e.company_id = c.id AND upper(e.name) = 'BARCO');