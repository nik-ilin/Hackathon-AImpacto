-- Additive M1 extension. CLI creation was blocked by the local sandbox writing ~/.supabase.
-- No profile visibility or discover_groups ranking changes; no candidate recommendations.
create function private.normalize_skills(p_skills text[]) returns text[]
language sql immutable set search_path='' as $$
  select coalesce(array_agg(s order by s),'{}'::text[]) from (
    select distinct lower(btrim(regexp_replace(skill,'[[:space:]]+',' ','g'))) s
    from unnest(p_skills) skill
  ) normalized where s <> '';
$$;
revoke all on function private.normalize_skills(text[]) from public,anon,authenticated;

-- Match the existing group/project read policy explicitly inside privileged RPCs.
create function private.can_read_need_scope(p_group_id uuid,p_project_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.research_groups g where g.id=p_group_id
    and (g.visibility='public' or private.is_group_member(g.id))
    and (p_project_id is null or exists(select 1 from public.research_projects p
      where p.id=p_project_id and p.group_id=g.id
        and (private.is_group_member(g.id) or (g.visibility='public' and p.visibility='public')))));
$$;
revoke all on function private.can_read_need_scope(uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_read_need_scope(uuid,uuid) to authenticated;

alter table public.research_projects add constraint projects_id_group_unique unique(id,group_id);
create table public.recruitment_needs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.research_groups(id) on delete restrict,
  project_id uuid,
  title text not null check(char_length(btrim(title)) between 3 and 200),
  description text not null default '' check(char_length(description)<=10000),
  required_skills text[] not null default '{}' check(cardinality(required_skills)<=50
    and array_ndims(required_skills)<=1 and array_position(required_skills,null) is null
    and char_length(array_to_string(required_skills,','))<=5000),
  status text not null default 'open' check(status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id,group_id) references public.research_projects(id,group_id) on delete restrict
);
create index recruitment_needs_group_idx on public.recruitment_needs(group_id,created_at desc,id);
create index recruitment_needs_project_idx on public.recruitment_needs(project_id);
create trigger recruitment_needs_updated before update on public.recruitment_needs
  for each row execute function private.touch_updated_at();

create table public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  need_id uuid not null references public.recruitment_needs(id) on delete restrict,
  impression_key uuid not null,
  algorithm_version text not null,
  context jsonb not null,
  evaluation jsonb not null,
  created_at timestamptz not null default now(),
  shown_at timestamptz,
  unique(actor_id,impression_key),
  unique(id,actor_id)
);
create index recommendation_events_need_idx on public.recommendation_events(need_id);
create table public.recommendation_feedback (
  event_id uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  response text not null check(response in ('useful','not_useful')),
  comment text not null default '' check(char_length(comment)<=2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(event_id,actor_id) references public.recommendation_events(id,actor_id) on delete restrict
);
create index recommendation_feedback_actor_idx on public.recommendation_feedback(actor_id);
create trigger recommendation_feedback_updated before update on public.recommendation_feedback
  for each row execute function private.touch_updated_at();
alter table public.recruitment_needs enable row level security;
alter table public.recommendation_events enable row level security;
alter table public.recommendation_feedback enable row level security;
revoke all on public.recruitment_needs,public.recommendation_events,public.recommendation_feedback from public,anon,authenticated;
grant select on public.recruitment_needs,public.recommendation_events,public.recommendation_feedback to authenticated;
create policy needs_read on public.recruitment_needs for select to authenticated
  using(private.can_read_need_scope(group_id,project_id));
create policy recommendation_events_read on public.recommendation_events for select to authenticated
  using(actor_id=(select auth.uid()));
create policy recommendation_feedback_read on public.recommendation_feedback for select to authenticated
  using(actor_id=(select auth.uid()));

create function private.save_recruitment_need(p_need_id uuid,p_group_id uuid,p_project_id uuid,
  p_title text,p_description text,p_required_skills text[],p_status text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from public.research_groups where id=p_group_id for update;
  if not private.can_manage_group(p_group_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_project_id is not null and not exists(select 1 from public.research_projects where id=p_project_id and group_id=p_group_id) then
    raise exception 'Project must belong to group' using errcode='23514';
  end if;
  -- Validate input before normalization, which must not hide oversized or null-containing arrays.
  if p_required_skills is null or cardinality(p_required_skills)>50 or array_ndims(p_required_skills)>1
    or array_position(p_required_skills,null) is not null or char_length(array_to_string(p_required_skills,','))>5000
    or exists(select 1 from unnest(p_required_skills) skill where char_length(btrim(skill))>100) then
    raise exception 'Invalid required skills' using errcode='23514';
  end if;
  if p_need_id is null then
    insert into public.recruitment_needs(group_id,project_id,title,description,required_skills,status)
    values(p_group_id,p_project_id,btrim(p_title),coalesce(p_description,''),private.normalize_skills(p_required_skills),p_status)
    returning id into v_id;
  else
    update public.recruitment_needs set project_id=p_project_id,title=btrim(p_title),description=coalesce(p_description,''),
      required_skills=private.normalize_skills(p_required_skills),status=p_status
    where id=p_need_id and group_id=p_group_id returning id into v_id;
    if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  end if;
  return v_id;
end;
$$;

create function private.diagnose_recruitment_need(p_need_id uuid,p_impression_key uuid)
returns public.recommendation_events language plpgsql security definer set search_path='' as $$
declare
  v_need public.recruitment_needs;
  v_event public.recommendation_events;
  v_declared text[]; v_skills text[]; v_required text[];
  v_matched text[]; v_missing text[]; v_additional text[]; v_topics text[];
  v_group_name text; v_project_title text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_impression_key is null then raise exception 'Impression key required' using errcode='23514'; end if;
  -- Same actor/key is serialized, including concurrent requests for different needs.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_impression_key::text,0));
  select * into v_need from public.recruitment_needs where id=p_need_id;
  if not found or not private.can_read_need_scope(v_need.group_id,v_need.project_id) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into v_event from public.recommendation_events where actor_id=auth.uid() and impression_key=p_impression_key;
  if found then
    if v_event.need_id<>p_need_id then raise exception 'Impression key already used for another need' using errcode='23514'; end if;
    return v_event;
  end if;
  if v_need.status<>'open' then raise exception 'Need is closed' using errcode='23514'; end if;
  select skills into v_declared from public.profiles where id=auth.uid();
  if not found then raise exception 'Profile required' using errcode='23514'; end if;
  v_skills:=private.normalize_skills(v_declared);
  v_required:=private.normalize_skills(v_need.required_skills);
  select coalesce(array_agg(s order by s),'{}'::text[]) into v_matched from unnest(v_required) s where s=any(v_skills);
  select coalesce(array_agg(s order by s),'{}'::text[]) into v_missing from unnest(v_required) s where not(s=any(v_skills));
  select coalesce(array_agg(s order by s),'{}'::text[]) into v_additional from unnest(v_skills) s where not(s=any(v_required));
  select coalesce(array_agg(distinct t.name order by t.name),'{}'::text[]) into v_topics
    from public.profile_topics pt join public.topics t on t.id=pt.topic_id
    where pt.profile_id=auth.uid() and (exists(select 1 from public.group_topics gt where gt.group_id=v_need.group_id and gt.topic_id=t.id)
      or exists(select 1 from public.project_topics prt where prt.project_id=v_need.project_id and prt.topic_id=t.id));
  select name into v_group_name from public.research_groups where id=v_need.group_id;
  select title into v_project_title from public.research_projects where id=v_need.project_id;
  insert into public.recommendation_events(actor_id,need_id,impression_key,algorithm_version,context,evaluation)
  values(auth.uid(),v_need.id,p_impression_key,'skills-coverage-v1',
    jsonb_build_object('kind','recruitment','need_id',v_need.id,'title',v_need.title,'description',v_need.description,
      'group_id',v_need.group_id,'group_name',v_group_name,'project_id',v_need.project_id,'project_title',v_project_title,
      'required_skills',v_need.required_skills,'declared_skills',v_declared,'need_updated_at',v_need.updated_at),
    jsonb_build_object('required_skills',v_required,'matched_skills',v_matched,'missing_skills',v_missing,
      'additional_skills',v_additional,'coverage',case when cardinality(v_required)=0 then null
        else cardinality(v_matched)::numeric/cardinality(v_required) end,'matched_topics',v_topics))
  returning * into v_event;
  return v_event;
end;
$$;

create function private.mark_recommendation_shown(p_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.recommendation_events set shown_at=coalesce(shown_at,now()) where id=p_event_id and actor_id=auth.uid();
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
end;
$$;
create function private.save_recommendation_feedback(p_event_id uuid,p_response text,p_comment text) returns void
language plpgsql security definer set search_path='' as $$
declare v_event public.recommendation_events;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_event from public.recommendation_events where id=p_event_id and actor_id=auth.uid() for update;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if v_event.shown_at is null then raise exception 'Recommendation not shown' using errcode='23514'; end if;
  insert into public.recommendation_feedback(event_id,actor_id,response,comment)
  values(p_event_id,auth.uid(),p_response,coalesce(p_comment,''))
  on conflict(event_id) do update set response=excluded.response,comment=excluded.comment;
end;
$$;

create function public.save_recruitment_need(p_need_id uuid,p_group_id uuid,p_project_id uuid,p_title text,
  p_description text,p_required_skills text[],p_status text) returns uuid
language sql security invoker set search_path='' as $$ select private.save_recruitment_need(p_need_id,p_group_id,p_project_id,p_title,p_description,p_required_skills,p_status); $$;
create function public.diagnose_recruitment_need(p_need_id uuid,p_impression_key uuid) returns public.recommendation_events
language sql security invoker set search_path='' as $$ select private.diagnose_recruitment_need(p_need_id,p_impression_key); $$;
create function public.mark_recommendation_shown(p_event_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.mark_recommendation_shown(p_event_id); $$;
create function public.save_recommendation_feedback(p_event_id uuid,p_response text,p_comment text) returns void
language sql security invoker set search_path='' as $$ select private.save_recommendation_feedback(p_event_id,p_response,p_comment); $$;

revoke all on function private.save_recruitment_need(uuid,uuid,uuid,text,text,text[],text),private.diagnose_recruitment_need(uuid,uuid),
  private.mark_recommendation_shown(uuid),private.save_recommendation_feedback(uuid,text,text),
  public.save_recruitment_need(uuid,uuid,uuid,text,text,text[],text),public.diagnose_recruitment_need(uuid,uuid),
  public.mark_recommendation_shown(uuid),public.save_recommendation_feedback(uuid,text,text) from public,anon,authenticated;
grant execute on function private.save_recruitment_need(uuid,uuid,uuid,text,text,text[],text),private.diagnose_recruitment_need(uuid,uuid),
  private.mark_recommendation_shown(uuid),private.save_recommendation_feedback(uuid,text,text),
  public.save_recruitment_need(uuid,uuid,uuid,text,text,text[],text),public.diagnose_recruitment_need(uuid,uuid),
  public.mark_recommendation_shown(uuid),public.save_recommendation_feedback(uuid,text,text) to authenticated;
