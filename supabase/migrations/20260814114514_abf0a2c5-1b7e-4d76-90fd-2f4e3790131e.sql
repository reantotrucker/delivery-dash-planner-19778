ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS default_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;