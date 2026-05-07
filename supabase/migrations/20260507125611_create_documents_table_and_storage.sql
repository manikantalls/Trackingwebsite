/*
  # Create Documents Table

  ## Summary
  Adds document management for containers and individual shipments.

  ## New Tables
  - `documents`
    - `id` (uuid, primary key)
    - `container` (text) - container number this document belongs to
    - `shipment_id` (text, FK to shipments.id) - optional link to a specific shipment
    - `filename` (text) - original file name shown to users
    - `storage_path` (text) - path in Supabase Storage bucket
    - `size_bytes` (bigint) - file size
    - `uploaded_by` (uuid, FK to auth.users)
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - All authenticated users can read documents
  - Only admins (role = 'admin' in profiles) can insert or delete
*/

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container text,
  shipment_id text REFERENCES shipments(id) ON DELETE SET NULL,
  filename text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view documents"
  ON documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete documents"
  ON documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS documents_container_idx ON documents(container);
CREATE INDEX IF NOT EXISTS documents_shipment_id_idx ON documents(shipment_id);
