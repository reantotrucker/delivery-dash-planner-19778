
-- 1. Add location_link to routes
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS location_link text;

-- 2. Allow Commercial to update routes (will only edit location_link from UI)
CREATE POLICY "Comercial can update route location"
ON public.routes
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'comercial'::app_role))
WITH CHECK (has_role(auth.uid(), 'comercial'::app_role));

-- 3. route_receipts table
CREATE TABLE IF NOT EXISTS public.route_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_route_receipts_route ON public.route_receipts(route_id);
CREATE INDEX IF NOT EXISTS idx_route_receipts_expires ON public.route_receipts(expires_at);

ALTER TABLE public.route_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and motorista can insert receipts"
ON public.route_receipts FOR INSERT TO public
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'motorista'::app_role));

CREATE POLICY "Admin and motorista can delete receipts"
ON public.route_receipts FOR DELETE TO public
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'motorista'::app_role));

CREATE POLICY "Authorized users can view receipts"
ON public.route_receipts FOR SELECT TO public
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'motorista'::app_role)
  OR has_role(auth.uid(), 'comercial'::app_role)
);

-- 4. Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('route-receipts', 'route-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authorized users can read receipt files"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'route-receipts' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'motorista'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
  )
);

CREATE POLICY "Admin and motorista can upload receipt files"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  bucket_id = 'route-receipts' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'motorista'::app_role)
  )
);

CREATE POLICY "Admin and motorista can delete receipt files"
ON storage.objects FOR DELETE TO public
USING (
  bucket_id = 'route-receipts' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'motorista'::app_role)
  )
);

-- 5. Cleanup function for expired receipts
CREATE OR REPLACE FUNCTION public.cleanup_expired_receipts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, file_path FROM public.route_receipts WHERE expires_at < now() LOOP
    DELETE FROM storage.objects WHERE bucket_id = 'route-receipts' AND name = r.file_path;
    DELETE FROM public.route_receipts WHERE id = r.id;
  END LOOP;
END;
$$;
