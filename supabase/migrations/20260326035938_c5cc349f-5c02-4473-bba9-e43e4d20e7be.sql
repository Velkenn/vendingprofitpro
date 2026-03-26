CREATE OR REPLACE FUNCTION public.encrypt_ai_key(plain_text text, enc_key text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.pgp_sym_encrypt(plain_text, enc_key), 'base64');
$$;

CREATE OR REPLACE FUNCTION public.decrypt_ai_key(encrypted_text text, enc_key text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_decrypt(decode(encrypted_text, 'base64'), enc_key);
$$;