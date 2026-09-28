import test from 'node:test';
import assert from 'node:assert/strict';
import {EvidenceStore} from '../server/evidence-store.js';
import {Store} from '../server/db.js';
import {createApp} from '../server/app.js';
import {configuration} from '../server/providers.js';
import {relatedCases} from '../server/related-cases.js';
import {seedEnrichment,saveNotePage} from '../server/enrichment-store.js';

const url=id=>`https://gitlab.com/gitlab-org/gitlab-runner/-/issues/${id}`;
const report=(id,title='Certificate trust failure',body='TLS x509 certificate error')=>({id:String(id),url:url(id),title,body,createdAt:'2025-01-01',updatedAt:'2025-02-01',state:'closed',family:'Network & DNS',labels:['type::bug'],source:'Public GitLab Runner issue'});

test('related discovery excludes current source, canonical aliases, exact copies and labeled duplicates before limiting',t=>{
 const e=new EvidenceStore(':memory:');t.after(()=>e.close());
 const original=report('1');e.upsert(original);
 e.upsert({...original,id:'alias',url:url('1').replace('/issues/','/work_items/')+'#note_3'});
 e.upsert({...original,id:'copy',url:url('20')});
 e.upsert(report('duplicate','Certificate duplicate','TLS x509 duplicate report'));
 e.db.prepare("INSERT INTO enrichment_jobs(report_id,status,extraction) VALUES(?, 'completed', ?)").run('duplicate',JSON.stringify({outcome:{category:'duplicate',label:'Duplicate'}}));
 for(let i=2;i<8;i++)e.upsert(report(String(i),'Certificate report '+i,'TLS certificate evidence '+i));
 const result=relatedCases(e,original,{excludeIds:['1'],excludeUrls:[original.url]});
 assert.equal(result.rows.length,4);assert.equal(new Set(result.rows.map(r=>r.id)).size,4);
 assert.ok(result.rows.every(r=>!['1','alias','copy','duplicate'].includes(r.id)));
 assert.ok(result.rows.every(r=>r.outcome==='Discussion not collected'&&r.state==='closed'));
 assert.ok(result.rows.every(r=>r.excerpt.length<=320));
 assert.deepEqual(relatedCases(e,{title:'An unrelated sandwich'}).rows,[]);
});

test('heldouts and linked contamination stay out of suggestions, including late links in the viewed report',t=>{
 const e=new EvidenceStore(':memory:');t.after(()=>e.close());
 e.reserveSources([url('99')]);e.upsert(report('99'));
 e.upsert(report('2','Certificate evidence','TLS error see '+url('99')));
 e.upsert(report('3','Certificate safe evidence','TLS observed failure'));
 const clean=relatedCases(e,{title:'Certificate error'});assert.deepEqual(clean.rows.map(r=>r.id),['3']);
 const late=relatedCases(e,{title:'Certificate error',body:'ordinary context '.repeat(400)+url('99')});
 assert.equal(late.rows.length,0);assert.match(late.reason,/reserved/);
 const reserved=relatedCases(e,e.get('99'),{excludeIds:['99'],excludeUrls:[url('99')]});assert.match(reserved.reason,/reserved/);
});

test('URL-only source exclusions remove copies even when the original is outside the candidate window',t=>{
 const e=new EvidenceStore(':memory:');t.after(()=>e.close());
 for(let i=0;i<105;i++)e.upsert(report(String(i),'Certificate failure','TLS certificate trust error'));
 const result=relatedCases(e,{title:'Certificate failure'},{excludeUrls:[url('104').replace('/issues/','/work_items/')+'#note_1']});
 assert.deepEqual(result.rows,[]);
});

test('discussion-only matches appear once and carry applicability without treating closed as confirmed',t=>{
 const e=new EvidenceStore(':memory:');t.after(()=>e.close());
 const r=report('10','Job cannot start','No diagnostic terms recorded');e.upsert(r);seedEnrichment(e.db);
 saveNotePage(e.db,r,[1,2].map(n=>({id:`gid://gitlab/Note/${n}`,body:'Kubernetes certificate x509 trust failure in helper',createdAt:'2025-01-01',system:false})),null);
 const result=relatedCases(e,{title:'Kubernetes certificate failure',executor:'Kubernetes',runnerVersion:'18.0'});
 assert.equal(result.rows.length,1);assert.equal(result.rows[0].url,r.url);
 assert.match(result.rows[0].excerpt,/certificate/);assert.match(result.rows[0].applicability.executor,/Kubernetes/);
 assert.match(result.rows[0].outcome,/incomplete/);assert.equal('confirmed' in result.rows[0],false);
});

test('related ranking favors the reported title symptoms over incidental terms in a long body',t=>{
 const e=new EvidenceStore(':memory:');t.after(()=>e.close());
 e.upsert(report('focused','Kubernetes pods restart unexpectedly','Kubernetes restart investigation'));
 e.upsert(report('broad','Kubernetes cache configuration','Kubernetes cache config docker image network dns registry resource memory'));
 const result=relatedCases(e,{title:'Kubernetes pods restarting',body:'Kubernetes restart cache config docker image network dns registry resource memory'});
 assert.equal(result.rows[0].id,'focused');
});

test('GET suggestions are company-independent, exclude original source and preserve workspace and evidence',async t=>{
 const s=new Store(':memory:'),e=new EvidenceStore(':memory:');
 e.upsert(report('origin','Certificate source','Certificate x509 error'));e.upsert(report('other','Certificate other organization','TLS certificate error'));
 s.update(state=>{
  const c=state.cases[0];Object.assign(c,{title:'Certificate x509 error',description:'Certificate trust failure',evidenceReportId:'origin'});
  state.cases[1]={...structuredClone(c),id:state.cases[1].id,companyId:state.cases[1].companyId};
 });
 const {app}=createApp(s,configuration({}),{evidence:e});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));s.close();e.close();});
 const base=`http://127.0.0.1:${server.address().port}/api`,before=JSON.stringify(s.read()),count=e.stats().indexed;
 const get=async path=>{const response=await fetch(base+path);return {status:response.status,body:await response.json()};};
 const a=await get('/cases/CS-1042/related'),b=await get('/cases/CS-1043/related');
 assert.equal(a.status,200);assert.deepEqual(a.body,b.body);assert.deepEqual(a.body.rows.map(r=>r.id),['other']);
 const historical=await get('/evidence/origin/related');assert.deepEqual(historical.body.rows.map(r=>r.id),['other']);
 assert.equal((await get('/cases/missing/related')).status,404);assert.equal((await get('/evidence/missing/related')).status,404);
 assert.equal(JSON.stringify(s.read()),before);assert.equal(e.stats().indexed,count);
});

test('fixture source URLs exclude the current report even without evidenceReportId',async t=>{
 const s=new Store(':memory:'),e=new EvidenceStore(':memory:');
 e.upsert(report('37242','Kubernetes runner restart','Kubernetes runner restart liveness'));
 e.upsert(report('other','Kubernetes runner restart investigation','Kubernetes runner restart timeout'));
 const {app}=createApp(s,configuration({}),{evidence:e});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));s.close();e.close();});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/cases/CS-1042/related`),body=await response.json();
 assert.deepEqual(body.rows.map(r=>r.id),['other']);
});
