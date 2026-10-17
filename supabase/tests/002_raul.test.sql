begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select plan(20);

select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity),
  'all exposed tables use RLS');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef),
  'public Raul wrappers remain invoker functions');
select has_table('public','opportunities','shared opportunity catalog exists');
select has_table('public','scholarship_details','student-specific requirements are separate');
select has_table('public','opportunity_versions','content history exists');

insert into public.opportunity_sources(id,name,official_url,terms_url,ingestion_method,
  frequency_hours,credits_per_check,status)
values('raul_test_source','Raul test source','https://example.org/official',
  'https://example.org/terms','api',24,0,'active');
insert into public.opportunities(source_id,external_id,opportunity_type,title,provider,
  official_url,official_deadline_date,status,checked_at,content_hash,provenance)
values('raul_test_source','visible','scholarship','Visible test scholarship','Test provider',
  'https://example.org/visible',current_date+1,'open',now(),repeat('a',64),'{}'),
  ('raul_test_source','expired','scholarship','Expired test scholarship','Test provider',
  'https://example.org/expired',current_date-1,'open',now(),repeat('b',64),'{}');
select throws_ok($$insert into public.scholarship_details(opportunity_id,amount)
  values((select id from public.opportunities where external_id='visible'),
    '{"state":"confirmed","value":null}'::jsonb)$$,'23514',null,
  'confirmed amount cannot be null');

set local role anon;
select throws_ok($$select public.raul_begin_run('test-key-123','incremental',1)$$,
  '42501',null,'anonymous callers cannot trigger Raul');
select throws_ok($$select * from public.opportunities$$,
  '42501',null,'anonymous callers cannot read catalog');

set local role authenticated;
select is((select count(*)::integer from public.opportunities where source_id='raul_test_source'),1,
  'authenticated readers see only current verified opportunities');
select throws_ok($$update public.opportunities set title='forged' where source_id='raul_test_source'$$,
  '42501',null,'authenticated readers cannot change opportunity facts');
select throws_ok($$select public.raul_begin_run('test-key-123','incremental',1)$$,
  '42501',null,'authenticated callers cannot trigger Raul');

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.raul_payload',jsonb_build_object(
  'opportunity_type','scholarship','title','Scholarship from official source',
  'provider','Test provider','summary','Short factual summary',
  'official_url','https://example.org/official','application_url',null,'bases_url',null,
  'country',null,'opens_at',null,'official_deadline_date',(current_date+2)::text,
  'official_deadline_at',null,'internal_deadline_at',null,'status','open',
  'checked_at',now()::text,
  'provenance',jsonb_build_object('source_url','https://example.org/official','parser_version','test-1'),
  'scholarship_details',jsonb_build_object('academic_stages',jsonb_build_array(),
    'degree_areas',jsonb_build_array(),'residence_requirement',jsonb_build_object('state','unknown','value',null),
    'amount',jsonb_build_object('state','unknown','value',null),'requirements',jsonb_build_array(),
    'missing_information',jsonb_build_array('academic stage')))::text,true);
select set_config('test.run1',(public.raul_begin_run('test-run-001','incremental',1)->>'run_id'),true);
select is((public.raul_begin_run('test-run-001','incremental',1)->>'reused')::boolean,true,
  'retry reuses run identity');
select throws_ok($$select public.raul_begin_run('test-run-002','incremental',1)$$,
  '55P03',null,'second active run is rejected');
select is((public.raul_upsert_opportunity(current_setting('test.run1')::uuid,'raul_test_source',
  'stable-id',current_setting('test.raul_payload')::jsonb,10,0,null)->>'result'),'created',
  'first ingest creates one opportunity');
select public.raul_finish_run(current_setting('test.run1')::uuid,'completed');

select set_config('test.run2',(public.raul_begin_run('test-run-002','incremental',1)->>'run_id'),true);
select is((public.raul_upsert_opportunity(current_setting('test.run2')::uuid,'raul_test_source',
  'stable-id',current_setting('test.raul_payload')::jsonb,10,0,null)->>'result'),'unchanged',
  'same facts do not make another version');
select public.raul_finish_run(current_setting('test.run2')::uuid,'completed');

select set_config('test.run3',(public.raul_begin_run('test-run-003','incremental',1)->>'run_id'),true);
select is((public.raul_upsert_opportunity(current_setting('test.run3')::uuid,'raul_test_source',
  'stable-id',jsonb_set(current_setting('test.raul_payload')::jsonb,'{official_deadline_date}',
    to_jsonb((current_date+3)::text)),10,0,null)->>'result'),'updated',
  'official deadline change updates the listing');
select is((select count(*)::integer from public.opportunities where source_id='raul_test_source'
  and external_id='stable-id'),1,'deadline update does not duplicate listing');
select is((select content_version from public.opportunities where source_id='raul_test_source'
  and external_id='stable-id'),2,'deadline update increments version');
select is((select count(*)::integer from public.opportunity_versions v
  join public.opportunities o on o.id=v.opportunity_id where o.source_id='raul_test_source'
  and o.external_id='stable-id'),2,'both factual versions are retained');
select throws_ok($$select public.raul_upsert_opportunity(current_setting('test.run3')::uuid,
  'raul_test_source','invalid-stage',
  jsonb_set(current_setting('test.raul_payload')::jsonb,'{scholarship_details,requirements}',
    '[{"key":"stage","label":"Stage","state":"confirmed","value":null,"source_url":"https://example.org/official"}]'::jsonb),
  10,0,null)$$,'22023',null,'confirmed requirement cannot be null');
select public.raul_finish_run(current_setting('test.run3')::uuid,'completed');

reset role;
select * from finish();
rollback;
