begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select plan(21);

insert into auth.users(id) values
 ('30000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002'),
 ('30000000-0000-0000-0000-000000000003');
insert into public.profiles(id,full_name) values
 ('30000000-0000-0000-0000-000000000001','Test owner'),
 ('30000000-0000-0000-0000-000000000002','Test applicant'),
 ('30000000-0000-0000-0000-000000000003','Test outsider');
insert into public.research_groups(id,owner_id,name,visibility,accepting_members) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Grupo Física','public',true);
insert into public.group_topics(group_id,topic_id) values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),9,'all nine public tables use RLS');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef),'public functions use SECURITY INVOKER');

set local role anon;
select is((select count(*)::integer from public.research_groups),1,'anon discovers public group');
select is((select count(*)::integer from public.profiles),0,'private profiles are hidden');
select throws_ok($$select public.request_to_join('40000000-0000-0000-0000-000000000001',null)$$,'42501',null,'anon cannot invoke mutation RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.discover_groups('', '10000000-0000-0000-0000-000000000001')),1,'discipline search returns matching group');
select lives_ok($$select public.request_to_join('40000000-0000-0000-0000-000000000001','Quiero colaborar')$$,'applicant can request');
select throws_ok($$select public.request_to_join('40000000-0000-0000-0000-000000000001',null)$$,'23505',null,'duplicate pending request rejected');
select throws_ok($$insert into public.group_memberships(group_id,user_id) values('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002')$$,'42501',null,'applicant cannot forge membership');
select set_config('test.request_id',(select id::text from public.group_join_requests limit 1),true);

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select is((select count(*)::integer from public.group_join_requests),0,'outsider cannot read requests');
select throws_ok($$select public.decide_join_request(current_setting('test.request_id')::uuid,'approved')$$,'42501',null,'outsider cannot approve a known request ID');
with changed as (update public.research_groups set name='Intrusión' returning id)
select is((select count(*)::integer from changed),0,'outsider cannot manage group');

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.request_to_join('40000000-0000-0000-0000-000000000001',null)$$,'23514',null,'owner cannot apply to own group');
select is((select count(*)::integer from public.group_join_requests),1,'owner sees request');
select lives_ok($$select public.decide_join_request((select id from public.group_join_requests limit 1),'approved')$$,'owner approves atomically');
select lives_ok($$select public.decide_join_request((select id from public.group_join_requests limit 1),'approved')$$,'same approval is idempotent');
select is((select count(*)::integer from public.group_memberships),1,'exactly one membership exists');
select lives_ok($$select public.save_research_project(null,'40000000-0000-0000-0000-000000000001','Proyecto privado','','draft',null,null,'private',array[]::uuid[])$$,'owner creates associated private project');

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select is((select count(*)::integer from public.research_projects),0,'outsider cannot read private project');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.research_projects),1,'accepted member can read private project');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select set_config('test.second_request_id',(public.request_to_join('40000000-0000-0000-0000-000000000001','Otra solicitud')).id::text,true);
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.decide_join_request(current_setting('test.second_request_id')::uuid,'approved')$$,'42501',null,'ordinary accepted member cannot approve a known request ID');

reset role;
select * from finish();
rollback;
