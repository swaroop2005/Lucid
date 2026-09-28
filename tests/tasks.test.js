import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/db.js';
import {addCaseTask,updateCaseTask} from '../server/tasks.js';
import {offlineDrafts} from '../server/domain.js';
import {investigationInput} from '../server/openai.js';
test('planned checks are idempotent and completing one requires an observation, not a case resolution',()=>{
 const store=new Store(':memory:');
 const first=store.update(s=>addCaseTask(s,'CS-1042',{title:'Inspect the pod restart events'}));
 const again=store.update(s=>addCaseTask(s,'CS-1042',{title:'Inspect the pod restart events'}));assert.equal(first.id,again.id);
 assert.throws(()=>store.update(s=>updateCaseTask(s,'CS-1042',first.id,{completed:true,evidence:''})),/observed/);
 store.update(s=>updateCaseTask(s,'CS-1042',first.id,{completed:true,evidence:'Events show liveness timeouts; no OOMKill.'}));
 const c=store.read().cases[0];assert.equal(c.tasks[0].completed,true);assert.equal(c.resolution,null);assert.equal(c.status,'Open');
 assert.match(offlineDrafts(c,[]).engineering,/Events show liveness/);
 assert.equal(investigationInput(c,[],[]).case.plannedSteps[0].evidence,c.tasks[0].evidence);
 store.close();
});
test('step provenance must belong to selected case evidence and unknown steps fail',()=>{
 const store=new Store(':memory:');
 assert.throws(()=>store.update(s=>addCaseTask(s,'CS-1042',{title:'Check configuration',sourceId:'SRC-other'})),/Select the source/);
 assert.throws(()=>store.update(s=>updateCaseTask(s,'CS-1042','missing',{completed:false})),/not found/);
 store.update(s=>s.cases[0].publicEvidence=[{id:'SRC-one'}]);
 const task=store.update(s=>addCaseTask(s,'CS-1042',{title:'Check configuration',sourceId:'SRC-one'}));assert.equal(task.sourceId,'SRC-one');
 store.close();
});
test('an in-flight investigation is invalidated when step results change',async()=>{
 // Identity includes tasks in app.js; this regression exercises the actual API.
 const {createApp}=await import('../server/app.js');const {configuration}=await import('../server/providers.js');
 const store=new Store(':memory:');let release,markStarted;const wait=new Promise(r=>release=r),started=new Promise(r=>markStarted=r);
 const {app}=createApp(store,configuration({}),{draft:async()=>{markStarted();await wait;return {customer:'draft',engineering:'draft'};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const response=fetch(`http://127.0.0.1:${server.address().port}/api/cases/CS-1042/analyze`,{method:'POST',headers:{'content-type':'application/json','x-lucid-local':'1'},body:JSON.stringify({useMemory:false})});await started;store.update(s=>addCaseTask(s,'CS-1042',{title:'Inspect new evidence'}));release();assert.equal((await response).status,409);}
 finally{release();await new Promise(r=>server.close(r));store.close();}
});
