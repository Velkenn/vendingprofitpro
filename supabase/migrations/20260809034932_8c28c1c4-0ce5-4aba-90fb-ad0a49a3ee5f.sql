REVOKE EXECUTE ON FUNCTION public.encrypt_ai_key(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_ai_key(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_test_skus(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon;

GRANT EXECUTE ON FUNCTION public.encrypt_ai_key(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_ai_key(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_test_skus(uuid) TO service_role;

CREATE POLICY "Users can update own receipt files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);