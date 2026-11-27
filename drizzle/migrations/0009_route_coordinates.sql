ALTER TABLE public.routes
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN geocode_attempted_at timestamp with time zone;