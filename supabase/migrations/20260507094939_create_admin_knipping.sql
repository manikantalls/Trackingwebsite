/*
  # Create admin user: admin@knipping.com

  Creates the auth user with bcrypt-hashed password and a matching admin profile.
  must_reset_password is set to false since this is a known admin account.
*/

DO $$
DECLARE
  new_uid uuid := gen_random_uuid();
BEGIN
  -- Insert into auth.users
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    new_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@knipping.com',
    crypt('Admin123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Admin","role":"admin"}',
    false, '', '', '', ''
  );

  -- Insert matching profile
  INSERT INTO public.profiles (id, email, full_name, role, must_reset_password, created_at)
  VALUES (new_uid, 'admin@knipping.com', 'Admin', 'admin', false, now())
  ON CONFLICT (id) DO NOTHING;
END $$;
