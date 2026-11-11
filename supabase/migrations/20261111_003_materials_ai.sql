-- BackOnTrack v2 / Phase 5 / Private shared materials and metered AI.
-- Requires migrations 001 (classes) and 002 (subjects/tasks).
-- Run ONCE on BackOnTrack_v2. Do not rerun earlier migrations.
-- Never put an OpenAI key in SQL, browser files or GitHub.
begin;

create table public.materials (
 id uuid primary key default gen_random_uuid(),
 class_id uuid not null references public.classes(id) on delete cascade,
 subject_id uuid not null,
 uploaded_by uuid not null references auth.users(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 2 and 180),
 description text not null default '' check (char_length(description) <= 2000),
 created_at timestamptz not null default now(),
 constraint material_subject_class_fk foreign key (subject_id,class_id) references public.subjects(id,class_id)
);
create index materials_class_idx on public.materials(class_id,created_at desc);

create table public.material_files (
 id uuid primary key default gen_random_uuid(),
 material_id uuid not null references public.materials(id) on delete cascade,
 uploaded_by uuid not null references auth.users(id) on delete cascade,
 storage_path text not null unique check (char_length(storage_path) < 240),
 filename text not null check (char_length(filename) between 1 and 180),
 mime_type text not null,
 byte_size integer not null check (byte_size between 1 and 10485760),
 created_at timestamptz not null default now()
);
create index material_files_material_idx on public.material_files(material_id);

-- Material review is shared among class members; recovery plans stay private.
-- Clients have SELECT only. All writes are done by server-side Edge Functions.
create table public.ai_results (
 id uuid primary key default gen_random_uuid(),
 scope_key text not null,
 kind text not null check (kind in ('material','recovery')),
 fingerprint text not null check (char_length(fingerprint) = 64),
 class_id uuid not null references public.classes(id) on delete cascade,
 material_id uuid references public.materials(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null check (status in ('processing','done','error')),
 result jsonb,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 unique(scope_key,kind,fingerprint)
);
create index ai_results_material_idx on public.ai_results(material_id,kind,status);
create index ai_results_recovery_idx on public.ai_results(user_id,class_id,kind,status);

create table public.ai_usage_daily (
 user_id uuid not null references auth.users(id) on delete cascade,
 usage_day date not null,
 used integer not null default 0 check (used between 0 and 5),
 primary key(user_id,usage_day)
);
create table public.ai_global_usage_daily (
 usage_day date primary key,
 used integer not null default 0 check (used between 0 and 50)
);

revoke all on public.materials,public.material_files,public.ai_results,public.ai_usage_daily,public.ai_global_usage_daily from public,anon,authenticated;
grant select,insert,delete on public.materials,public.material_files to authenticated;
grant select on public.ai_results,public.ai_usage_daily to authenticated;

alter table public.materials enable row level security;
alter table public.material_files enable row level security;
alter table public.ai_results enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.ai_global_usage_daily enable row level security;

create policy materials_member_read on public.materials for select to authenticated using (
 exists(select 1 from public.class_members c where c.class_id=materials.class_id and c.user_id=(select auth.uid()))
);
create policy materials_member_insert on public.materials for insert to authenticated with check (
 uploaded_by=(select auth.uid()) and
 exists(select 1 from public.class_members c where c.class_id=materials.class_id and c.user_id=(select auth.uid()))
);
create policy materials_uploader_delete on public.materials for delete to authenticated using (uploaded_by=(select auth.uid()));

create policy material_files_member_read on public.material_files for select to authenticated using (
 exists(select 1 from public.materials m join public.class_members c on c.class_id=m.class_id
        where m.id=material_files.material_id and c.user_id=(select auth.uid()))
);
create policy material_files_uploader_insert on public.material_files for insert to authenticated with check (
 uploaded_by=(select auth.uid()) and
 exists(select 1 from public.materials m where m.id=material_files.material_id and m.uploaded_by=(select auth.uid())
   and storage_path like (m.class_id::text || '/' || (select auth.uid())::text || '/%'))
);
create policy material_files_uploader_delete on public.material_files for delete to authenticated using (
 uploaded_by=(select auth.uid())
);
create policy ai_results_read on public.ai_results for select to authenticated using (
  (kind='material' and exists(select 1 from public.class_members c where c.class_id=ai_results.class_id and c.user_id=(select auth.uid())))
  or (kind='recovery' and user_id=(select auth.uid()))
);
create policy ai_usage_read_self on public.ai_usage_daily for select to authenticated using (user_id=(select auth.uid()));

-- Private Storage bucket. No public URLs. Limit MIME and 10MB per file.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('class-materials','class-materials',false,10485760,
 array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'text/plain','image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Path: classUUID/userUUID/randomUUID.ext. Ownership is tied to the JWT uploader.
create policy bot_material_storage_read on storage.objects for select to authenticated using (
 bucket_id='class-materials' and
 exists(select 1 from public.class_members c where c.class_id::text=split_part(name,'/',1) and c.user_id=(select auth.uid()))
);
create policy bot_material_storage_insert on storage.objects for insert to authenticated with check (
 bucket_id='class-materials' and owner_id=(select auth.uid())::text and
 split_part(name,'/',2)=(select auth.uid())::text and
 name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx|pptx|xlsx|txt|png|jpg|jpeg|webp)$' and
 exists(select 1 from public.class_members c where c.class_id::text=split_part(name,'/',1) and c.user_id=(select auth.uid()))
);
create policy bot_material_storage_delete on storage.objects for delete to authenticated using (
 bucket_id='class-materials' and owner_id=(select auth.uid())::text
);

-- All following RPCs are accessible ONLY using server-side secret/service credentials.
-- The Edge Function authenticates the end user and passes its verified UUID.
create function public.bot_reserve_ai(p_user uuid,p_class uuid,p_kind text,p_material uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_scope text; v_existing public.ai_results%rowtype; v_day date := (now() at time zone 'utc')::date;
 v_usage integer; v_global integer; v_new_id uuid;
begin
 if p_user is null or p_class is null or p_kind not in ('material','recovery') or p_fingerprint !~ '^[a-f0-9]{64}$' then
   raise exception 'Invalid generation request';
 end if;
 if not exists(select 1 from public.class_members cm where cm.class_id=p_class and cm.user_id=p_user) then
   raise exception 'Not a member of this class';
 end if;
 if p_kind='material' then
   if p_material is null or not exists(select 1 from public.materials m
           where m.id=p_material and m.class_id=p_class and m.uploaded_by=p_user) then
     raise exception 'Only material uploader can generate analysis';
   end if;
   v_scope:='material:'||p_material::text;
 else
   if p_material is not null then raise exception 'Unexpected material'; end if;
   v_scope:='recovery:'||p_class::text||':'||p_user::text;
 end if;

 perform pg_advisory_xact_lock(hashtextextended(v_scope||':'||p_kind||':'||p_fingerprint,0));
 select * into v_existing from public.ai_results
  where scope_key=v_scope and kind=p_kind and fingerprint=p_fingerprint for update;
 if found and v_existing.status='done' then
   return jsonb_build_object('state','cached','result',v_existing.result,'run_id',v_existing.id);
 end if;
 if found and v_existing.status='processing' and v_existing.started_at > now()-interval '120 seconds' then
   return jsonb_build_object('state','busy');
 end if;

 insert into public.ai_usage_daily(user_id,usage_day,used) values(p_user,v_day,0) on conflict do nothing;
 select used into v_usage from public.ai_usage_daily where user_id=p_user and usage_day=v_day for update;
 if v_usage>=5 then return jsonb_build_object('state','limit','message','Daily limit of 5 new AI requests reached (UTC)'); end if;
 insert into public.ai_global_usage_daily(usage_day,used) values(v_day,0) on conflict do nothing;
 select used into v_global from public.ai_global_usage_daily where usage_day=v_day for update;
 if v_global>=50 then return jsonb_build_object('state','global_limit','message','Project-wide AI request cap reached today'); end if;
 update public.ai_usage_daily set used=used+1 where user_id=p_user and usage_day=v_day;
 update public.ai_global_usage_daily set used=used+1 where usage_day=v_day;
 if v_existing.id is not null then
   update public.ai_results set status='processing',result=null,user_id=p_user,started_at=now(),finished_at=null
     where id=v_existing.id returning id into v_new_id;
 else
   insert into public.ai_results(scope_key,kind,fingerprint,class_id,material_id,user_id,status)
     values(v_scope,p_kind,p_fingerprint,p_class,p_material,p_user,'processing') returning id into v_new_id;
 end if;
 return jsonb_build_object('state','started','run_id',v_new_id,'remaining',4-v_usage);
end;
$$;

create function public.bot_finish_ai(p_run uuid,p_user uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if p_result is null or jsonb_typeof(p_result)<>'object' then raise exception 'Invalid AI payload'; end if;
 update public.ai_results set status='done',result=p_result,finished_at=now()
  where id=p_run and user_id=p_user and status='processing';
 return found;
end;
$$;

create function public.bot_fail_ai(p_run uuid,p_user uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 update public.ai_results set status='error',finished_at=now()
  where id=p_run and user_id=p_user and status='processing';
 return found;
end;
$$;

revoke all on function public.bot_reserve_ai(uuid,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.bot_finish_ai(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.bot_fail_ai(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bot_reserve_ai(uuid,uuid,text,uuid,text) to service_role;
grant execute on function public.bot_finish_ai(uuid,uuid,jsonb) to service_role;
grant execute on function public.bot_fail_ai(uuid,uuid) to service_role;

commit;
