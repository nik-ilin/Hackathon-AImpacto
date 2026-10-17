import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const A = '20000000-0000-0000-0000-000000000001'
const B = '20000000-0000-0000-0000-000000000002'
const C = '20000000-0000-0000-0000-000000000003'
const TOPIC = '10000000-0000-0000-0000-000000000001'
let db: PGlite
async function as<T>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ''])
    return (await db.query<T>(sql, params)).rows
  } finally { await db.exec('reset role') }
}
async function group(owner=A, visibility='public', accepting=true) {
  const rows=await as<{ id:string }>(owner,"select public.save_research_group(null,'Grupo Física','Investigación','Universidad','España',$1,$2,array[$3::uuid]) id",[visibility,accepting,TOPIC])
  return rows[0].id
}
async function request(groupId: string, applicant=B) {
  const rows=await as<{ id:string }>(applicant,'select * from public.request_to_join($1,$2)',[groupId,'Quiero investigar'])
  return rows[0].id
}
beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`)
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'))
  }
  await db.query('insert into auth.users(id) values ($1),($2),($3)',[A,B,C])
  for(const [id,name] of [[A,'Ana'],[B,'Bruno'],[C,'Carla']]) {
    await as(id,"select public.upsert_profile($1,null,'Universidad','España','student','',array['SQL'],null,'private',array[$2::uuid])",[name,TOPIC])
  }
},30000)
afterAll(async()=>{await db?.close()})

describe('M1 actual PostgreSQL migrations, RLS and atomic collaboration (PGlite)',()=>{
  it('frontend optional null payloads save atomically without violating required columns',async()=>{
    await as(C,"select public.upsert_profile('Carla',null,null,null,null,null,array[]::text[],null,'private',array[]::uuid[])")
    const saved=await as<{institution:string;country:string;bio:string}>(C,'select institution,country,bio from public.profiles where id=$1',[C])
    expect(saved[0]).toEqual({institution:'',country:'',bio:''})
    const created=await as<{id:string}>(C,"select public.save_research_group(null,'Grupo',null,null,null,'private',false,array[]::uuid[]) id")
    expect((await as(C,'select * from public.research_groups where id=$1',[created[0].id])).length).toBe(1)
    await as(C,"select public.save_research_group($1,'Grupo actualizado',null,null,null,'private',false,array[]::uuid[])",[created[0].id])
    await as(C,"select public.save_research_project(null,$1,'Proyecto',null,'draft',null,null,'private',array[]::uuid[])",[created[0].id])
    await as(C,"select public.upsert_profile('Carla',null,'Universidad','España','student','',array['SQL'],null,'private',array[$1::uuid])",[TOPIC])
  })
  it('A-G and M-N: owner creates; outsider discovers by topic; requests; owner approves once; member sees group and private project',async()=>{
    const g=await group()
    const found=await as<{id:string;matched_topics:string[];match_count:number}>(B,'select * from public.discover_groups($1,$2,true,100,0)',['Física',TOPIC])
    expect(found.some(x=>x.id===g && x.matched_topics.includes('Física') && Number(x.match_count)===1)).toBe(true)
    const r=await request(g)
    expect((await as(A,'select * from public.group_join_requests where id=$1',[r])).length).toBe(1)
    await as(A,"select public.decide_join_request($1,'approved')",[r])
    await as(A,"select public.decide_join_request($1,'approved')",[r])
    expect((await as(B,'select * from public.group_memberships where group_id=$1 and user_id=$2',[g,B])).length).toBe(1)
    expect((await as(B,'select * from public.research_groups g where g.id=$1 and exists(select 1 from public.group_memberships m where m.group_id=g.id and m.user_id=$2)',[g,B])).length).toBe(1)
    const p=await as<{id:string}>(A,"select public.save_research_project(null,$1,'Proyecto','Descripción','draft',50,'EUR','private',array[$2::uuid]) id",[g,TOPIC])
    expect((await as(B,'select * from public.research_projects where id=$1',[p[0].id])).length).toBe(1)
    expect((await as(C,'select * from public.research_projects where id=$1',[p[0].id])).length).toBe(0)
  })
  it('H-I: outsiders cannot edit another group, create its projects, or approve requests',async()=>{
    const g=await group(); const r=await request(g)
    expect((await as(C,"update public.research_groups set name='Intrusión' where id=$1 returning id",[g])).length).toBe(0)
    await expect(as(C,"select public.decide_join_request($1,'approved')",[r])).rejects.toThrow('Not authorized')
    await expect(as(C,"select public.save_research_project(null,$1,'Intrusión','','draft',null,null,'public',array[]::uuid[])",[g])).rejects.toThrow()
  })
  it('J: owner cannot request own group and pending requests are unique',async()=>{
    const g=await group()
    await expect(request(g,A)).rejects.toThrow('Already belongs')
    await request(g)
    await expect(request(g)).rejects.toThrow('duplicate key')
  })
  it('accepted members cannot apply again and the owner is never duplicated in memberships',async()=>{
    const g=await group(); const r=await request(g)
    await as(A,"select public.decide_join_request($1,'approved')",[r])
    await expect(request(g)).rejects.toThrow('Already belongs')
    await expect(db.query('insert into public.group_memberships(group_id,user_id) values($1,$2)',[g,A])).rejects.toThrow('Owner cannot')
  })
  it('cancel/reject histories persist and a new request is allowed after each final decision',async()=>{
    const g=await group(); const r=await request(g)
    await expect(as(C,'select public.cancel_join_request($1)',[r])).rejects.toThrow('Not authorized')
    await as(B,'select public.cancel_join_request($1)',[r])
    await as(B,'select public.cancel_join_request($1)',[r])
    await expect(as(A,"select public.decide_join_request($1,'approved')",[r])).rejects.toThrow('already decided')
    const r2=await request(g)
    await as(A,"select public.decide_join_request($1,'rejected')",[r2])
    await expect(as(B,'select public.cancel_join_request($1)',[r2])).rejects.toThrow('already decided')
    await request(g)
    expect((await as(B,'select * from public.group_join_requests where group_id=$1',[g])).length).toBe(3)
  })
  it('private profiles and their topics are invisible; users may only edit their own profile',async()=>{
    expect((await as(C,'select * from public.profiles where id=$1',[A])).length).toBe(0)
    expect((await as(null,'select * from public.profile_topics where profile_id=$1',[A])).length).toBe(0)
    expect((await as(C,"update public.profiles set full_name='Otro' where id=$1 returning id",[A])).length).toBe(0)
    expect((await as(A,'select * from public.profiles where id=$1',[A])).length).toBe(1)
    await as(A,"update public.profiles set visibility='public' where id=$1",[A])
    expect((await as(null,'select * from public.profiles where id=$1',[A])).length).toBe(1)
    await as(A,"update public.profiles set visibility='private' where id=$1",[A])
  })
  it('private groups and public projects inside private groups are inaccessible to outsiders',async()=>{
    const g=await group(A,'private')
    await as(A,"select public.save_research_project(null,$1,'Oculto','','active',null,null,'public',array[$2::uuid])",[g,TOPIC])
    for(const user of [null,B]) {
      expect((await as(user,'select * from public.research_groups where id=$1',[g])).length).toBe(0)
      expect((await as(user,'select * from public.research_projects where group_id=$1',[g])).length).toBe(0)
      expect((await as(user,'select * from public.group_topics where group_id=$1',[g])).length).toBe(0)
    }
    await expect(request(g)).rejects.toThrow('not accepting')
  })
  it('closed groups reject requests at the database boundary',async()=>{
    await expect(request(await group(A,'public',false))).rejects.toThrow('not accepting')
  })
  it('members cannot grant themselves admin; owners can promote an accepted member; admin can decide',async()=>{
    const g=await group(); const r=await request(g)
    await as(A,"select public.decide_join_request($1,'approved')",[r])
    expect((await as(B,"update public.group_memberships set role='admin' where group_id=$1 returning id",[g])).length).toBe(0)
    await as(A,"update public.group_memberships set role='admin' where group_id=$1 and user_id=$2",[g,B])
    const r2=await request(g,C)
    await as(B,"select public.decide_join_request($1,'approved')",[r2])
    expect((await as(C,'select * from public.group_memberships where group_id=$1 and user_id=$2',[g,C])).length).toBe(1)
  })
  it('owner immutable both by grants and SQL trigger',async()=>{
    const g=await group()
    await expect(as(A,'update public.research_groups set owner_id=$2 where id=$1',[g,B])).rejects.toThrow('permission denied')
    await expect(db.query('update public.research_groups set owner_id=$2 where id=$1',[g,B])).rejects.toThrow('owner is immutable')
    await expect(as(A,"insert into public.research_groups(owner_id,name,created_at) values($1,'Timestamp forged','2099-01-01')",[A])).rejects.toThrow('permission denied')
  })
  it('raw clients cannot forge memberships or mutate requests directly',async()=>{
    const g=await group(); const r=await request(g)
    await expect(as(B,'insert into public.group_memberships(group_id,user_id) values($1,$2)',[g,B])).rejects.toThrow('permission denied')
    await expect(as(A,"update public.group_join_requests set status='approved',decided_by=$2,decided_at=now() where id=$1",[r,A])).rejects.toThrow('permission denied')
    await expect(as(A,'delete from public.group_join_requests where id=$1',[r])).rejects.toThrow('permission denied')
    await expect(as(B,"select public.decide_join_request($1,'approved')",[r])).rejects.toThrow('Not authorized')
  })
  it('invalid taxonomy rolls back the entire group creation and topic replacement',async()=>{
    const before=(await as(A,'select * from public.research_groups')).length
    await expect(as(A,"select public.save_research_group(null,'Rollback','','','','public',true,array['90000000-0000-0000-0000-000000000000'::uuid])")).rejects.toThrow('foreign key')
    expect((await as(A,'select * from public.research_groups')).length).toBe(before)
    const g=await group()
    await expect(as(A,"select public.save_group_topics($1,array['90000000-0000-0000-0000-000000000000'::uuid])",[g])).rejects.toThrow()
    expect((await as(A,'select * from public.group_topics where group_id=$1',[g])).length).toBe(1)
  })
  it('funding, descriptive stage, name and decision constraints reject impossible values',async()=>{
    const g=await group(); const r=await request(g)
    await expect(as(A,"select public.decide_join_request($1,'other')",[r])).rejects.toThrow('Invalid decision')
    await expect(as(A,"update public.profiles set academic_stage='owner' where id=$1",[A])).rejects.toThrow('check constraint')
    await expect(as(A,"select public.save_research_project(null,$1,'Proyecto','','draft',-1,'EUR','private',array[]::uuid[])",[g])).rejects.toThrow('check constraint')
    await expect(as(A,"select public.save_research_project(null,$1,'Proyecto','','draft',100,null,'private',array[]::uuid[])",[g])).rejects.toThrow('check constraint')
    await expect(as(A,"select public.save_research_project(null,$1,'Proyecto','','draft','NaN'::numeric,'EUR','private',array[]::uuid[])",[g])).rejects.toThrow('check constraint')
    await expect(as(A,"update public.profiles set skills=array[null]::text[] where id=$1",[A])).rejects.toThrow('check constraint')
    await expect(as(A,"update public.research_groups set name=' ' where id=$1",[g])).rejects.toThrow('check constraint')
  })
  it('scientific history cannot disappear through cascading group/profile deletion',async()=>{
    const g=await group(); await request(g)
    await expect(db.query('delete from public.research_groups where id=$1',[g])).rejects.toThrow('foreign key')
    await expect(db.query('delete from auth.users where id=$1',[A])).rejects.toThrow('foreign key')
  })
  it('all exposed tables have RLS; public API is invoker; anon cannot run mutation RPC',async()=>{
    const rows=await db.query<{relname:string;relrowsecurity:boolean}>("select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind in ('r','p')")
    expect(rows.rows.map(x=>x.relname)).toEqual(expect.arrayContaining([
      'profiles','research_groups','group_memberships','group_join_requests','research_projects',
      'topics','profile_topics','group_topics','project_topics','recruitment_needs','recommendation_events','recommendation_feedback',
    ])); expect(rows.rows.every(x=>x.relrowsecurity)).toBe(true)
    const funcs=await db.query<{prosecdef:boolean}>("select prosecdef from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public'")
    expect(funcs.rows.every(x=>!x.prosecdef)).toBe(true)
    await expect(as(null,'select public.request_to_join($1,null)',[await group()])).rejects.toThrow('permission denied')
    expect((await as(null,'select * from public.discover_groups()')).length).toBeGreaterThan(0)
  })
})
