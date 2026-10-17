-- Raúl: shared opportunity facts, scholarship-specific eligibility and auditable runs.
-- Created as an additive migration; Judy can reuse opportunities without scholarship_details.
create table public.opportunity_sources (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{2,79}$'),
  name text not null check (char_length(btrim(name)) between 3 and 160),
  official_url text not null check (official_url ~ '^https://'),
  terms_url text not null check (terms_url ~ '^https://'),
  ingestion_method text not null check (ingestion_method in ('api','firecrawl')),
  frequency_hours integer not null check (frequency_hours between 1 and 8760),
  credits_per_check numeric(8,2) not null default 0 check (credits_per_check between 0 and 5),
  last_reviewed_at timestamptz,
  status text not null check (status in ('active','planned','pending_review','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Source configuration must exist after migration in production; demo listings
-- themselves remain local seed fixtures. Planned APIs do not incur fetch cost.
insert into public.opportunity_sources
  (id,name,official_url,terms_url,ingestion_method,frequency_hours,credits_per_check,last_reviewed_at,status)
values
  ('imdea_energy_2027','IMDEA Energy 2027 internships',
   'https://energia.imdea.org/en/imdea-energy-launches-30-internships-for-bachelors-and-masters-students-in-2027/',
   'https://energia.imdea.org/en/legal-notice-and-terms-of-use/','firecrawl',24,1,'2026-10-17 12:00+00','active'),
  ('upm_metrologia_2026','UPM metrology and data scholarship',
   'https://minasyenergia.upm.es/la-escuela/ultimas-noticias/noticias-estudiantes/noticias-becas-y-ayudas/beca-metrologia-y-analisis-de-datos-en-las-areas-de-volumen-y-temperatura',
   'https://www.upm.es/upm/webupm/avisolegal','firecrawl',12,1,'2026-10-17 12:00+00','active'),
  ('rtve_tfm_2026','RTVE Impulsa Visión TFM',
   'https://www.rtve.es/rtve/20261006/convocatoria-impulsa-vision-rtve-ayudas-investigacion-oficiales-tfm/17254848.shtml',
   'https://www.rtve.es/comunes/aviso_legal.html','firecrawl',24,1,'2026-10-17 12:00+00','active'),
  ('boe_sumario','BOE datos abiertos sumario',
   'https://www.boe.es/datosabiertos/api/api.php?lang=es',
   'https://www.boe.es/informacion/aviso_legal/index.php','api',24,0,null,'planned'),
  ('bdns','Base de Datos Nacional de Subvenciones',
   'https://www.infosubvenciones.es/bdnstrans/doc/swagger',
   'https://www.pap.hacienda.gob.es/bdnstrans/L120846/es/avisolegal','api',24,0,null,'planned');

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.opportunity_sources(id) on delete restrict,
  external_id text not null check (char_length(btrim(external_id)) between 1 and 500),
  opportunity_type text not null check (opportunity_type in ('scholarship','research_internship','fellowship','research_funding')),
  title text not null check (char_length(btrim(title)) between 3 and 300),
  provider text not null check (char_length(btrim(provider)) between 2 and 200),
  summary text not null default '' check (char_length(summary) <= 2000),
  official_url text not null check (official_url ~ '^https://'),
  application_url text check (application_url is null or application_url ~ '^https://'),
  bases_url text check (bases_url is null or bases_url ~ '^https://'),
  country text,
  opens_at timestamptz,
  official_deadline_date date,
  official_deadline_at timestamptz,
  internal_deadline_at timestamptz,
  status text not null check (status in ('open','closed','unknown','pending_review')),
  checked_at timestamptz not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  content_version integer not null default 1 check (content_version > 0),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index opportunities_public_idx on public.opportunities(status,official_deadline_at,checked_at desc)
  where status='open';

-- Each requirement has {key,label,state,value,source_url}. State is
-- confirmed|incompatible|unknown; unknown must have a JSON null value.
-- Incompatibility is a profile comparison outcome; extraction stores only confirmed/unknown.
create table public.scholarship_details (
  opportunity_id uuid primary key references public.opportunities(id) on delete restrict,
  academic_stages text[] not null default '{}' check (
    cardinality(academic_stages) <= 10 and array_position(academic_stages,null) is null),
  degree_areas text[] not null default '{}' check (
    cardinality(degree_areas) <= 30 and array_position(degree_areas,null) is null),
  residence_requirement jsonb not null default '{"state":"unknown","value":null}'::jsonb,
  amount jsonb not null default '{"state":"unknown","value":null}'::jsonb,
  requirements jsonb not null default '[]'::jsonb,
  missing_information text[] not null default '{}' check (
    cardinality(missing_information) <= 30 and array_position(missing_information,null) is null),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(residence_requirement)='object' and coalesce(residence_requirement->>'state','') in ('confirmed','unknown')
    and residence_requirement ? 'value'),
  check (jsonb_typeof(amount)='object' and coalesce(amount->>'state','') in ('confirmed','unknown')
    and amount ? 'value'),
  check ((residence_requirement->>'state'<>'unknown' or residence_requirement->'value'='null'::jsonb)
    and (amount->>'state'<>'unknown' or amount->'value'='null'::jsonb)),
  check ((residence_requirement->>'state'<>'confirmed' or residence_requirement->'value'<>'null'::jsonb)
    and (amount->>'state'<>'confirmed' or amount->'value'<>'null'::jsonb)),
  check (jsonb_typeof(requirements)='array'
    and not jsonb_path_exists(requirements,'$[*] ? (@.state == "confirmed" && @.value == null)'))
);

create table public.opportunity_versions (
  opportunity_id uuid not null references public.opportunities(id) on delete restrict,
  version integer not null check (version > 0),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (opportunity_id,version)
);

create table public.raul_runs (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique check (char_length(request_key) between 8 and 160),
  mode text not null check (mode='incremental'),
  max_sources integer not null check (max_sources between 1 and 5),
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  sources_reviewed integer not null default 0 check (sources_reviewed >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  discarded_count integer not null default 0 check (discarded_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  credits_estimated numeric(8,2) not null default 0 check (credits_estimated between 0 and 5),
  credits_measured numeric(8,2) check (credits_measured between 0 and 5),
  duration_ms integer check (duration_ms >= 0),
  error_codes text[] not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  lease_until timestamptz not null default (now()+interval '2 minutes'),
  check ((status='running' and finished_at is null) or (status<>'running' and finished_at is not null))
);
create unique index raul_one_active_run_idx on public.raul_runs ((true)) where status='running';

create table public.raul_source_runs (
  run_id uuid not null references public.raul_runs(id) on delete restrict,
  source_id text not null references public.opportunity_sources(id) on delete restrict,
  status text not null check (status in ('completed','failed','skipped')),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  discarded_count integer not null default 0 check (discarded_count >= 0),
  error_code text,
  credits_estimated numeric(8,2) not null default 0,
  credits_measured numeric(8,2),
  duration_ms integer not null check (duration_ms >= 0),
  recorded_at timestamptz not null default now(),
  primary key (run_id,source_id)
);

alter table public.opportunity_sources enable row level security;
alter table public.opportunities enable row level security;
alter table public.scholarship_details enable row level security;
alter table public.opportunity_versions enable row level security;
alter table public.raul_runs enable row level security;
alter table public.raul_source_runs enable row level security;
revoke all on public.opportunity_sources, public.opportunities, public.scholarship_details,
  public.opportunity_versions, public.raul_runs, public.raul_source_runs from public,anon,authenticated;
grant select on public.opportunity_sources, public.opportunities, public.scholarship_details to authenticated;
grant all on public.opportunity_sources, public.opportunities, public.scholarship_details,
  public.opportunity_versions, public.raul_runs, public.raul_source_runs to service_role;
create policy opportunity_sources_public_read on public.opportunity_sources for select to authenticated
  using (status='active');
create policy opportunities_public_read on public.opportunities for select to authenticated
  using (status='open' and checked_at is not null
    and (official_deadline_date is null or official_deadline_date >= current_date)
    and (official_deadline_at is null or official_deadline_at >= now()));
create policy scholarship_details_public_read on public.scholarship_details for select to authenticated
  using (exists (select 1 from public.opportunities o where o.id=opportunity_id));

-- The service key is backend-only. Explicit auth.role guard prevents accidentally
-- exposing a privileged RPC even if a broad grant is introduced later.
create function private.raul_begin_run(p_request_key text,p_mode text,p_max_sources integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.raul_runs;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_request_key is null or char_length(p_request_key) not between 8 and 160
    or p_mode <> 'incremental' or p_max_sources not between 1 and 5 then
    raise exception 'Invalid run request' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nexolab:raul:run',0));
  update public.raul_runs set status='failed',finished_at=now(),duration_ms=
    greatest(0,(extract(epoch from now()-started_at)*1000)::integer),
    error_codes=array_append(error_codes,'LEASE_EXPIRED')
    where status='running' and lease_until<now();
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

create function private.raul_upsert_opportunity(p_run_id uuid,p_source_id text,p_external_id text,p_data jsonb,
  p_duration_ms integer,p_credits_estimated numeric,p_credits_measured numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.raul_runs; v_row public.opportunities; v_detail jsonb;
  v_hash text; v_result text; v_version integer; v_req jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_run from public.raul_runs where id=p_run_id for update;
  if not found or v_run.status<>'running' or v_run.lease_until<now() then
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
    or jsonb_typeof(p_data)<>'object' or p_data->>'status'<>'open'
    or p_data->>'opportunity_type' not in ('scholarship','research_internship','fellowship')
    or p_data->>'official_url' !~ '^https://'
    or nullif(p_data->>'official_deadline_date','') is null then
    raise exception 'Invalid opportunity payload' using errcode='22023';
  end if;
  v_detail:=p_data->'scholarship_details';
  if jsonb_typeof(v_detail)<>'object' or jsonb_typeof(v_detail->'requirements')<>'array' then
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
  if jsonb_typeof(p_data->'provenance')<>'object'
    or coalesce(p_data->'provenance'->>'source_url','') !~ '^https://'
    or nullif(p_data->'provenance'->>'parser_version','') is null then
    raise exception 'Invalid provenance' using errcode='22023';
  end if;
  -- Hash canonical facts, excluding checked_at: a recheck does not create a new version.
  v_hash:=encode(sha256(convert_to((p_data - 'checked_at')::text,'UTF8')),'hex');
  select * into v_row from public.opportunities where source_id=p_source_id and external_id=p_external_id for update;
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

create function private.raul_record_source_result(p_run_id uuid,p_source_id text,p_status text,
  p_created integer,p_updated integer,p_unchanged integer,p_discarded integer,
  p_error_code text,p_credits_estimated numeric,p_credits_measured numeric,p_duration_ms integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.raul_runs where id=p_run_id and status='running' and lease_until>=now()) then
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

create function private.raul_finish_run(p_run_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.raul_runs;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_status not in ('completed','partial','failed') then raise exception 'Invalid status' using errcode='22023'; end if;
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
  where id=p_run_id and status='running' and lease_until>=now() returning * into v_run;
  if not found then raise exception 'Run is not active' using errcode='22023'; end if;
  return jsonb_build_object('run_id',v_run.id,'status',v_run.status,
    'sources_reviewed',v_run.sources_reviewed,'created',v_run.created_count,
    'updated',v_run.updated_count,'unchanged',v_run.unchanged_count,
    'discarded',v_run.discarded_count,'errors',v_run.error_count,
    'duration_ms',v_run.duration_ms,'credits_estimated',v_run.credits_estimated,
    'credits_measured',v_run.credits_measured);
end;
$$;

create function public.raul_begin_run(p_request_key text,p_mode text,p_max_sources integer)
returns jsonb language sql security invoker set search_path='' as $$
  select private.raul_begin_run(p_request_key,p_mode,p_max_sources);
$$;
create function public.raul_upsert_opportunity(p_run_id uuid,p_source_id text,p_external_id text,p_data jsonb,
  p_duration_ms integer,p_credits_estimated numeric,p_credits_measured numeric)
returns jsonb language sql security invoker set search_path='' as $$
  select private.raul_upsert_opportunity(p_run_id,p_source_id,p_external_id,p_data,
    p_duration_ms,p_credits_estimated,p_credits_measured);
$$;
create function public.raul_record_source_result(p_run_id uuid,p_source_id text,p_status text,
  p_created integer,p_updated integer,p_unchanged integer,p_discarded integer,
  p_error_code text,p_credits_estimated numeric,p_credits_measured numeric,p_duration_ms integer)
returns void language sql security invoker set search_path='' as $$
  select private.raul_record_source_result(p_run_id,p_source_id,p_status,p_created,p_updated,p_unchanged,
    p_discarded,p_error_code,p_credits_estimated,p_credits_measured,p_duration_ms);
$$;
create function public.raul_finish_run(p_run_id uuid,p_status text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.raul_finish_run(p_run_id,p_status);
$$;
revoke all on function
  private.raul_begin_run(text,text,integer),private.raul_upsert_opportunity(uuid,text,text,jsonb,integer,numeric,numeric),
  private.raul_record_source_result(uuid,text,text,integer,integer,integer,integer,text,numeric,numeric,integer),
  private.raul_finish_run(uuid,text),public.raul_begin_run(text,text,integer),
  public.raul_upsert_opportunity(uuid,text,text,jsonb,integer,numeric,numeric),
  public.raul_record_source_result(uuid,text,text,integer,integer,integer,integer,text,numeric,numeric,integer),
  public.raul_finish_run(uuid,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function
  private.raul_begin_run(text,text,integer),private.raul_upsert_opportunity(uuid,text,text,jsonb,integer,numeric,numeric),
  private.raul_record_source_result(uuid,text,text,integer,integer,integer,integer,text,numeric,numeric,integer),
  private.raul_finish_run(uuid,text),public.raul_begin_run(text,text,integer),
  public.raul_upsert_opportunity(uuid,text,text,jsonb,integer,numeric,numeric),
  public.raul_record_source_result(uuid,text,text,integer,integer,integer,integer,text,numeric,numeric,integer),
  public.raul_finish_run(uuid,text) to service_role;
