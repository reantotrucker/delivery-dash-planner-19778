
-- 1. Remove 'user' role from route_occurrences and route_occurrence_photos SELECT
DROP POLICY IF EXISTS "Users can view occurrences" ON public.route_occurrences;
CREATE POLICY "Authorized users can view occurrences"
ON public.route_occurrences
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'motorista'::app_role)
  OR has_role(auth.uid(), 'comercial'::app_role)
);

DROP POLICY IF EXISTS "Users can view occurrence photos" ON public.route_occurrence_photos;
CREATE POLICY "Authorized users can view occurrence photos"
ON public.route_occurrence_photos
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'motorista'::app_role)
  OR has_role(auth.uid(), 'comercial'::app_role)
);

-- 2. Restrict omie_cache writes to admin + comercial
DROP POLICY IF EXISTS "Authenticated users can insert cache" ON public.omie_cache;
DROP POLICY IF EXISTS "Authenticated users can update cache" ON public.omie_cache;

CREATE POLICY "Admins and comercial can insert cache"
ON public.omie_cache
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'comercial'::app_role)
);

CREATE POLICY "Admins and comercial can update cache"
ON public.omie_cache
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'comercial'::app_role)
);

-- 3. Revoke EXECUTE on internal SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.clean_omie_cache() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_receipts() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_email_change() FROM anon, authenticated, public;
-- Keep has_role callable since RLS policies reference it (RLS uses it regardless, but explicit grant is fine)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;
