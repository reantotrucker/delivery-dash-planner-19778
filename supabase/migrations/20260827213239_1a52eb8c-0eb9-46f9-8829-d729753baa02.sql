ALTER TABLE public.expedition_order_items ADD COLUMN IF NOT EXISTS family text;
ALTER TABLE public.route_products ADD COLUMN IF NOT EXISTS family text;