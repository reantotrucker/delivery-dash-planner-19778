ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS client_trade_name text;