-- Funding facts use the same identity/history catalog as scholarships; eligibility is never inferred.
alter table public.opportunities drop constraint opportunities_title_check;
alter table public.opportunities add constraint opportunities_title_check check (char_length(btrim(title)) between 3 and 1000);
alter table public.opportunities drop constraint opportunities_provider_check;
alter table public.opportunities add constraint opportunities_provider_check check (char_length(btrim(provider)) between 1 and 400);
alter table public.opportunities drop constraint opportunities_summary_check;
alter table public.opportunities add constraint opportunities_summary_check check (char_length(summary) <= 20000);
alter table public.opportunities drop constraint opportunities_status_check;
alter table public.opportunities add constraint opportunities_status_check check (status in ('open','forthcoming','closed','unknown','pending_review'));

create table public.funding_details (
 opportunity_id uuid primary key references public.opportunities(id) on delete restrict,
 funder_type text not null check (funder_type in ('public','private')),
 source_url text not null check (source_url ~ '^https://'),
 programme text, call_identifier text, instrument text,
 scope text not null check (scope in ('local','regional','national','european','international')),
 regions text[] not null default '{}' check (cardinality(regions)<=100 and array_position(regions,null) is null),
 eligible_beneficiaries text[] not null default '{}' check (eligible_beneficiaries <@ array['university','research_center','hospital','company','nonprofit','individual','public_body']::text[] and array_position(eligible_beneficiaries,null) is null),
 beneficiary_notes text not null default '' check (char_length(beneficiary_notes)<=5000),
 currency text check (currency ~ '^[A-Z]{3}$'),
 total_budget numeric check (total_budget>=0 and total_budget<1e18), min_amount numeric check (min_amount>=0 and min_amount<1e18), max_amount numeric check (max_amount>=0 and max_amount<1e18),
 expected_grants integer check (expected_grants>=0), deadline_text text check (char_length(deadline_text)<=1000),
 keywords text[] not null default '{}' check (cardinality(keywords)<=100 and array_position(keywords,null) is null),
 language text not null default 'es' check (char_length(language) between 2 and 20),
 raw jsonb not null default '{}' check (jsonb_typeof(raw)='object' and octet_length(raw::text)<=262144),
 updated_at timestamptz not null default now(),
 check ((total_budget is null and min_amount is null and max_amount is null) or currency is not null),
 check (min_amount is null or max_amount is null or min_amount<=max_amount)
);
create table public.judy_runs (
 id uuid primary key default gen_random_uuid(), request_id text not null unique check (char_length(request_id) between 8 and 160),
 trigger text not null check (trigger in ('cli','make','schedule','test')),
 parameters jsonb not null check (jsonb_typeof(parameters)='object'),
 status text not null default 'running' check (status in ('running','completed','partial','failed')),
 lease_token uuid not null default gen_random_uuid(), lease_until timestamptz not null default (now()+interval '10 minutes'),
 started_at timestamptz not null default now(), finished_at timestamptz,
 created_count integer not null default 0, updated_count integer not null default 0, unchanged_count integer not null default 0,
 stats jsonb not null default '{}', errors jsonb not null default '[]', skipped jsonb not null default '[]',
 check (created_count>=0 and updated_count>=0 and unchanged_count>=0),
 check (jsonb_typeof(stats)='object' and jsonb_typeof(errors)='array' and jsonb_typeof(skipped)='array'),
 check ((status='running' and finished_at is null) or (status<>'running' and finished_at is not null))
);
create unique index judy_one_active_run_idx on public.judy_runs((true)) where status='running';
create table public.judy_run_batches (
 run_id uuid not null references public.judy_runs(id) on delete restrict,
 batch_key text not null check (char_length(batch_key) between 1 and 100),
 payload_hash text not null, created_count integer not null, updated_count integer not null, unchanged_count integer not null,
 recorded_at timestamptz not null default now(), primary key(run_id,batch_key)
);
alter table public.funding_details enable row level security;
alter table public.judy_runs enable row level security;
alter table public.judy_run_batches enable row level security;
revoke all on public.funding_details,public.judy_runs,public.judy_run_batches from public,anon,authenticated;
grant select on public.funding_details to authenticated;
grant all on public.funding_details,public.judy_runs,public.judy_run_batches to service_role;
create policy funding_details_public_read on public.funding_details for select to authenticated
 using (exists(select 1 from public.opportunities o where o.id=opportunity_id));
drop policy opportunities_public_read on public.opportunities;
create policy opportunities_public_read on public.opportunities for select to authenticated
 using (status in ('open','forthcoming') and checked_at between now()-interval '14 days' and now()
 and (official_deadline_date is null or official_deadline_date>=current_date)
 and (official_deadline_at is null or official_deadline_at>=now())
 and exists(select 1 from public.opportunity_sources s where s.id=source_id and s.status='active'));

-- Registry URLs are configuration only: no data is fabricated or fetched by this migration.
insert into public.opportunity_sources(id,name,official_url,terms_url,ingestion_method,frequency_hours,status)
values ('eu_funding_tenders','EU Funding and Tenders','https://ec.europa.eu/info/funding-tenders/opportunities/portal/','https://commission.europa.eu/legal-notice_en','api',24,'pending_review'),
 ('ucm_otri','UCM OTRI','https://www.ucm.es/otri/','https://www.ucm.es/aviso-legal','api',24,'pending_review'),
 ('private_web','Configured private funding sources','https://example.invalid/','https://example.invalid/terms','firecrawl',24,'paused')
on conflict(id) do nothing;

create function private.judy_summary(p_run public.judy_runs) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('run_id',p_run.id,'request_id',p_run.request_id,'status',p_run.status,
 'created',p_run.created_count,'updated',p_run.updated_count,'unchanged',p_run.unchanged_count,
 'started_at',p_run.started_at,'finished_at',p_run.finished_at,'stats',p_run.stats,'errors',p_run.errors,'skipped',p_run.skipped);
$$;
create function private.judy_get_run(p_request_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.judy_runs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into r from public.judy_runs where request_id=p_request_id for update;
 if not found then return null; end if;
 if r.status='running' and r.lease_until<clock_timestamp() then
  update public.judy_runs set status=case when created_count+updated_count+unchanged_count>0 then 'partial' else 'failed' end,
   errors=errors||jsonb_build_array('LEASE_EXPIRED'),finished_at=now() where id=r.id returning * into r;
 end if;
 return private.judy_summary(r);
end; $$;
create function private.judy_begin_run(p_request_id text,p_trigger text,p_parameters jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.judy_runs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_request_id is null or char_length(p_request_id) not between 8 and 160 or p_trigger is null
 or p_trigger not in ('cli','make','schedule','test') or jsonb_typeof(p_parameters) is distinct from 'object'
 or octet_length(p_parameters::text)>16384 then raise exception 'Invalid run request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nexolab:judy:run',0));
 update public.judy_runs set status=case when created_count+updated_count+unchanged_count>0 then 'partial' else 'failed' end,
 errors=errors||jsonb_build_array('LEASE_EXPIRED'),finished_at=now() where status='running' and lease_until<clock_timestamp();
 select * into r from public.judy_runs where request_id=p_request_id for update;
 if found then
  if r.trigger<>p_trigger or r.parameters<>p_parameters then raise exception 'Request ID reused with different parameters' using errcode='22023'; end if;
  return private.judy_summary(r)||jsonb_build_object('reused',true,'claimed',false);
 end if;
 if exists(select 1 from public.judy_runs where status='running') then raise exception 'JUDY_BUSY' using errcode='55P03'; end if;
 insert into public.judy_runs(request_id,trigger,parameters) values(p_request_id,p_trigger,p_parameters) returning * into r;
 return private.judy_summary(r)||jsonb_build_object('reused',false,'claimed',true,'lease_token',r.lease_token);
end; $$;
create function private.judy_renew_run(p_run_id uuid,p_lease_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.judy_runs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 update public.judy_runs set lease_until=clock_timestamp()+interval '10 minutes' where id=p_run_id and lease_token=p_lease_token
 and status='running' and lease_until>=clock_timestamp() returning * into r;
 if not found then raise exception 'Run lease is not active' using errcode='22023'; end if;
 return jsonb_build_object('run_id',r.id,'status',r.status,'lease_until',r.lease_until);
end; $$;
create function private.judy_upsert_opportunities(p_run_id uuid,p_lease_token uuid,p_batch_key text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.judy_runs; b public.judy_run_batches; item jsonb; d public.funding_details;
 o public.opportunities; item_hash text; batch_hash text; outcome text;
 n_created integer:=0; n_updated integer:=0; n_unchanged integer:=0; next_version integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into r from public.judy_runs where id=p_run_id for update;
 if not found or r.lease_token is distinct from p_lease_token or r.status<>'running' or r.lease_until<clock_timestamp() then
  raise exception 'Run lease is not active' using errcode='22023'; end if;
 if p_batch_key is null or char_length(p_batch_key) not between 1 and 100
 or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>200
 or octet_length(p_items::text)>4194304 then raise exception 'Invalid funding batch' using errcode='22023'; end if;
 batch_hash:=encode(sha256(convert_to(p_items::text,'UTF8')),'hex');
 select * into b from public.judy_run_batches where run_id=p_run_id and batch_key=p_batch_key;
 if found then
  if b.payload_hash<>batch_hash then raise exception 'Batch key reused with different data' using errcode='22023'; end if;
  return jsonb_build_object('created',b.created_count,'updated',b.updated_count,'unchanged',b.unchanged_count,'reused',true);
 end if;
 for item in select value from jsonb_array_elements(p_items) order by value->>'source',value->>'external_id' loop
  if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'source','') not in ('bdns','eu_funding_tenders','ucm_otri','private_web')
  or nullif(btrim(item->>'external_id'),'') is null or item->>'status' is null
  or item->>'status' not in ('open','forthcoming','closed','unknown') then raise exception 'Invalid funding item' using errcode='22023'; end if;
  if not exists(select 1 from public.opportunity_sources where id=item->>'source' and status<>'paused') then
   raise exception 'Funding source is not processable' using errcode='22023'; end if;
  if char_length(item->>'external_id')>500 or jsonb_typeof(item->'raw') is distinct from 'object'
   or item->>'url' is null or item->>'source_url' is null then raise exception 'Invalid funding provenance' using errcode='22023'; end if;
  d:=jsonb_populate_record(null::public.funding_details,item);
  -- A caller-supplied hash is never trusted. Raw audit bodies and derived temporal status are not factual revisions.
  item_hash:=encode(sha256(convert_to((item-'content_hash'-'raw'-'status')::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('nexolab:opportunity:'||(item->>'source')||':'||(item->>'external_id'),0));
  select * into o from public.opportunities where source_id=item->>'source' and external_id=item->>'external_id' for update;
  if not found then outcome:='created'; next_version:=1;
  else
   if o.opportunity_type<>'research_funding' then raise exception 'Opportunity identity belongs to another catalog type' using errcode='22023'; end if;
   if o.content_hash=item_hash then outcome:='unchanged'; next_version:=o.content_version;
   else outcome:='updated'; next_version:=o.content_version+1; end if;
  end if;
  insert into public.opportunities(source_id,external_id,opportunity_type,title,provider,summary,official_url,bases_url,
   opens_at,official_deadline_at,internal_deadline_at,status,checked_at,content_hash,content_version,provenance)
  values(item->>'source',item->>'external_id','research_funding',item->>'title',item->>'funder_name',coalesce(item->>'summary',''),
   item->>'url',item->>'bases_url',(item->>'opens_at')::timestamptz,(item->>'deadline_at')::timestamptz,
   (item->>'internal_deadline_at')::timestamptz,item->>'status',now(),item_hash,next_version,
   jsonb_build_object('source_url',item->>'source_url','parser_version','judy-1'))
  on conflict(source_id,external_id) do update set title=excluded.title,provider=excluded.provider,summary=excluded.summary,
   official_url=excluded.official_url,bases_url=excluded.bases_url,opens_at=excluded.opens_at,official_deadline_at=excluded.official_deadline_at,
   internal_deadline_at=excluded.internal_deadline_at,status=excluded.status,checked_at=excluded.checked_at,
   content_hash=excluded.content_hash,content_version=excluded.content_version,provenance=excluded.provenance,updated_at=now()
  returning * into o;
  insert into public.funding_details(opportunity_id,funder_type,source_url,programme,call_identifier,instrument,scope,regions,
   eligible_beneficiaries,beneficiary_notes,currency,total_budget,min_amount,max_amount,expected_grants,deadline_text,keywords,language,raw)
  values(o.id,d.funder_type,d.source_url,d.programme,d.call_identifier,d.instrument,d.scope,coalesce(d.regions,'{}'),
   coalesce(d.eligible_beneficiaries,'{}'),coalesce(d.beneficiary_notes,''),d.currency,d.total_budget,d.min_amount,d.max_amount,
   d.expected_grants,d.deadline_text,coalesce(d.keywords,'{}'),coalesce(d.language,'es'),d.raw)
  on conflict(opportunity_id) do update set funder_type=excluded.funder_type,source_url=excluded.source_url,programme=excluded.programme,
   call_identifier=excluded.call_identifier,instrument=excluded.instrument,scope=excluded.scope,regions=excluded.regions,
   eligible_beneficiaries=excluded.eligible_beneficiaries,beneficiary_notes=excluded.beneficiary_notes,currency=excluded.currency,
   total_budget=excluded.total_budget,min_amount=excluded.min_amount,max_amount=excluded.max_amount,expected_grants=excluded.expected_grants,
   deadline_text=excluded.deadline_text,keywords=excluded.keywords,language=excluded.language,raw=excluded.raw,updated_at=now();
  if outcome<>'unchanged' then insert into public.opportunity_versions(opportunity_id,version,content_hash,snapshot,checked_at)
   values(o.id,next_version,item_hash,item-'content_hash',now()); end if;
  n_created:=n_created+(outcome='created')::integer; n_updated:=n_updated+(outcome='updated')::integer;
  n_unchanged:=n_unchanged+(outcome='unchanged')::integer;
 end loop;
 insert into public.judy_run_batches(run_id,batch_key,payload_hash,created_count,updated_count,unchanged_count)
 values(p_run_id,p_batch_key,batch_hash,n_created,n_updated,n_unchanged);
 update public.judy_runs set created_count=created_count+n_created,updated_count=updated_count+n_updated,
 unchanged_count=unchanged_count+n_unchanged,lease_until=clock_timestamp()+interval '10 minutes' where id=p_run_id;
 return jsonb_build_object('created',n_created,'updated',n_updated,'unchanged',n_unchanged,'reused',false);
end; $$;
create function private.judy_finish_run(p_run_id uuid,p_lease_token uuid,p_report jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.judy_runs; source_name text; source_stats jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into r from public.judy_runs where id=p_run_id for update;
 if not found or r.lease_token is distinct from p_lease_token then raise exception 'Run lease is not active' using errcode='22023'; end if;
 if r.status<>'running' then return private.judy_summary(r); end if;
 if r.lease_until<clock_timestamp() then raise exception 'Run lease is not active' using errcode='22023'; end if;
 if jsonb_typeof(p_report) is distinct from 'object' or jsonb_typeof(p_report->'stats') is distinct from 'object'
 or jsonb_typeof(p_report->'errors') is distinct from 'array' or jsonb_typeof(p_report->'skipped') is distinct from 'array'
 or octet_length(p_report::text)>1048576 then raise exception 'Invalid run report' using errcode='22023'; end if;
 for source_name,source_stats in select key,value from jsonb_each(p_report->'stats') loop
  if source_name not in ('bdns','eu_funding_tenders','ucm_otri','private_web') or jsonb_typeof(source_stats) is distinct from 'object'
  or coalesce(source_stats->>'errors','') !~ '^\d+$' then raise exception 'Invalid source report' using errcode='22023'; end if;
  update public.opportunity_sources set last_reviewed_at=now(),updated_at=now(),
   status=case when (source_stats->>'errors')::integer>0 then 'pending_review' else 'active' end
   where id=source_name and status<>'paused';
 end loop;
 update public.judy_runs set status=case when jsonb_array_length(p_report->'errors')>0
   or exists(select 1 from jsonb_each(p_report->'stats') s where (s.value->>'errors')::integer>0)
   then case when created_count+updated_count+unchanged_count>0 then 'partial' else 'failed' end else 'completed' end,
   stats=p_report->'stats',errors=p_report->'errors',skipped=p_report->'skipped',finished_at=now()
 where id=p_run_id returning * into r;
 return private.judy_summary(r);
end; $$;
create function public.judy_begin_run(p_request_id text,p_trigger text,p_parameters jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.judy_begin_run(p_request_id,p_trigger,p_parameters); $$;
create function public.judy_get_run(p_request_id text) returns jsonb language sql security invoker set search_path='' as $$ select private.judy_get_run(p_request_id); $$;
create function public.judy_renew_run(p_run_id uuid,p_lease_token uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.judy_renew_run(p_run_id,p_lease_token); $$;
create function public.judy_upsert_opportunities(p_run_id uuid,p_lease_token uuid,p_batch_key text,p_items jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.judy_upsert_opportunities(p_run_id,p_lease_token,p_batch_key,p_items); $$;
create function public.judy_finish_run(p_run_id uuid,p_lease_token uuid,p_report jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.judy_finish_run(p_run_id,p_lease_token,p_report); $$;
revoke all on function private.judy_summary(public.judy_runs),private.judy_begin_run(text,text,jsonb),private.judy_get_run(text),private.judy_renew_run(uuid,uuid),private.judy_upsert_opportunities(uuid,uuid,text,jsonb),private.judy_finish_run(uuid,uuid,jsonb),public.judy_begin_run(text,text,jsonb),public.judy_get_run(text),public.judy_renew_run(uuid,uuid),public.judy_upsert_opportunities(uuid,uuid,text,jsonb),public.judy_finish_run(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.judy_summary(public.judy_runs),private.judy_begin_run(text,text,jsonb),private.judy_get_run(text),private.judy_renew_run(uuid,uuid),private.judy_upsert_opportunities(uuid,uuid,text,jsonb),private.judy_finish_run(uuid,uuid,jsonb),public.judy_begin_run(text,text,jsonb),public.judy_get_run(text),public.judy_renew_run(uuid,uuid),public.judy_upsert_opportunities(uuid,uuid,text,jsonb),public.judy_finish_run(uuid,uuid,jsonb) to service_role;

-- Supabase may install this event-trigger helper with PUBLIC execute. Keep the trigger, revoke API reachability.
do $$ begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname='rls_auto_enable' and p.pronargs=0 and p.prorettype='event_trigger'::regtype) then
  execute 'revoke execute on function public.rls_auto_enable() from public,anon,authenticated';
 end if;
end; $$;

-- Lock source accounting and finalization on the same run row; serialize absent catalog identities.
create or replace function private.raul_upsert_opportunity(p_run_id uuid,p_source_id text,p_external_id text,p_data jsonb,
  p_duration_ms integer,p_credits_estimated numeric,p_credits_measured numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.raul_runs; v_row public.opportunities; v_detail jsonb;
  v_hash text; v_result text; v_version integer; v_req jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_run from public.raul_runs where id=p_run_id for update;
  if not found or v_run.status<>'running' or v_run.lease_until<clock_timestamp() then
    raise exception 'Run is not active' using errcode='22023';
  end if;
  if not exists(select 1 from public.opportunity_sources where id=p_source_id and status in ('active','pending_review')) then
    raise exception 'Source is not processable' using errcode='22023';
  end if;
  if p_duration_ms is null or p_duration_ms<0 or p_credits_estimated is null
    or p_credits_estimated<0 or p_credits_estimated>5
    or (p_credits_measured is not null and (p_credits_measured<0 or p_credits_measured>5)) then
    raise exception 'Invalid source accounting' using errcode='22023';
  end if;
  if p_external_id is null or char_length(btrim(p_external_id)) not between 1 and 500
    or jsonb_typeof(p_data) is distinct from 'object' or p_data->>'status' is distinct from 'open'
    or coalesce(p_data->>'opportunity_type','') not in ('scholarship','research_internship','fellowship')
    or coalesce(p_data->>'official_url','') !~ '^https://'
    or nullif(p_data->>'official_deadline_date','') is null
    or nullif(p_data->>'checked_at','') is null then
    raise exception 'Invalid opportunity payload' using errcode='22023';
  end if;
  v_detail:=p_data->'scholarship_details';
  if jsonb_typeof(v_detail) is distinct from 'object' or jsonb_typeof(v_detail->'requirements') is distinct from 'array' then
    raise exception 'Invalid scholarship details' using errcode='22023';
  end if;
  for v_req in select value from jsonb_array_elements(v_detail->'requirements') loop
    if jsonb_typeof(v_req)<>'object' or coalesce(v_req->>'state','') not in ('confirmed','unknown')
      or nullif(v_req->>'key','') is null or nullif(v_req->>'label','') is null
      or not (v_req ? 'value')
      or (v_req->>'state'='unknown' and v_req->'value' is distinct from 'null'::jsonb)
      or (v_req->>'state'='confirmed' and v_req->'value'='null'::jsonb)
      or (v_req->>'state'='confirmed' and coalesce(v_req->>'source_url','') !~ '^https://') then
      raise exception 'Invalid requirement provenance or state' using errcode='22023';
    end if;
  end loop;
  if jsonb_typeof(p_data->'provenance') is distinct from 'object'
    or coalesce(p_data->'provenance'->>'source_url','') !~ '^https://'
    or nullif(p_data->'provenance'->>'parser_version','') is null then
    raise exception 'Invalid provenance' using errcode='22023';
  end if;
  -- Hash canonical facts, excluding checked_at: a recheck does not create a new version.
  v_hash:=encode(sha256(convert_to((p_data - 'checked_at')::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('nexolab:opportunity:'||p_source_id||':'||p_external_id,0));
  select * into v_row from public.opportunities where source_id=p_source_id and external_id=p_external_id for update;
  if found and v_row.opportunity_type='research_funding' then raise exception 'Opportunity identity belongs to funding' using errcode='22023'; end if;
  if not found then v_result:='created'; v_version:=1;
  elsif v_row.content_hash=v_hash then v_result:='unchanged'; v_version:=v_row.content_version;
  else v_result:='updated'; v_version:=v_row.content_version+1;
  end if;
  insert into public.opportunities(source_id,external_id,opportunity_type,title,provider,summary,
    official_url,application_url,bases_url,country,opens_at,official_deadline_date,official_deadline_at,internal_deadline_at,
    status,checked_at,content_hash,content_version,provenance)
  values(p_source_id,p_external_id,p_data->>'opportunity_type',p_data->>'title',p_data->>'provider',
    coalesce(p_data->>'summary',''),p_data->>'official_url',p_data->>'application_url',p_data->>'bases_url',
    p_data->>'country',(p_data->>'opens_at')::timestamptz,(p_data->>'official_deadline_date')::date,
    (p_data->>'official_deadline_at')::timestamptz,
    (p_data->>'internal_deadline_at')::timestamptz,'open',(p_data->>'checked_at')::timestamptz,
    v_hash,v_version,p_data->'provenance')
  on conflict(source_id,external_id) do update set
    opportunity_type=excluded.opportunity_type,title=excluded.title,provider=excluded.provider,
    summary=excluded.summary,official_url=excluded.official_url,application_url=excluded.application_url,
    bases_url=excluded.bases_url,country=excluded.country,opens_at=excluded.opens_at,
    official_deadline_date=excluded.official_deadline_date,official_deadline_at=excluded.official_deadline_at,
    internal_deadline_at=excluded.internal_deadline_at,
    status=excluded.status,checked_at=excluded.checked_at,content_hash=excluded.content_hash,
    content_version=excluded.content_version,provenance=excluded.provenance,updated_at=now()
  returning * into v_row;
  insert into public.scholarship_details(opportunity_id,academic_stages,degree_areas,
    residence_requirement,amount,requirements,missing_information)
  values(v_row.id,coalesce(array(select jsonb_array_elements_text(v_detail->'academic_stages')),'{}'),
    coalesce(array(select jsonb_array_elements_text(v_detail->'degree_areas')),'{}'),
    coalesce(v_detail->'residence_requirement','{"state":"unknown","value":null}'::jsonb),
    coalesce(v_detail->'amount','{"state":"unknown","value":null}'::jsonb),v_detail->'requirements',
    coalesce(array(select jsonb_array_elements_text(v_detail->'missing_information')),'{}'))
  on conflict(opportunity_id) do update set academic_stages=excluded.academic_stages,
    degree_areas=excluded.degree_areas,residence_requirement=excluded.residence_requirement,
    amount=excluded.amount,requirements=excluded.requirements,
    missing_information=excluded.missing_information,updated_at=now();
  if v_result<>'unchanged' then
    insert into public.opportunity_versions(opportunity_id,version,content_hash,snapshot,checked_at)
      values(v_row.id,v_version,v_hash,p_data,(p_data->>'checked_at')::timestamptz);
  end if;
  -- Catalog write, version and source accounting commit or roll back together.
  insert into public.raul_source_runs(run_id,source_id,status,created_count,updated_count,
    unchanged_count,discarded_count,credits_estimated,credits_measured,duration_ms)
  values(p_run_id,p_source_id,'completed',(v_result='created')::integer,
    (v_result='updated')::integer,(v_result='unchanged')::integer,0,
    p_credits_estimated,p_credits_measured,p_duration_ms);
  update public.opportunity_sources set last_reviewed_at=now(),status='active',updated_at=now()
    where id=p_source_id;
  return jsonb_build_object('opportunity_id',v_row.id,'result',v_result,'content_version',v_version);
end;
$$;

create or replace function private.raul_record_source_result(p_run_id uuid,p_source_id text,p_status text,
  p_created integer,p_updated integer,p_unchanged integer,p_discarded integer,
  p_error_code text,p_credits_estimated numeric,p_credits_measured numeric,p_duration_ms integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_run public.raul_runs;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_run from public.raul_runs where id=p_run_id for update;
  if not found or v_run.status<>'running' or v_run.lease_until<clock_timestamp() then
    raise exception 'Run is not active' using errcode='22023';
  end if;
  insert into public.raul_source_runs(run_id,source_id,status,created_count,updated_count,
    unchanged_count,discarded_count,error_code,credits_estimated,credits_measured,duration_ms)
  values(p_run_id,p_source_id,p_status,p_created,p_updated,p_unchanged,p_discarded,
    p_error_code,p_credits_estimated,p_credits_measured,p_duration_ms);
  update public.opportunity_sources set last_reviewed_at=now(),
    status=case when p_status='failed' then 'pending_review'
      when p_status='completed' then 'active' else status end,updated_at=now()
    where id=p_source_id;
  if p_status='failed' then
    -- A failed extraction cannot certify the previously published facts.
    update public.opportunities set status='pending_review',updated_at=now()
      where source_id=p_source_id and status='open';
  end if;
end;
$$;

create function private.raul_expire_run(p_run_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.raul_runs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into r from public.raul_runs where id=p_run_id for update;
 if not found then return null; end if;
 if r.status='running' and r.lease_until<clock_timestamp() then
  update public.raul_runs set status=case when exists(select 1 from public.raul_source_runs s where s.run_id=p_run_id and s.status='completed') then 'partial' else 'failed' end,
   finished_at=now(),duration_ms=greatest(0,(extract(epoch from now()-started_at)*1000)::integer),
   sources_reviewed=(select count(*) from public.raul_source_runs where run_id=p_run_id and status<>'skipped'),
   created_count=(select coalesce(sum(created_count),0) from public.raul_source_runs where run_id=p_run_id),
   updated_count=(select coalesce(sum(updated_count),0) from public.raul_source_runs where run_id=p_run_id),
   unchanged_count=(select coalesce(sum(unchanged_count),0) from public.raul_source_runs where run_id=p_run_id),
   discarded_count=(select coalesce(sum(discarded_count),0) from public.raul_source_runs where run_id=p_run_id),
   error_count=1+(select count(*) from public.raul_source_runs where run_id=p_run_id and status='failed'),
   credits_estimated=(select coalesce(sum(credits_estimated),0) from public.raul_source_runs where run_id=p_run_id),
   credits_measured=(select sum(credits_measured) from public.raul_source_runs where run_id=p_run_id),
   error_codes=(select coalesce(array_agg(error_code) filter(where error_code is not null),'{}')||array['LEASE_EXPIRED'] from public.raul_source_runs where run_id=p_run_id) where id=p_run_id returning * into r;
 end if;
 return to_jsonb(r);
end; $$;
create function private.raul_fail_run(p_run_id uuid,p_error_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.raul_runs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_error_code is null or p_error_code !~ '^[A-Z0-9_]{1,80}$' then raise exception 'Invalid error code' using errcode='22023'; end if;
 select * into r from public.raul_runs where id=p_run_id for update;
 if not found or r.status<>'running' or r.lease_until<clock_timestamp() then raise exception 'Run is not active' using errcode='22023'; end if;
 perform private.raul_finish_run(p_run_id,case when exists(select 1 from public.raul_source_runs where run_id=p_run_id and status='completed') then 'partial' else 'failed' end);
 update public.raul_runs set error_codes=array_append(error_codes,p_error_code),error_count=error_count+1 where id=p_run_id returning * into r;
 return to_jsonb(r);
end; $$;
create function public.raul_expire_run(p_run_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.raul_expire_run(p_run_id); $$;
create function public.raul_fail_run(p_run_id uuid,p_error_code text) returns jsonb language sql security invoker set search_path='' as $$ select private.raul_fail_run(p_run_id,p_error_code); $$;
revoke all on function private.raul_expire_run(uuid),private.raul_fail_run(uuid,text),public.raul_expire_run(uuid),public.raul_fail_run(uuid,text) from public,anon,authenticated;
grant execute on function private.raul_expire_run(uuid),private.raul_fail_run(uuid,text),public.raul_expire_run(uuid),public.raul_fail_run(uuid,text) to service_role;

create or replace function private.raul_begin_run(p_request_key text,p_mode text,p_max_sources integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.raul_runs;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_request_key is null or char_length(p_request_key) not between 8 and 160
    or p_mode <> 'incremental' or p_max_sources not between 1 and 5 then
    raise exception 'Invalid run request' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nexolab:raul:run',0));
  perform private.raul_expire_run(id) from public.raul_runs where status='running' and lease_until<clock_timestamp();
  select * into v_run from public.raul_runs where request_key=p_request_key;
  if found then
    if v_run.mode<>p_mode or v_run.max_sources<>p_max_sources then
      raise exception 'Request key reused with different parameters' using errcode='22023';
    end if;
    return jsonb_build_object('run_id',v_run.id,'status',v_run.status,'reused',true);
  end if;
  if exists(select 1 from public.raul_runs where status='running') then
    raise exception 'RAUL_BUSY' using errcode='55P03';
  end if;
  insert into public.raul_runs(request_key,mode,max_sources) values(p_request_key,p_mode,p_max_sources)
    returning * into v_run;
  return jsonb_build_object('run_id',v_run.id,'status',v_run.status,'reused',false);
end;
$$;


-- Finalization shares the ingestion/accounting lock before reading source counters.
create or replace function private.raul_finish_run(p_run_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.raul_runs;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_status is null or p_status not in ('completed','partial','failed') then raise exception 'Invalid status' using errcode='22023'; end if;
  -- Acquire the run lock before taking the aggregate statement snapshot. A finish
  -- waiting behind ingestion must include its committed source rows.
  select * into v_run from public.raul_runs where id=p_run_id for update;
  if not found or v_run.status<>'running' or v_run.lease_until<clock_timestamp() then
    raise exception 'Run is not active' using errcode='22023';
  end if;
  update public.raul_runs set status=p_status,finished_at=now(),
    duration_ms=greatest(0,(extract(epoch from now()-started_at)*1000)::integer),
    sources_reviewed=(select count(*) from public.raul_source_runs where run_id=p_run_id and status<>'skipped'),
    created_count=(select coalesce(sum(created_count),0) from public.raul_source_runs where run_id=p_run_id),
    updated_count=(select coalesce(sum(updated_count),0) from public.raul_source_runs where run_id=p_run_id),
    unchanged_count=(select coalesce(sum(unchanged_count),0) from public.raul_source_runs where run_id=p_run_id),
    discarded_count=(select coalesce(sum(discarded_count),0) from public.raul_source_runs where run_id=p_run_id),
    error_count=(select count(*) from public.raul_source_runs where run_id=p_run_id and status='failed'),
    credits_estimated=(select coalesce(sum(credits_estimated),0) from public.raul_source_runs where run_id=p_run_id),
    credits_measured=(select sum(credits_measured) from public.raul_source_runs where run_id=p_run_id),
    error_codes=(select coalesce(array_agg(error_code) filter(where error_code is not null),'{}')
      from public.raul_source_runs where run_id=p_run_id)
  where id=p_run_id returning * into v_run;
  if not found then raise exception 'Run is not active' using errcode='22023'; end if;
  return jsonb_build_object('run_id',v_run.id,'status',v_run.status,
    'sources_reviewed',v_run.sources_reviewed,'created',v_run.created_count,
    'updated',v_run.updated_count,'unchanged',v_run.unchanged_count,
    'discarded',v_run.discarded_count,'errors',v_run.error_count,
    'duration_ms',v_run.duration_ms,'credits_estimated',v_run.credits_estimated,
    'credits_measured',v_run.credits_measured);
end;
$$;

