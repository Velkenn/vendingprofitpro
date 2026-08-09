REVOKE ALL ON FUNCTION public.encrypt_ai_key(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_ai_key(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_test_skus(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.encrypt_ai_key(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_ai_key(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_test_skus(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, service_role;