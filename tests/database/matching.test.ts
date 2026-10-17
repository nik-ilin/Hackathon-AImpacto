import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const A = '21000000-0000-0000-0000-000000000001'
const B = '21000000-0000-0000-0000-000000000002'
const C = '21000000-0000-0000-0000-000000000003'
const TOPIC = '10000000-0000-0000-0000-000000000001'
let db: PGlite
async function as<T>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ''])
    return (await db.query<T>(sql, params)).rows
  } finally { await db.exec('reset role') }
}
async function group(owner=A, visibility='public') {
  return (await as<{ id:string }>(owner,"select public.save_research_group(null,'Grupo Física','Investigación','','',$1,true,array[$2::uuid]) id",[visibility,TOPIC]))[0].id
}
async function project(g: string, visibility='public') {
  return (await as<{id:string}>(A,"select public.save_research_project(null,$1,'Proyecto','Descripción','active',null,null,$2,array[$3::uuid]) id",[g,visibility,TOPIC]))[0].id
}
async function need(g: string, options: {actor?:string,id?:string,project?:string,skills?:string[],status?:string,title?:string}={}) {
  return (await as<{id:string}>(options.actor??A,'select public.save_recruitment_need($1,$2,$3,$4,$5,$6,$7) id',
    [options.id??null,g,options.project??null,options.title??'Necesidad de incorporación','Trabajo científico',options.skills??[' Python ','python','Machine   Learning','R'],options.status??'open']))[0].id
}
type Event = {id:string,actor_id:string,need_id:string,algorithm_version:string,shown_at:string|null,context:{title:string,declared_skills:string[]},evaluation:{required_skills:string[],matched_skills:string[],missing_skills:string[],additional_skills:string[],coverage:number|null,matched_topics:string[]}}
async function diagnose(n:string, actor: string = B, key: string = randomUUID()) {
  return (await as<Event>(actor,'select * from public.diagnose_recruitment_need($1,$2)',[n,key]))[0]
}
async function shown(e:string,actor=B) { await as(actor,'select public.mark_recommendation_shown($1)',[e]) }
async function feedback(e:string,response='useful',comment='',actor=B) { await as(actor,'select public.save_recommendation_feedback($1,$2,$3)',[e,response,comment]) }
beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`)
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'))
  await db.query('insert into auth.users(id) values ($1),($2),($3)',[A,B,C])
  for(const [id,name] of [[A,'Ana'],[B,'Bruno'],[C,'Carla']]) await as(id,"select public.upsert_profile($1,null,'','','student','',array['PYTHON',' Machine  Learning ','SQL','python'],null,'private',array[$2::uuid])",[name,TOPIC])
},30000)
afterAll(async()=>{await db?.close()})

describe('Recruitment diagnostics and feedback SQL boundary (PGlite)',()=>{
  it('owners create/update needs; outsiders and ordinary members cannot; admins can',async()=>{
    const g=await group(); const n=await need(g)
    await expect(need(g,{actor:B})).rejects.toThrow('Not authorized')
    await expect(need(g,{id:n,actor:B})).rejects.toThrow('Not authorized')
    await db.query('insert into public.group_memberships(group_id,user_id) values($1,$2)',[g,B])
    await expect(need(g,{actor:B})).rejects.toThrow('Not authorized')
    await as(A,"update public.group_memberships set role='admin' where group_id=$1 and user_id=$2",[g,B])
    expect(await need(g,{id:n,actor:B,title:'Actualizada'})).toBe(n)
    expect(await need(g,{actor:B})).toBeTruthy()
  })
  it('needs cannot reference a project in another group or be moved across groups',async()=>{
    const g=await group(), other=await group(); const p=await project(other); const n=await need(g)
    await expect(need(g,{project:p})).rejects.toThrow('Project must belong')
    await expect(need(other,{id:n})).rejects.toThrow('Not authorized')
    await expect(db.query('insert into public.recruitment_needs(group_id,project_id,title) values($1,$2,$3)',[g,p,'Inconsistent'])).rejects.toThrow('foreign key')
  })
  it('normalizes requirement variants without modifying existing declared profile skills',async()=>{
    const e=await diagnose(await need(await group()))
    expect(e.actor_id).toBe(B)
    expect(e.algorithm_version).toBe('skills-coverage-v1')
    expect(e.evaluation).toEqual({required_skills:['machine learning','python','r'],matched_skills:['machine learning','python'],missing_skills:['r'],additional_skills:['sql'],coverage:2/3,matched_topics:['Física']})
    const original=['PYTHON',' Machine  Learning ','SQL','python']
    expect(e.context.declared_skills).toEqual(original)
    expect((await as<{skills:string[]}>(B,'select skills from public.profiles where id=$1',[B]))[0].skills).toEqual(original)
  })
  it('empty and whitespace-only requirements give null coverage; topics do not supply skills',async()=>{
    const g=await group()
    expect((await diagnose(await need(g,{skills:['  ','\t']}))).evaluation.coverage).toBeNull()
    const e=await diagnose(await need(g,{skills:['Física']}))
    expect(e.evaluation.matched_topics).toEqual(['Física'])
    expect(e.evaluation.coverage).toBe(0)
    expect(e.evaluation.missing_skills).toEqual(['física'])
  })
  it('retains discover_groups thematic ranking independently of skill requirements',async()=>{
    const g=await group()
    const before=await as(B,'select id,match_count,matched_topics from public.discover_groups() where id=$1',[g])
    await need(g,{skills:['not a topic']})
    const after=await as(B,'select id,match_count,matched_topics from public.discover_groups() where id=$1',[g])
    expect(after).toEqual(before)
  })
  it('private group/project requirements cannot be listed or diagnosed by outsiders',async()=>{
    const g=await group(A,'private'); const n=await need(g)
    const publicGroup=await group(); const privateProject=await project(publicGroup,'private'); const projectNeed=await need(publicGroup,{project:privateProject})
    for(const id of [n,projectNeed]) {
      expect(await as(B,'select * from public.recruitment_needs where id=$1',[id])).toEqual([])
      await expect(diagnose(id)).rejects.toThrow('Not authorized')
      expect((await diagnose(id,A)).id).toBeTruthy()
    }
    await db.query('insert into public.group_memberships(group_id,user_id) values($1,$2)',[publicGroup,B])
    expect((await diagnose(projectNeed)).id).toBeTruthy()
  })
  it('self diagnosis does not disclose a private profile or its evaluation to a group owner',async()=>{
    const e=await diagnose(await need(await group()))
    expect(await as(A,'select * from public.profiles where id=$1',[B])).toEqual([])
    expect(await as(A,'select * from public.recommendation_events where id=$1',[e.id])).toEqual([])
    await expect(shown(e.id,A)).rejects.toThrow('Not authorized')
    await expect(feedback(e.id,'useful','',A)).rejects.toThrow('Not authorized')
    await shown(e.id)
    await feedback(e.id)
    expect(await as(A,'select * from public.recommendation_feedback where event_id=$1',[e.id])).toEqual([])
  })
  it('same actor/key returns the frozen snapshot; another need with same key is rejected',async()=>{
    const g=await group(), n=await need(g), key=randomUUID()
    const e=await diagnose(n,B,key)
    await need(g,{id:n,title:'Requisitos distintos',skills:['Julia']})
    const retried=await diagnose(n,B,key)
    expect(retried).toEqual(e)
    expect((await diagnose(n)).evaluation.required_skills).toEqual(['julia'])
    expect((await as(B,'select * from public.recommendation_events where impression_key=$1',[key])).length).toBe(1)
    await expect(diagnose(await need(g),B,key)).rejects.toThrow('another need')
    expect((await diagnose(n,C,key)).id).not.toBe(e.id)
  })
  it('profile edits cannot rewrite a previously presented evaluation',async()=>{
    const n=await need(await group()), key=randomUUID(), e=await diagnose(n,B,key)
    await as(B,"update public.profiles set skills=array['Julia'] where id=$1",[B])
    expect(await diagnose(n,B,key)).toEqual(e)
    expect((await diagnose(n)).evaluation.matched_skills).toEqual([])
    await as(B,"update public.profiles set skills=array['PYTHON',' Machine  Learning ','SQL','python'] where id=$1",[B])
  })
  it('closed needs reject new evaluations and can be reopened by their manager',async()=>{
    const g=await group(), n=await need(g,{status:'closed'})
    await expect(diagnose(n)).rejects.toThrow('Need is closed')
    await need(g,{id:n,status:'open'})
    expect((await diagnose(n)).id).toBeTruthy()
    await expect(need(g,{status:'unknown'})).rejects.toThrow('check constraint')
  })
  it('prepared is distinct from shown; marking shown is idempotent and no feedback means no row',async()=>{
    const e=await diagnose(await need(await group()))
    expect(e.shown_at).toBeNull()
    expect(await as(B,'select * from public.recommendation_feedback where event_id=$1',[e.id])).toEqual([])
    await expect(feedback(e.id)).rejects.toThrow('not shown')
    await shown(e.id)
    const first=await as(B,'select shown_at from public.recommendation_events where id=$1',[e.id])
    await shown(e.id)
    expect(await as(B,'select shown_at from public.recommendation_events where id=$1',[e.id])).toEqual(first)
    expect(await as(B,'select * from public.recommendation_feedback where event_id=$1',[e.id])).toEqual([])
  })
  it('feedback updates one own row while preserving the associated snapshot',async()=>{
    const e=await diagnose(await need(await group())); await shown(e.id)
    await feedback(e.id,'not_useful','Falta experiencia')
    await feedback(e.id,'useful','Ahora comprendo el diagnóstico')
    const rows=await as<{response:string;comment:string}>(B,'select response,comment from public.recommendation_feedback where event_id=$1',[e.id])
    expect(rows).toEqual([{response:'useful',comment:'Ahora comprendo el diagnóstico'}])
    expect((await as<Event>(B,'select * from public.recommendation_events where id=$1',[e.id]))[0].evaluation).toEqual(e.evaluation)
    await expect(feedback(e.id,'rejected')).rejects.toThrow('check constraint')
    await expect(feedback(e.id,'useful','x'.repeat(2001))).rejects.toThrow('check constraint')
  })
  it('raw clients cannot forge evaluation, display timestamps, or feedback',async()=>{
    const g=await group(), n=await need(g), e=await diagnose(n)
    await expect(as(A,"update public.recruitment_needs set required_skills=array['forged'] where id=$1",[n])).rejects.toThrow('permission denied')
    await expect(as(B,"update public.recommendation_events set evaluation='{}',shown_at=now() where id=$1",[e.id])).rejects.toThrow('permission denied')
    await expect(as(B,"insert into public.recommendation_events(actor_id,need_id,impression_key,algorithm_version,context,evaluation) values($1,$2,$3,'forged','{}','{}')",[B,n,randomUUID()])).rejects.toThrow('permission denied')
    await expect(as(B,"insert into public.recommendation_feedback(event_id,actor_id,response) values($1,$2,'useful')",[e.id,B])).rejects.toThrow('permission denied')
    await expect(as(B,'delete from public.recommendation_events where id=$1',[e.id])).rejects.toThrow('permission denied')
  })
  it('anonymous and missing-identity callers cannot invoke any new mutation',async()=>{
    const g=await group(), n=await need(g), e=await diagnose(n)
    const calls:[string,unknown[]][]=[
      ['select public.save_recruitment_need(null,$1,null,\'Need\',\'\',array[]::text[],\'open\')',[g]],
      ['select public.diagnose_recruitment_need($1,$2)',[n,randomUUID()]],
      ['select public.mark_recommendation_shown($1)',[e.id]],
      ["select public.save_recommendation_feedback($1,'useful','')",[e.id]],
    ]
    for(const [sql,params] of calls) await expect(as(null,sql,params)).rejects.toThrow('permission denied')
    for(const [sql,params] of calls) {
      await db.exec('set role authenticated')
      try {
        await db.query("select set_config('request.jwt.claim.sub','',false)")
        await expect(db.query(sql,params)).rejects.toThrow('Authentication required')
      } finally { await db.exec('reset role') }
    }
  })
  it('rejects null and oversized requirement arrays before normalization',async()=>{
    const g=await group()
    await expect(need(g,{skills:Array(51).fill('Python')})).rejects.toThrow('Invalid required skills')
    await expect(as(A,"select public.save_recruitment_need(null,$1,null,'Need','',array[null]::text[],'open')",[g])).rejects.toThrow('Invalid required skills')
    await expect(as(A,"select public.save_recruitment_need(null,$1,null,'Need','',null,'open')",[g])).rejects.toThrow('Invalid required skills')
    await expect(diagnose(await need(g),B,null as unknown as string)).rejects.toThrow('Impression key required')
  })
})
