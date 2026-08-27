REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_email_change() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.clean_omie_cache() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_receipts() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_profile_email(uuid, text) FROM anon;