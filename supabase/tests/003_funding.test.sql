begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(18);
select has_table('public','funding_details','funding metadata is separate');
select ok(to_regclass('public.funding_opportunities') is null,'no duplicate legacy catalog');
select ok(not has_function_privilege('anon','public.judy_begin_run(text,text,jsonb)','execute'),'anonymous callers cannot trigger Judy');
select ok(not has_function_privilege('authenticated','public.judy_upsert_opportunities(uuid,uuid,text,jsonb)','execute'),'clients cannot ingest funding');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.prorettype<>'event_trigger'::regtype),'public RPCs remain invoker');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),'public tables have RLS');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.judy_run',public.judy_begin_run('pgtap-judy-0001','test','{}')::text,true);
select is((current_setting('test.judy_run')::jsonb->>'claimed')::boolean,true,'request claims one durable lease');
select ok(not (public.judy_begin_run('pgtap-judy-0001','test','{}') ? 'lease_token'),'retry does not expose lease or start twice');
select throws_ok($$select public.judy_begin_run('pgtap-judy-0002','test','{}')$$,'55P03','JUDY_BUSY','another request cannot overlap');
select set_config('test.judy_items',jsonb_build_array(jsonb_build_object(
 'source','bdns','external_id','pgtap-funding-1','funder_name','Research funder','funder_type','public',
 'title','Official funding call','summary','Factual summary','url','https://example.org/call',
 'source_url','https://example.org/source','programme','Programme one','scope','national',
 'currency','EUR','total_budget',123456.78,'deadline_at',(now()+interval '5 days')::text,
 'status','open','raw',jsonb_build_object('source_fact','preserved')))::text,true);
select is((public.judy_upsert_opportunities((current_setting('test.judy_run')::jsonb->>'run_id')::uuid,
 (current_setting('test.judy_run')::jsonb->>'lease_token')::uuid,'batch-0',current_setting('test.judy_items')::jsonb)->>'created')::integer,1,'batch creates canonical funding');
select is((public.judy_upsert_opportunities((current_setting('test.judy_run')::jsonb->>'run_id')::uuid,
 (current_setting('test.judy_run')::jsonb->>'lease_token')::uuid,'batch-0',current_setting('test.judy_items')::jsonb)->>'reused')::boolean,true,'batch retry is idempotent');
select throws_ok($$select public.judy_upsert_opportunities((current_setting('test.judy_run')::jsonb->>'run_id')::uuid,
 (current_setting('test.judy_run')::jsonb->>'lease_token')::uuid,'batch-0','[]')$$,'22023','Batch key reused with different data','batch identity is immutable');
select is((select content_version from public.opportunities where source_id='bdns' and external_id='pgtap-funding-1'),1,'one stable factual version');
select is((select d.raw->>'source_fact' from public.funding_details d join public.opportunities o on o.id=d.opportunity_id where o.external_id='pgtap-funding-1'),'preserved','source metadata is preserved');
select is((select count(*)::integer from public.scholarship_details d join public.opportunities o on o.id=d.opportunity_id where o.external_id='pgtap-funding-1'),0,'funding does not create scholarship eligibility');
select is(public.judy_finish_run((current_setting('test.judy_run')::jsonb->>'run_id')::uuid,
 (current_setting('test.judy_run')::jsonb->>'lease_token')::uuid,'{"stats":{"bdns":{"errors":0}},"errors":[],"skipped":[]}')->>'status','completed','run is durably completed');
select ok(not (public.judy_get_run('pgtap-judy-0001') ? 'lease_token'),'status does not expose ownership token');
set local role authenticated;
select is((select count(*)::integer from public.opportunities where source_id='bdns' and external_id='pgtap-funding-1'),1,'fresh active catalog is readable');
reset role;
select * from finish();
rollback;
