/*
  # Remove auth trigger

  The handle_new_user trigger on auth.users causes "Database error querying schema"
  during login when GoTrue's auth role hits permission issues. We remove it and
  instead create profiles client-side after signup.
*/

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
