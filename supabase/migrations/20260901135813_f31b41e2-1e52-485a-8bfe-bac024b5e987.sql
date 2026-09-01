ALTER TABLE public.route_signatures
  ALTER COLUMN route_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS expedition_order_id uuid REFERENCES public.expedition_orders(id) ON DELETE CASCADE;

ALTER TABLE public.route_signatures
  ADD CONSTRAINT route_signatures_target_chk
  CHECK (route_id IS NOT NULL OR expedition_order_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS route_signatures_expedition_order_id_idx
  ON public.route_signatures(expedition_order_id);