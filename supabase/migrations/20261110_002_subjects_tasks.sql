-- BackOnTrack_v2 / Phase 3: Subjects & personal Tasks
-- Apply only after 20261110_001_classes.sql has succeeded.
-- Non-destructive: creates new tables; no classes, membership or auth tables are dropped.
-- User tasks are private; subjects are shared with members of the same class.

begin;

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (id, class_id)
);

-- Avoid duplicate names like 'Math' and ' math ' within one class.
create unique index if not exists subjects_class_name_ci_idx
  on public.subjects(class_id, lower(btrim(name)));
create index if not exists subjects_class_id_idx on public.subjects(class_id);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  description text not null default '' check (char_length(description) <= 3000),
  notes text not null default '' check (char_length(notes) <= 3000),
  due_date date not null default (current_date + 1),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tasks_subject_same_class_fk foreign key (subject_id, class_id)
    references public.subjects(id, class_id),
  constraint tasks_completion_consistency check (
    (status = 'pending' and completed_at is null) or
    (status = 'completed' and completed_at is not null)
  )
);

create index if not exists tasks_user_class_idx
  on public.tasks(user_id, class_id, created_at desc);
create index if not exists tasks_user_deadline_idx
  on public.tasks(user_id, class_id, due_date);

-- Projects configured with 'Automatically expose new tables: OFF' require explicit grants.
revoke all on table public.subjects, public.tasks from anon, authenticated;
grant select, insert on table public.subjects to authenticated;
grant select, insert, delete on table public.tasks to authenticated;
grant update (status, completed_at) on table public.tasks to authenticated;

alter table public.subjects enable row level security;
alter table public.tasks enable row level security;

-- Subjects: all class members can read and add class subjects.
create policy subjects_select_class_members on public.subjects
  for select to authenticated
  using (
    exists (
      select 1 from public.class_members cm
      where cm.class_id = subjects.class_id and cm.user_id = (select auth.uid())
    )
  );

create policy subjects_insert_class_members on public.subjects
  for insert to authenticated
  with check (
    created_by = (select auth.uid()) and
    exists (
      select 1 from public.class_members cm
      where cm.class_id = subjects.class_id and cm.user_id = (select auth.uid())
    )
  );

-- Tasks: a member can only read/write their OWN personal tasks in a joined class.
create policy tasks_select_owner on public.tasks
  for select to authenticated
  using (
    user_id = (select auth.uid()) and
    exists (
      select 1 from public.class_members cm
      where cm.class_id = tasks.class_id and cm.user_id = (select auth.uid())
    )
  );

create policy tasks_insert_owner on public.tasks
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and
    exists (
      select 1 from public.class_members cm
      where cm.class_id = tasks.class_id and cm.user_id = (select auth.uid())
    )
  );

create policy tasks_update_owner on public.tasks
  for update to authenticated
  using (
    user_id = (select auth.uid()) and
    exists (
      select 1 from public.class_members cm
      where cm.class_id = tasks.class_id and cm.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid()) and
    exists (
      select 1 from public.class_members cm
      where cm.class_id = tasks.class_id and cm.user_id = (select auth.uid())
    )
  );

create policy tasks_delete_owner on public.tasks
  for delete to authenticated
  using (
    user_id = (select auth.uid()) and
    exists (
      select 1 from public.class_members cm
      where cm.class_id = tasks.class_id and cm.user_id = (select auth.uid())
    )
  );

commit;
