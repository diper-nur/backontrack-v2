-- BackOnTrack_v2 / Phase 2 / Profiles, Classes, Membership
-- Intended to run ONCE on the user's empty Supabase project.
-- Does not replace or modify existing auth.users accounts.
-- All class creation and class-joining writes pass through restricted RPCs.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  created_by uuid not null references auth.users(id) on delete cascade,
  join_code text not null unique check (join_code ~ '^[A-F0-9]{16}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('owner','student')),
  joined_at timestamptz not null default now(),
  primary key (class_id,user_id)
);

create index if not exists classes_created_by_idx on public.classes(created_by);
create index if not exists class_members_user_id_idx on public.class_members(user_id);

-- Supabase projects with 'Automatically expose new tables' OFF require explicit GRANTs.
-- Neither anonymous reads nor direct writes to classes / class_members are allowed.
revoke all on table public.profiles, public.classes, public.class_members from anon;
revoke all on table public.profiles, public.classes, public.class_members from authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.classes, public.class_members to authenticated;

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- The member's own membership rows are the only rows readable in the API.
drop policy if exists class_members_select_self on public.class_members;
create policy class_members_select_self on public.class_members
  for select to authenticated using (user_id = (select auth.uid()));

-- Each user can only read classes for which they have their own membership row.
drop policy if exists classes_select_member on public.classes;
create policy classes_select_member on public.classes
  for select to authenticated using (
    exists (
      select 1 from public.class_members cm
      where cm.class_id = id and cm.user_id = (select auth.uid())
    )
  );

-- Create a profile when a new Supabase Auth user is created.
create or replace function public.handle_backontrack_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_backontrack_new_user() from public, anon, authenticated;
drop trigger if exists on_backontrack_auth_user_created on auth.users;
create trigger on_backontrack_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_backontrack_new_user();

-- Backfill profiles for users who registered BEFORE this migration.
insert into public.profiles(id)
select id from auth.users
on conflict (id) do nothing;

-- RPC 1: Create a class and add the creator as its owner atomically.
create or replace function public.create_class(p_name text)
returns table (class_id uuid, class_name text, class_join_code text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_name text := btrim(p_name);
  v_code text;
  v_try int;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 80 then
    raise exception 'Class name must contain 2 to 80 characters';
  end if;

  -- 16 hex chars = 64-bit random invite code; retry on the very unlikely collision.
  for v_try in 1..5 loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    insert into public.classes(name, created_by, join_code)
      values (v_name, v_uid, v_code)
      on conflict (join_code) do nothing
      returning id into v_id;
    exit when v_id is not null;
  end loop;

  if v_id is null then
    raise exception 'Could not generate a unique class code';
  end if;

  insert into public.class_members(class_id, user_id, role)
    values (v_id, v_uid, 'owner');

  return query select v_id, v_name, v_code;
end;
$$;

-- RPC 2: Join an existing class by its invitation code.
create or replace function public.join_class(p_code text)
returns table (class_id uuid, class_name text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_code is null or char_length(btrim(p_code)) <> 16 then
    raise exception 'Invalid class code';
  end if;

  select c.id, c.name into v_id, v_name
    from public.classes c
    where c.join_code = upper(btrim(p_code))
    limit 1;

  if v_id is null then
    raise exception 'Class not found';
  end if;

  insert into public.class_members(class_id, user_id, role)
    values (v_id, v_uid, 'student')
    on conflict (class_id, user_id) do nothing;

  return query select v_id, v_name;
end;
$$;

-- SECURITY DEFINER bypasses RLS: narrowly restrict who can execute both RPCs.
revoke all on function public.create_class(text) from public, anon;
revoke all on function public.join_class(text) from public, anon;
grant execute on function public.create_class(text) to authenticated;
grant execute on function public.join_class(text) to authenticated;
