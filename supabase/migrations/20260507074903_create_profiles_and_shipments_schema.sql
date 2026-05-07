/*
  # Profiles and Shipments Schema

  1. New Tables
    - `profiles` - user profiles linked to auth.users (id, email, role, full_name)
    - `shipments` - shipment tracking records with all logistics fields

  2. Trigger
    - handle_new_user: auto-creates profile row on auth sign-up

  3. Security
    - RLS enabled on both tables
    - Authenticated users can read all data
    - Only admins can insert/update/delete
*/

-- ── Profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL DEFAULT '',
  role        text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  full_name   text NOT NULL DEFAULT '',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read profiles" ON profiles;
CREATE POLICY "Authenticated users can read profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Trigger to auto-create profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Seed existing users
INSERT INTO profiles (id, email, role, full_name)
VALUES
  ('393bf69d-701e-4034-9016-ae3f32e823d6', 'user@eftec.com', 'user', 'EFTEC User'),
  ('f1c53e4e-5cae-4fce-a9ab-6e07a7df2b72', 'admin@eftec.com', 'admin', 'EFTEC Admin')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;

-- ── Shipments ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipments (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cw            text NOT NULL DEFAULT '',
  lls_reference text NOT NULL DEFAULT '',
  supplier      text NOT NULL DEFAULT '',
  invoice       text NOT NULL DEFAULT '',
  delivery_note text NOT NULL DEFAULT '',
  po            text NOT NULL DEFAULT '',
  part_number   text NOT NULL DEFAULT '',
  quantity      text NOT NULL DEFAULT '',
  package       text NOT NULL DEFAULT '',
  kilo          numeric NOT NULL DEFAULT 0,
  pick_up       text NOT NULL DEFAULT '',
  booking       text NOT NULL DEFAULT '',
  vessel        text NOT NULL DEFAULT '',
  container     text NOT NULL DEFAULT '',
  ets           timestamptz,
  eta           timestamptz,
  eta_knipping  text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'AT_DEPARTURE_PORT',
  status_note   text NOT NULL DEFAULT '',
  last_updated  timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read shipments" ON shipments;
CREATE POLICY "Authenticated users can read shipments"
  ON shipments FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can insert shipments" ON shipments;
CREATE POLICY "Admins can insert shipments"
  ON shipments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update shipments" ON shipments;
CREATE POLICY "Admins can update shipments"
  ON shipments FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete shipments" ON shipments;
CREATE POLICY "Admins can delete shipments"
  ON shipments FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
