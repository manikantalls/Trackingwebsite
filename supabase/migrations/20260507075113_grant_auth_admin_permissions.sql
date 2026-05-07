/*
  # Grant auth admin permissions

  Fixes "Database error querying schema" by ensuring the supabase_auth_admin
  role can execute the handle_new_user trigger function and access profiles.
*/

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON public.profiles TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
