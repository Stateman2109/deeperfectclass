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

-- Public registration and exam pages need to resolve the active portal by
-- hostname. Expose only the school fields used by those pages.
grant select (id, school_name, domain, is_active)
  on public.schools to anon, authenticated;

drop policy if exists "public reads active school portals" on public.schools;
create policy "public reads active school portals"
  on public.schools for select
  to anon, authenticated
  using (is_active is true);

-- School portals have different registration forms, so LGA is optional.
alter table public.profiles alter column lga drop not null;

-- Junior/Senior is a student's section, separate from Public/Private school type.
alter table public.profiles
  add column if not exists student_section text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_school uuid;
  v_section text;
  v_school_type text;
begin
  select id into v_school
  from public.schools
  where id::text = new.raw_user_meta_data->>'school_id'
    and is_active = true;

  v_section := coalesce(
    nullif(new.raw_user_meta_data->>'student_section', ''),
    case lower(new.raw_user_meta_data->>'school_type')
      when 'junior' then 'junior'
      when 'senior' then 'senior'
      else null
    end
  );

  v_school_type := case lower(new.raw_user_meta_data->>'school_type')
    when 'public' then 'public'
    when 'private' then 'private'
    else 'public'
  end;

  insert into public.profiles (
    id, full_name, email, role, lga, school_name, class_level,
    school_type, student_section, school_id
  )
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    'student',
    nullif(new.raw_user_meta_data->>'lga', ''),
    new.raw_user_meta_data->>'school_name',
    new.raw_user_meta_data->>'class_level',
    v_school_type,
    v_section,
    v_school
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    lga = excluded.lga,
    school_name = excluded.school_name,
    class_level = excluded.class_level,
    student_section = coalesce(
      excluded.student_section,
      public.profiles.student_section
    ),
    school_id = coalesce(public.profiles.school_id, excluded.school_id);

  return new;
end
$function$;

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
