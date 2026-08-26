REVOKE EXECUTE ON FUNCTION public.has_company_access(uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

  IF NEW.email = 'renato@stock360.com.br' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;

  INSERT INTO public.user_companies (user_id, company_id)
  SELECT NEW.id, c.id FROM public.companies c WHERE c.slug = 'stock360'
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;