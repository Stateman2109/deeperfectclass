-- ============================================================================
-- School isolation for the white-label portal
-- Goal: an admin logged in on one school's website can only read the students
-- (and their results) that registered through THAT school's website.
--
-- READ THIS FIRST
--  * I have not seen your 01_schema.sql, so this file ASSUMES:
--      public.profiles(id, role, school_id, ...)
--      public.results(user_id, ...)
--      public.exam_incidents(user_id, ...)   (skip that part if the table is missing)
--  * Run it in the Supabase SQL editor on a COPY / test project first.
--  * Policies are additive (they are OR-ed with your existing ones). So if you
--    already have a policy like  using (true)  or  using (auth.role() = 'authenticated')
--    on profiles/results, that old policy still lets every admin see every school.
--    Check Authentication > Policies and drop/replace any policy that is too wide.
--  * Students must still be able to read/insert their OWN rows. Do not remove
--    those policies.
-- ============================================================================

-- 1. Which school does the signed-in admin belong to?
--    Compared as text so it works whether school_id is uuid or bigint.
create or replace function public.my_admin_school_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.school_id::text
  from public.profiles p
  where p.id = auth.uid()
    and p.role in ('admin', 'government')
  limit 1
$$;

revoke all on function public.my_admin_school_id() from public;
grant execute on function public.my_admin_school_id() to authenticated;

-- 2. An admin may read ONLY the profiles of their own school.
drop policy if exists "admin reads own school profiles" on public.profiles;
create policy "admin reads own school profiles"
  on public.profiles for select
  to authenticated
  using (school_id::text = public.my_admin_school_id());

-- 3. An admin may read ONLY the results of students from their own school.
drop policy if exists "admin reads own school results" on public.results;
create policy "admin reads own school results"
  on public.results for select
  to authenticated
  using (
    user_id in (
      select p.id from public.profiles p
      where p.school_id::text = public.my_admin_school_id()
    )
  );

-- 4. Same for exam irregularities (remove this block if you have no such table).
drop policy if exists "admin reads own school incidents" on public.exam_incidents;
create policy "admin reads own school incidents"
  on public.exam_incidents for select
  to authenticated
  using (
    user_id in (
      select p.id from public.profiles p
      where p.school_id::text = public.my_admin_school_id()
    )
  );

-- 5. Questions stay ONE shared bank for every school: nothing to change.
--    (The questions table has no school_id and is not filtered by school.)

-- 6. Quick test, run as an admin of school A:
--      select count(*) from public.profiles;   -- should show only school A's people
