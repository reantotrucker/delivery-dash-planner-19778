
-- 1) Restrict routes SELECT (remove 'user' role)
DROP POLICY IF EXISTS "Users can view routes" ON public.routes;
CREATE POLICY "Authorized users can view routes" ON public.routes
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'motorista'::app_role) OR
  has_role(auth.uid(), 'comercial'::app_role)
);

-- 2) Restrict route_products SELECT
DROP POLICY IF EXISTS "Users can view route products" ON public.route_products;
CREATE POLICY "Authorized users can view route products" ON public.route_products
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'motorista'::app_role) OR
  has_role(auth.uid(), 'comercial'::app_role)
);

-- 3) Prevent email modification on profiles via trigger
CREATE OR REPLACE FUNCTION public.prevent_profile_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_email_change_trg ON public.profiles;
CREATE TRIGGER prevent_profile_email_change_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_email_change();

-- 4) Deny direct profile inserts (trigger handle_new_user runs as SECURITY DEFINER and bypasses RLS)
DROP POLICY IF EXISTS "Deny direct profile inserts" ON public.profiles;
CREATE POLICY "Deny direct profile inserts" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (false);

-- 5) Lock down storage bucket 'route-occurrences'
UPDATE storage.buckets SET public = false WHERE id = 'route-occurrences';

DROP POLICY IF EXISTS "Authenticated users can view photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload photos" ON storage.objects;

CREATE POLICY "Authorized users can view occurrence photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'route-occurrences' AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'motorista'::app_role) OR
    has_role(auth.uid(), 'comercial'::app_role)
  )
);

CREATE POLICY "Authorized users can upload occurrence photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'route-occurrences' AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'motorista'::app_role) OR
    has_role(auth.uid(), 'comercial'::app_role)
  )
);

CREATE POLICY "Authorized users can delete occurrence photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'route-occurrences' AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'motorista'::app_role) OR
    has_role(auth.uid(), 'comercial'::app_role)
  )
);
