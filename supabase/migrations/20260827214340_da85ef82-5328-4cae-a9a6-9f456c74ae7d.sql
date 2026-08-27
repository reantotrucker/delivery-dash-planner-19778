ALTER TABLE public.expedition_order_items
  ADD COLUMN IF NOT EXISTS checked2 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checked2_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked2_by uuid;