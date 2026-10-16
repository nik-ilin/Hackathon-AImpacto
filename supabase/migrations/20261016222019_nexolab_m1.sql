-- Created through the Supabase CLI migration workflow; no remote database required.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 150),
  username text unique check (username is null or username ~ '^[a-z0-9_]{3,40}$'),
  institution text not null default '' check (char_length(institution) <= 250),
  country text not null default '' check (char_length(country) <= 100),
  academic_stage text check (academic_stage in ('student','phd','postdoc','researcher','other')),
  bio text not null default '' check (char_length(bio) <= 5000),
  skills text[] not null default '{}' check (
    cardinality(skills) <= 50 and array_ndims(skills) <= 1
    and array_position(skills,null) is null and char_length(array_to_string(skills,',')) <= 5000),
  orcid_id text check (orcid_id is null or orcid_id ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$'),
  visibility text not null default 'private' check (visibility in ('public','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_skills_idx on public.profiles using gin (skills);

create table public.research_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  description text not null default '' check (char_length(description) <= 10000),
  institution text not null default '' check (char_length(institution) <= 250),
  country text not null default '' check (char_length(country) <= 100),
  visibility text not null default 'private' check (visibility in ('public','private')),
  accepting_members boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_groups_owner_idx on public.research_groups(owner_id);
create index research_groups_public_idx on public.research_groups(accepting_members, created_at desc, id) where visibility='public';
create index research_groups_search_idx on public.research_groups using gin (to_tsvector('simple',name || ' ' || description));

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.research_groups(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  unique(group_id,user_id)
);
create index group_memberships_user_idx on public.group_memberships(user_id,group_id);
create table public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.research_groups(id) on delete restrict,
  applicant_id uuid not null references public.profiles(id) on delete restrict,
  message text check (char_length(message) <= 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete restrict,
  check ((status='pending' and decided_at is null and decided_by is null)
      or (status <> 'pending' and decided_at is not null and decided_by is not null)),
  check (status not in ('approved','rejected') or decided_by <> applicant_id),
  check (status <> 'cancelled' or decided_by = applicant_id)
);
create unique index group_join_requests_pending_idx on public.group_join_requests(group_id,applicant_id) where status='pending';
create index group_join_requests_applicant_idx on public.group_join_requests(applicant_id,created_at desc);
create index group_join_requests_group_status_idx on public.group_join_requests(group_id,status,created_at desc);
create index group_join_requests_decider_idx on public.group_join_requests(decided_by);

create table public.research_projects (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.research_groups(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  status text not null default 'draft' check (status in ('draft','active','completed')),
  funding_needed_amount numeric(15,2) check (funding_needed_amount >= 0 and funding_needed_amount <> 'NaN'::numeric),
  funding_currency text check (funding_currency ~ '^[A-Z]{3}$'),
  visibility text not null default 'private' check (visibility in ('public','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((funding_needed_amount is null and funding_currency is null)
    or (funding_needed_amount is not null and funding_currency is not null))
);
create index research_projects_group_idx on public.research_projects(group_id,created_at desc,id);
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null unique check (char_length(btrim(name)) between 1 and 100),
  parent_id uuid references public.topics(id) on delete restrict,
  check (parent_id is null or parent_id <> id)
);
create index topics_parent_idx on public.topics(parent_id);
create table public.profile_topics (
  profile_id uuid not null references public.profiles(id) on delete restrict,
  topic_id uuid not null references public.topics(id) on delete restrict,
  primary key(profile_id,topic_id)
);
create index profile_topics_topic_idx on public.profile_topics(topic_id,profile_id);
create table public.group_topics (
  group_id uuid not null references public.research_groups(id) on delete restrict,
  topic_id uuid not null references public.topics(id) on delete restrict,
  primary key(group_id,topic_id)
);
create index group_topics_topic_idx on public.group_topics(topic_id,group_id);
create table public.project_topics (
  project_id uuid not null references public.research_projects(id) on delete restrict,
  topic_id uuid not null references public.topics(id) on delete restrict,
  primary key(project_id,topic_id)
);
create index project_topics_topic_idx on public.project_topics(topic_id,project_id);

-- These helpers accept an entity ID, never an identity supplied by the caller.
create function private.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.research_groups where id=p_group_id and owner_id=auth.uid())
    or exists(select 1 from public.group_memberships where group_id=p_group_id and user_id=auth.uid())
  );
$$;
create function private.can_manage_group(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.research_groups where id=p_group_id and owner_id=auth.uid())
    or exists(select 1 from public.group_memberships where group_id=p_group_id and user_id=auth.uid() and role='admin')
  );
$$;
create function private.owns_group(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.research_groups where id=p_group_id and owner_id=auth.uid());
$$;
revoke all on function private.is_group_member(uuid),private.can_manage_group(uuid),private.owns_group(uuid) from public,anon,authenticated;
grant execute on function private.is_group_member(uuid),private.can_manage_group(uuid),private.owns_group(uuid) to authenticated,anon;

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated_at();
create trigger groups_updated before update on public.research_groups for each row execute function private.touch_updated_at();
create trigger projects_updated before update on public.research_projects for each row execute function private.touch_updated_at();

create function private.guard_identity() returns trigger language plpgsql set search_path='' as $$
begin
  if new.id is distinct from old.id then raise exception 'Identity is immutable' using errcode='23514'; end if;
  if tg_table_name='research_groups' then
    if new.owner_id is distinct from old.owner_id then raise exception 'Group owner is immutable' using errcode='23514'; end if;
  elsif tg_table_name='research_projects' then
    if new.group_id is distinct from old.group_id then raise exception 'Project group is immutable' using errcode='23514'; end if;
  end if;
  return new;
end;
$$;
create trigger groups_identity before update on public.research_groups for each row execute function private.guard_identity();
create trigger projects_identity before update on public.research_projects for each row execute function private.guard_identity();

create function private.guard_membership() returns trigger language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.research_groups where id=new.group_id for update;
  if v_owner=new.user_id then raise exception 'Owner cannot also be a membership' using errcode='23514'; end if;
  if tg_op='UPDATE' and (new.id <> old.id or new.group_id <> old.group_id or new.user_id <> old.user_id) then
    raise exception 'Membership identity is immutable' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger memberships_guard before insert or update on public.group_memberships for each row execute function private.guard_membership();
create function private.guard_join_request() returns trigger language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.research_groups where id=new.group_id for update;
  if tg_op='INSERT' then
    if new.status <> 'pending' or new.applicant_id=v_owner
      or exists(select 1 from public.group_memberships where group_id=new.group_id and user_id=new.applicant_id) then
      raise exception 'Invalid join request' using errcode='23514';
    end if;
  else
    if new.id <> old.id or new.group_id <> old.group_id or new.applicant_id <> old.applicant_id or new.created_at <> old.created_at then
      raise exception 'Request identity is immutable' using errcode='23514';
    end if;
    if old.status <> 'pending' or new.status='pending' then
      raise exception 'Request is already decided' using errcode='23514';
    end if;
    if new.status='approved' and not exists(select 1 from public.group_memberships where group_id=new.group_id and user_id=new.applicant_id) then
      raise exception 'Approval must create membership atomically' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger requests_guard before insert or update on public.group_join_requests for each row execute function private.guard_join_request();
revoke all on function private.touch_updated_at(),private.guard_identity(),private.guard_membership(),private.guard_join_request() from public,anon,authenticated;

alter table public.profiles enable row level security;
alter table public.research_groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_join_requests enable row level security;
alter table public.research_projects enable row level security;
alter table public.topics enable row level security;
alter table public.profile_topics enable row level security;
alter table public.group_topics enable row level security;
alter table public.project_topics enable row level security;

revoke all on public.profiles,public.research_groups,public.group_memberships,public.group_join_requests,public.research_projects,public.topics,public.profile_topics,public.group_topics,public.project_topics from public,anon,authenticated;
grant select on public.profiles,public.research_groups,public.group_memberships,public.research_projects,public.topics,public.profile_topics,public.group_topics,public.project_topics to anon,authenticated;
grant select on public.group_join_requests to authenticated;
grant insert(id,full_name,username,institution,country,academic_stage,bio,skills,orcid_id,visibility) on public.profiles to authenticated;
grant insert(owner_id,name,description,institution,country,visibility,accepting_members) on public.research_groups to authenticated;
grant insert(group_id,title,description,status,funding_needed_amount,funding_currency,visibility) on public.research_projects to authenticated;
grant update(full_name,username,institution,country,academic_stage,bio,skills,orcid_id,visibility) on public.profiles to authenticated;
grant update(name,description,institution,country,visibility,accepting_members) on public.research_groups to authenticated;
grant update(title,description,status,funding_needed_amount,funding_currency,visibility) on public.research_projects to authenticated;
grant update(role),delete on public.group_memberships to authenticated;
grant insert,delete on public.profile_topics,public.group_topics,public.project_topics to authenticated;

create policy profiles_read on public.profiles for select to anon,authenticated using (visibility='public' or id=(select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated with check (id=(select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using (id=(select auth.uid())) with check(id=(select auth.uid()));
create policy groups_read on public.research_groups for select to anon,authenticated using (visibility='public' or owner_id=(select auth.uid()) or private.is_group_member(id));
create policy groups_insert on public.research_groups for insert to authenticated with check (owner_id=(select auth.uid()));
create policy groups_update on public.research_groups for update to authenticated using (owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy memberships_read on public.group_memberships for select to anon,authenticated using (
  private.is_group_member(group_id) or exists(select 1 from public.research_groups g where g.id=group_id and g.visibility='public'));
create policy memberships_update on public.group_memberships for update to authenticated using (private.owns_group(group_id)) with check(private.owns_group(group_id));
create policy memberships_delete on public.group_memberships for delete to authenticated using (user_id=(select auth.uid()) or private.owns_group(group_id));
create policy requests_read on public.group_join_requests for select to authenticated using(applicant_id=(select auth.uid()) or private.can_manage_group(group_id));
create policy projects_read on public.research_projects for select to anon,authenticated using(
  private.is_group_member(group_id) or (visibility='public' and exists(select 1 from public.research_groups g where g.id=group_id and g.visibility='public')));
create policy projects_insert on public.research_projects for insert to authenticated with check(private.can_manage_group(group_id));
create policy projects_update on public.research_projects for update to authenticated using(private.can_manage_group(group_id)) with check(private.can_manage_group(group_id));
create policy topics_read on public.topics for select to anon,authenticated using(true);
create policy profile_topics_read on public.profile_topics for select to anon,authenticated using(exists(select 1 from public.profiles p where p.id=profile_id));
create policy profile_topics_insert on public.profile_topics for insert to authenticated with check(profile_id=(select auth.uid()));
create policy profile_topics_delete on public.profile_topics for delete to authenticated using(profile_id=(select auth.uid()));
create policy group_topics_read on public.group_topics for select to anon,authenticated using(exists(select 1 from public.research_groups g where g.id=group_id));
create policy group_topics_insert on public.group_topics for insert to authenticated with check(private.owns_group(group_id));
create policy group_topics_delete on public.group_topics for delete to authenticated using(private.owns_group(group_id));
create policy project_topics_read on public.project_topics for select to anon,authenticated using(exists(select 1 from public.research_projects p where p.id=project_id));
create policy project_topics_insert on public.project_topics for insert to authenticated with check(exists(select 1 from public.research_projects p where p.id=project_id and private.can_manage_group(p.group_id)));
create policy project_topics_delete on public.project_topics for delete to authenticated using(exists(select 1 from public.research_projects p where p.id=project_id and private.can_manage_group(p.group_id)));

create function private.request_to_join(p_group_id uuid,p_message text) returns public.group_join_requests
language plpgsql security definer set search_path='' as $$
declare v_group public.research_groups; v_request public.group_join_requests; v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_group from public.research_groups where id=p_group_id for update;
  if not found or v_group.visibility <> 'public' or not v_group.accepting_members then raise exception 'Group is not accepting requests' using errcode='42501'; end if;
  if v_group.owner_id=v_user or exists(select 1 from public.group_memberships where group_id=p_group_id and user_id=v_user) then
    raise exception 'Already belongs to group' using errcode='23514';
  end if;
  insert into public.group_join_requests(group_id,applicant_id,message) values(p_group_id,v_user,p_message) returning * into v_request;
  return v_request;
end;
$$;
create function private.decide_join_request(p_request_id uuid,p_decision text) returns public.group_join_requests
language plpgsql security definer set search_path='' as $$
declare v_request public.group_join_requests; v_group uuid; v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected') or p_decision is null then raise exception 'Invalid decision' using errcode='22023'; end if;
  select group_id into v_group from public.group_join_requests where id=p_request_id;
  perform 1 from public.research_groups where id=v_group for update;
  if not private.can_manage_group(v_group) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_request from public.group_join_requests where id=p_request_id for update;
  if not found or v_request.applicant_id=v_user then raise exception 'Not authorized' using errcode='42501'; end if;
  -- Retrying the same decision returns the persisted result and never duplicates membership.
  if v_request.status=p_decision then return v_request; end if;
  if v_request.status <> 'pending' then raise exception 'Request is already decided' using errcode='23514'; end if;
  if p_decision='approved' then
    insert into public.group_memberships(group_id,user_id,role) values(v_group,v_request.applicant_id,'member');
  end if;
  update public.group_join_requests set status=p_decision,decided_at=now(),decided_by=v_user where id=p_request_id returning * into v_request;
  return v_request;
end;
$$;
create function private.cancel_join_request(p_request_id uuid) returns public.group_join_requests
language plpgsql security definer set search_path='' as $$
declare v_request public.group_join_requests; v_group uuid; v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select group_id into v_group from public.group_join_requests where id=p_request_id;
  perform 1 from public.research_groups where id=v_group for update;
  select * into v_request from public.group_join_requests where id=p_request_id for update;
  if not found or v_request.applicant_id <> v_user then raise exception 'Not authorized' using errcode='42501'; end if;
  if v_request.status='cancelled' then return v_request; end if;
  if v_request.status <> 'pending' then raise exception 'Request is already decided' using errcode='23514'; end if;
  update public.group_join_requests set status='cancelled',decided_at=now(),decided_by=v_user where id=p_request_id returning * into v_request;
  return v_request;
end;
$$;
revoke all on function private.request_to_join(uuid,text),private.decide_join_request(uuid,text),private.cancel_join_request(uuid) from public,anon,authenticated;
grant execute on function private.request_to_join(uuid,text),private.decide_join_request(uuid,text),private.cancel_join_request(uuid) to authenticated;
create function public.request_to_join(p_group_id uuid,p_message text default null) returns public.group_join_requests
language sql security invoker set search_path='' as $$ select private.request_to_join(p_group_id,p_message); $$;
create function public.decide_join_request(p_request_id uuid,p_decision text) returns public.group_join_requests
language sql security invoker set search_path='' as $$ select private.decide_join_request(p_request_id,p_decision); $$;
create function public.cancel_join_request(p_request_id uuid) returns public.group_join_requests
language sql security invoker set search_path='' as $$ select private.cancel_join_request(p_request_id); $$;

create function public.save_profile_topics(p_topic_ids uuid[]) returns void language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'Profile required' using errcode='23503'; end if;
  if p_topic_ids is null or cardinality(p_topic_ids)>30 then raise exception 'Invalid topics' using errcode='22023'; end if;
  delete from public.profile_topics where profile_id=auth.uid();
  insert into public.profile_topics(profile_id,topic_id) select auth.uid(),x from (select distinct unnest(p_topic_ids) x) s;
end; $$;
create function public.save_group_topics(p_group_id uuid,p_topic_ids uuid[]) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.research_groups where id=p_group_id for update;
  if not private.owns_group(p_group_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_topic_ids is null or cardinality(p_topic_ids)>30 then raise exception 'Invalid topics' using errcode='22023'; end if;
  delete from public.group_topics where group_id=p_group_id;
  insert into public.group_topics(group_id,topic_id) select p_group_id,x from (select distinct unnest(p_topic_ids) x) s;
end; $$;
create function public.save_project_topics(p_project_id uuid,p_topic_ids uuid[]) returns void language plpgsql security invoker set search_path='' as $$
declare v_group uuid;
begin
  select group_id into v_group from public.research_projects where id=p_project_id for update;
  if not private.can_manage_group(v_group) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_topic_ids is null or cardinality(p_topic_ids)>30 then raise exception 'Invalid topics' using errcode='22023'; end if;
  delete from public.project_topics where project_id=p_project_id;
  insert into public.project_topics(project_id,topic_id) select p_project_id,x from (select distinct unnest(p_topic_ids) x) s;
end; $$;

create function public.upsert_profile(p_full_name text,p_username text,p_institution text,p_country text,p_academic_stage text,p_bio text,p_skills text[],p_orcid_id text,p_visibility text,p_topic_ids uuid[]) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into public.profiles(id,full_name,username,institution,country,academic_stage,bio,skills,orcid_id,visibility)
  values(auth.uid(),p_full_name,p_username,coalesce(p_institution,'') ,coalesce(p_country,'') ,p_academic_stage,coalesce(p_bio,'') ,coalesce(p_skills,'{}'::text[]),p_orcid_id,p_visibility)
  on conflict(id) do update set full_name=excluded.full_name,username=excluded.username,institution=excluded.institution,country=excluded.country,
    academic_stage=excluded.academic_stage,bio=excluded.bio,skills=excluded.skills,orcid_id=excluded.orcid_id,visibility=excluded.visibility;
  perform public.save_profile_topics(p_topic_ids);
end; $$;
create function public.save_research_group(p_group_id uuid,p_name text,p_description text,p_institution text,p_country text,p_visibility text,p_accepting_members boolean,p_topic_ids uuid[]) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_group_id is null then
    insert into public.research_groups(owner_id,name,description,institution,country,visibility,accepting_members)
    values(auth.uid(),p_name,coalesce(p_description,''),coalesce(p_institution,''),coalesce(p_country,''),p_visibility,p_accepting_members) returning id into v_id;
  else
    update public.research_groups set name=p_name,description=coalesce(p_description,''),institution=coalesce(p_institution,''),country=coalesce(p_country,''),visibility=p_visibility,accepting_members=p_accepting_members
    where id=p_group_id returning id into v_id;
    if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  end if;
  perform public.save_group_topics(v_id,p_topic_ids);
  return v_id;
end; $$;
create function public.save_research_project(p_project_id uuid,p_group_id uuid,p_title text,p_description text,p_status text,p_funding_needed_amount numeric,p_funding_currency text,p_visibility text,p_topic_ids uuid[]) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_project_id is null then
    insert into public.research_projects(group_id,title,description,status,funding_needed_amount,funding_currency,visibility)
    values(p_group_id,p_title,coalesce(p_description,''),p_status,p_funding_needed_amount,p_funding_currency,p_visibility) returning id into v_id;
  else
    update public.research_projects set title=p_title,description=coalesce(p_description,''),status=p_status,funding_needed_amount=p_funding_needed_amount,funding_currency=p_funding_currency,visibility=p_visibility
    where id=p_project_id and group_id=p_group_id returning id into v_id;
    if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  end if;
  perform public.save_project_topics(v_id,p_topic_ids);
  return v_id;
end; $$;

create function public.discover_groups(p_search text default '',p_topic_id uuid default null,p_accepting boolean default null,p_limit integer default 20,p_offset integer default 0)
returns table(id uuid,owner_id uuid,name text,description text,institution text,country text,visibility text,accepting_members boolean,created_at timestamptz,updated_at timestamptz,matched_topics text[],match_count bigint)
language sql stable security invoker set search_path='' as $$
  select g.id,g.owner_id,g.name,g.description,g.institution,g.country,g.visibility,g.accepting_members,g.created_at,g.updated_at,
    coalesce(matches.names,'{}'::text[]),coalesce(cardinality(matches.names),0)::bigint
  from public.research_groups g
  left join lateral (
    select array_agg(t.name order by t.name) names from public.group_topics gt
    join public.topics t on t.id=gt.topic_id
    join public.profile_topics pt on pt.topic_id=gt.topic_id and pt.profile_id=auth.uid()
    where gt.group_id=g.id
  ) matches on true
  where g.visibility='public'
    and (coalesce(btrim(p_search),'')='' or to_tsvector('simple',g.name || ' ' || g.description) @@ plainto_tsquery('simple',p_search))
    and (p_topic_id is null or exists(select 1 from public.group_topics gt where gt.group_id=g.id and gt.topic_id=p_topic_id))
    and (p_accepting is null or g.accepting_members=p_accepting)
  order by coalesce(cardinality(matches.names),0) desc,g.created_at desc,g.id
  limit greatest(1,least(coalesce(p_limit,20),100)) offset greatest(coalesce(p_offset,0),0);
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default: explicitly restrict every API.
revoke all on function public.request_to_join(uuid,text),public.decide_join_request(uuid,text),public.cancel_join_request(uuid),
  public.save_profile_topics(uuid[]),public.save_group_topics(uuid,uuid[]),public.save_project_topics(uuid,uuid[]),
  public.upsert_profile(text,text,text,text,text,text,text[],text,text,uuid[]),
  public.save_research_group(uuid,text,text,text,text,text,boolean,uuid[]),
  public.save_research_project(uuid,uuid,text,text,text,numeric,text,text,uuid[]),
  public.discover_groups(text,uuid,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.request_to_join(uuid,text),public.decide_join_request(uuid,text),public.cancel_join_request(uuid),
  public.save_profile_topics(uuid[]),public.save_group_topics(uuid,uuid[]),public.save_project_topics(uuid,uuid[]),
  public.upsert_profile(text,text,text,text,text,text,text[],text,text,uuid[]),
  public.save_research_group(uuid,text,text,text,text,text,boolean,uuid[]),
  public.save_research_project(uuid,uuid,text,text,text,numeric,text,text,uuid[]) to authenticated;
grant execute on function public.discover_groups(text,uuid,boolean,integer,integer) to anon,authenticated;

-- Canonical vocabulary is reference data, not fabricated researcher data.
insert into public.topics(id,slug,name) values
 ('10000000-0000-0000-0000-000000000001','physics','Física'),
 ('10000000-0000-0000-0000-000000000002','mathematics','Matemáticas'),
 ('10000000-0000-0000-0000-000000000003','engineering','Ingeniería'),
 ('10000000-0000-0000-0000-000000000004','artificial-intelligence','Inteligencia artificial'),
 ('10000000-0000-0000-0000-000000000005','biology','Biología');
insert into public.topics(id,slug,name,parent_id) values
 ('10000000-0000-0000-0000-000000000006','quantum-physics','Física cuántica','10000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000007','machine-learning','Aprendizaje automático','10000000-0000-0000-0000-000000000004'),
 ('10000000-0000-0000-0000-000000000008','molecular-biology','Biología molecular','10000000-0000-0000-0000-000000000005');

