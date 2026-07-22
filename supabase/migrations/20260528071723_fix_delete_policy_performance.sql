/*
  # Fix shipments DELETE policy performance

  ## Problem
  The existing "Admins can delete shipments" policy uses an EXISTS subquery
  that Postgres evaluates once per row being deleted. Bulk deletes (e.g. select
  all + delete) become extremely slow because the profiles lookup is repeated
  for every row.

  ## Fix
  Replace the correlated EXISTS subquery with a scalar subquery
  `(SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'`
  which Postgres can hoist and evaluate only once for the entire statement,
  making bulk deletes fast regardless of row count.

  Same pattern applied to INSERT and UPDATE policies for consistency.
*/

-- DROP and recreate the DELETE policy with a hoistable scalar subquery
DROP POLICY IF EXISTS "Admins can delete shipments" ON shipments;
CREATE POLICY "Admins can delete shipments"
  ON shipments
  FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Also fix UPDATE policy for the same reason
DROP POLICY IF EXISTS "Admins can update shipments" ON shipments;
CREATE POLICY "Admins can update shipments"
  ON shipments
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Also fix INSERT policy
DROP POLICY IF EXISTS "Admins can insert shipments" ON shipments;
CREATE POLICY "Admins can insert shipments"
  ON shipments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
