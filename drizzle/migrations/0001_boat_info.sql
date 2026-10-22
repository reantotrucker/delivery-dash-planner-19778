ALTER TABLE public.expedition_orders ADD COLUMN IF NOT EXISTS boat_info text;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS boat_info text;