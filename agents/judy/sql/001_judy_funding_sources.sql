-- LEGACY REFERENCE ONLY. DO NOT APPLY. Use canonical supabase/migrations instead.
-- Judy · almacén de convocatorias de financiación (públicas y privadas) recopiladas por el agente.
-- Lectura pública de convocatorias; escritura solo con la clave de servicio a través de las funciones judy_*.

create table if not exists public.funding_opportunities (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('bdns','eu_funding_tenders','ucm_otri','private_web')),
  external_id text not null check (char_length(btrim(external_id)) between 1 and 200),
  funder_name text not null check (char_length(btrim(funder_name)) between 1 and 400),
  funder_type text not null check (funder_type in ('public','private')),
  title text not null check (char_length(btrim(title)) between 3 and 1000),
  summary text not null default '' check (char_length(summary) <= 20000),
  url text not null check (url ~ '^https://'),
  bases_url text check (bases_url is null or bases_url ~ '^https://'),
  source_url text not null check (source_url ~ '^https://'),
  programme text,
  call_identifier text,
  instrument text,
  scope text not null check (scope in ('local','regional','national','european','international')),
  regions text[] not null default '{}',
  eligible_beneficiaries text[] not null default '{}' check (eligible_beneficiaries <@
    array['university','research_center','hospital','company','nonprofit','individual','public_body']::text[]),
  beneficiary_notes text not null default '' check (char_length(beneficiary_notes) <= 5000),
  currency text check (currency ~ '^[A-Z]{3}$'),
  total_budget numeric(16,2) check (total_budget >= 0),
  min_amount numeric(16,2) check (min_amount >= 0),
  max_amount numeric(16,2) check (max_amount >= 0),
  expected_grants integer check (expected_grants >= 0),
  opens_at timestamptz,
  deadline_at timestamptz,
  deadline_text text check (char_length(deadline_text) <= 1000),
  internal_deadline_at timestamptz,
  status text not null check (status in ('open','forthcoming','closed','unknown')),
  keywords text[] not null default '{}',
  language text not null default 'es',
  raw jsonb not null default '{}'::jsonb,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  unique (source, external_id),
  check ((total_budget is null and min_amount is null and max_amount is null) or currency is not null),
  check (min_amount is null or max_amount is null or min_amount <= max_amount)
);
create index if not exists funding_opportunities_deadline_idx on public.funding_opportunities(deadline_at);
create index if not exists funding_opportunities_seen_idx on public.funding_opportunities(last_seen_at desc);
create index if not exists funding_opportunities_text_idx on public.funding_opportunities
  using gin (to_tsvector('spanish', title || ' ' || summary));

create table if not exists public.judy_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cli','make','schedule','test')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  stats jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb
);

alter table public.funding_opportunities enable row level security;
alter table public.judy_runs enable row level security;
revoke all on public.funding_opportunities, public.judy_runs from public, anon, authenticated;
grant select on public.funding_opportunities to anon, authenticated;
drop policy if exists funding_opportunities_read on public.funding_opportunities;
create policy funding_opportunities_read on public.funding_opportunities for select to anon, authenticated using (true);

-- Vista para la app: estado recalculado en el momento de la consulta y solo convocatorias vistas en las últimas 2 semanas.
create or replace view public.funding_opportunities_live with (security_invoker = true) as
select o.*,
  case
    when o.deadline_at is not null and o.deadline_at < now() then 'closed'
    when o.opens_at is not null and o.opens_at > now() then 'forthcoming'
    when o.deadline_at is not null then 'open'
    when o.status = 'closed' then 'closed'
    else 'unknown'
  end as live_status
from public.funding_opportunities o
where o.last_seen_at > now() - interval '14 days';
grant select on public.funding_opportunities_live to anon, authenticated;

-- Alta/actualización idempotente por (source, external_id). Si el hash no cambia, solo se marca como visto.
create or replace function public.judy_upsert_opportunities(p_items jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_item jsonb;
  r public.funding_opportunities;
  v_hash text;
  v_created integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'p_items debe ser un array de hasta 500 convocatorias' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    r := jsonb_populate_record(null::public.funding_opportunities, v_item);
    select o.content_hash into v_hash from public.funding_opportunities o
      where o.source = r.source and o.external_id = r.external_id for update;
    if not found then
      insert into public.funding_opportunities(source, external_id, funder_name, funder_type, title, summary, url, bases_url,
        source_url, programme, call_identifier, instrument, scope, regions, eligible_beneficiaries, beneficiary_notes, currency,
        total_budget, min_amount, max_amount, expected_grants, opens_at, deadline_at, deadline_text, internal_deadline_at,
        status, keywords, language, raw, content_hash)
      values (r.source, r.external_id, r.funder_name, r.funder_type, r.title, coalesce(r.summary, ''), r.url, r.bases_url,
        r.source_url, r.programme, r.call_identifier, r.instrument, r.scope, coalesce(r.regions, '{}'),
        coalesce(r.eligible_beneficiaries, '{}'), coalesce(r.beneficiary_notes, ''), r.currency, r.total_budget, r.min_amount,
        r.max_amount, r.expected_grants, r.opens_at, r.deadline_at, r.deadline_text, r.internal_deadline_at, r.status,
        coalesce(r.keywords, '{}'), coalesce(r.language, 'es'), coalesce(r.raw, '{}'::jsonb), r.content_hash);
      v_created := v_created + 1;
    elsif v_hash = r.content_hash then
      update public.funding_opportunities set last_seen_at = now(), status = r.status
        where source = r.source and external_id = r.external_id;
      v_unchanged := v_unchanged + 1;
    else
      update public.funding_opportunities set funder_name = r.funder_name, funder_type = r.funder_type, title = r.title,
        summary = coalesce(r.summary, ''), url = r.url, bases_url = r.bases_url, source_url = r.source_url, programme = r.programme,
        call_identifier = r.call_identifier, instrument = r.instrument, scope = r.scope, regions = coalesce(r.regions, '{}'),
        eligible_beneficiaries = coalesce(r.eligible_beneficiaries, '{}'), beneficiary_notes = coalesce(r.beneficiary_notes, ''),
        currency = r.currency, total_budget = r.total_budget, min_amount = r.min_amount, max_amount = r.max_amount,
        expected_grants = r.expected_grants, opens_at = r.opens_at, deadline_at = r.deadline_at, deadline_text = r.deadline_text,
        internal_deadline_at = r.internal_deadline_at, status = r.status, keywords = coalesce(r.keywords, '{}'),
        language = coalesce(r.language, 'es'), raw = coalesce(r.raw, '{}'::jsonb), content_hash = r.content_hash,
        last_seen_at = now(), last_changed_at = now()
      where source = r.source and external_id = r.external_id;
      v_updated := v_updated + 1;
    end if;
  end loop;
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'unchanged', v_unchanged);
end;
$$;

create or replace function public.judy_record_run(p_run jsonb) returns uuid
language sql security invoker set search_path = '' as $$
  insert into public.judy_runs(trigger, started_at, finished_at, stats, errors)
  values (p_run->>'trigger', (p_run->>'started_at')::timestamptz, (p_run->>'finished_at')::timestamptz,
    coalesce(p_run->'stats', '{}'::jsonb), coalesce(p_run->'errors', '[]'::jsonb))
  returning id;
$$;

revoke all on function public.judy_upsert_opportunities(jsonb), public.judy_record_run(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on public.funding_opportunities, public.judy_runs to service_role';
    execute 'grant execute on function public.judy_upsert_opportunities(jsonb), public.judy_record_run(jsonb) to service_role';
  end if;
end;
$$;
