-- Allow admin email changes via SECURITY DEFINER RPC while preserving user-level protection.
CREATE OR REPLACE FUNCTION public.prevent_profile_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
     AND coalesce(current_setting('app.allow_email_change', true), '') <> 'true' THEN
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_profile_email(_user_id uuid, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.allow_email_change', 'true', true);
  UPDATE public.profiles SET email = _email WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_profile_email(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_email(uuid, text) TO service_role;