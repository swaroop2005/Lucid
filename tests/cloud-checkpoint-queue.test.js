import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {CloudCheckpointQueue,forecastCheckpointWrites} from '../server/cloud-checkpoint-queue.js';
import {CloudWorkspaceArchive,buildCloudWorkspaceSnapshot} from '../server/cloud-workspace.js';

async function fixture(){
 let state={workspaceId:'queue-fixture',cloudWorkspaceLocal:{ownerId:'owner-a'},cases:[{id:'case-a',description:'Initial report',timeline:[]}],companies:[],articles:[],officialDocuments:[],events:[],outbox:[]};let updates=0;
 const store={read:()=>structuredClone(state),update:fn=>{const next=structuredClone(state),out=fn(next);state=next;updates++;return out;}},docs=new Map(),calls=[],control={allowed:true,delay:false,onRetain:null,onSpend:null},budgets=[];
 const transport={listDocuments:async()=>{calls.push('list');const items=[...docs.values()].filter(d=>d.tags.includes('kind:workspace-manifest')).map(d=>({id:d.id}));return {items,total:items.length,offset:0};},getDocument:async(_bank,id)=>{calls.push('get');return docs.get(id)||null;},listMentalModels:async()=>{calls.push('policy');return {items:[],total:0};},retain:async(bank,content,options)=>{calls.push('retain');await control.onRetain?.();if(!control.delay)docs.set(options.documentId,{id:options.documentId,bank_id:bank,original_text:content,tags:options.tags,document_metadata:options.metadata,memory_unit_count:0});return {async:true};}};
 const archiveFactory=()=>new CloudWorkspaceArchive(store,transport,{workspaceId:'queue-fixture',bank:'bank-a',ownerId:'owner-a',connectionId:()=> 'connection-a',authorize:async()=>({}),wait:async()=>{}});
 const seed=buildCloudWorkspaceSnapshot(store.read(),{ownerId:'owner-a'}),archive=archiveFactory();archive.stage(seed);await archive.publish(seed.snapshotHash);calls.length=0;
 const options={archiveFactory,canSpend:async input=>{calls.push('preflight');budgets.push(input);await control.onSpend?.();return control.allowed;},debounceMs:5,wait:async()=>{}};
 const queue=new CloudCheckpointQueue(store,options),edit=text=>store.update(s=>{s.cases[0].description=text;});
 return {store,docs,calls,control,budgets,queue,edit,archiveFactory,options,updates:()=>updates};
}
test('constructor and proof journals never dispatch; committed saves coalesce and preflight before paid policy/write',async()=>{
 const x=await fixture(),updates=x.updates();await new Promise(r=>setTimeout(r,10));assert.equal(x.updates(),updates);assert.equal(x.calls.length,0);
 x.store.update(s=>{s.cloudWorkspaceStatus.checkedAt='ignored';});assert.equal(x.queue.committed().queued,false);
 x.edit('First saved edit');x.queue.committed();x.edit('Second saved edit');x.queue.committed();const result=await x.queue.flush();assert.equal(result.status,'verified');assert.equal(x.budgets.length,1);assert.equal(x.store.read().cloudWorkspaceStatus.status,'verified');assert.ok(x.calls.indexOf('preflight')<x.calls.indexOf('policy'));assert.ok(x.calls.indexOf('preflight')<x.calls.indexOf('retain'));assert.equal(x.budgets[0].forecast.totalReservationUSD,.35);x.queue.close();
});
test('whole-batch denial and unavailable configuration leave pending without staging or paid operations',async()=>{
 const x=await fixture(),before=Object.keys(x.store.read().cloudWorkspaceSnapshots);x.control.allowed=false;x.edit('Unaffordable change');x.queue.committed();assert.equal((await x.queue.flush()).reason,'budget-denied');assert.deepEqual(Object.keys(x.store.read().cloudWorkspaceSnapshots),before);assert.ok(!x.calls.includes('policy'));assert.ok(!x.calls.includes('retain'));await new Promise(r=>setTimeout(r,15));assert.equal(x.budgets.length,1);x.queue.close();
 const queue=new CloudCheckpointQueue(x.store,{archiveFactory:()=>null,canSpend:()=>true});x.edit('Disconnected change');queue.committed();assert.equal((await queue.flush()).reason,'not-configured');queue.close();
});
test('more than 32 missing documents requires explicit review before any paid call',async()=>{
 const x=await fixture();x.edit(randomBytes(240000).toString('hex'));x.queue.committed();const result=await x.queue.flush();assert.equal(result.reason,'write-bound');assert.ok(result.forecast.missingDocuments>32);assert.equal(x.budgets.length,0);assert.ok(!x.calls.includes('policy'));assert.ok(!x.calls.includes('retain'));x.queue.close();
});
test('unknown asynchronous write gets only one paid publish and three zero-write checks, without automatic retry',async()=>{
 const x=await fixture();x.control.delay=true;let checks=0;const original=x.options.archiveFactory;x.queue.archiveFactory=()=>{const archive=original(),publish=archive.publish.bind(archive);archive.publish=async(hash,options)=>{if(options.maxWrites===0)checks++;return publish(hash,options);};return archive;};
 x.edit('An asynchronous change');x.queue.committed();assert.equal((await x.queue.flush()).reason,'unverified-write');assert.equal(checks,3);assert.equal(x.calls.filter(c=>c==='policy').length,1);assert.equal(x.calls.filter(c=>c==='retain').length,1);const calls=x.calls.length;await new Promise(r=>setTimeout(r,15));assert.equal(x.calls.length,calls);x.queue.close();
 const restarted=new CloudCheckpointQueue(x.store,x.options);await new Promise(r=>setTimeout(r,10));assert.equal(x.calls.length,calls);x.edit('Explicit new save after restart');restarted.committed();assert.equal((await restarted.flush()).reason,'unverified-prior-write');assert.equal(x.calls.filter(c=>c==='retain').length,1);assert.equal(x.budgets.length,1);restarted.close();
});
test('edit during publication receives one verified follow-up, never parallel workers',async()=>{
 const x=await fixture();let edited=false;x.control.onRetain=async()=>{if(!edited){edited=true;x.edit('Newer save during the first write');x.queue.committed();}};x.edit('First publication');x.queue.committed();const first=x.queue.flush(),second=x.queue.flush();assert.equal((await first).status,'verified');await second;assert.equal(x.budgets.length,2);assert.equal(x.store.read().cloudWorkspaceStatus.status,'verified');assert.equal(Object.values(x.store.read().cloudWorkspaceSnapshots).filter(r=>r.status==='verified').length,3);x.queue.close();
});
test('ownership and preparation drift reject before staging or paid actions',async()=>{
 const x=await fixture();x.store.update(s=>s.cloudWorkspaceStatus.activeOwnerId='another-owner');const before=x.updates();assert.throws(()=>x.queue.committed(),/another active owner/);assert.equal(x.updates(),before);assert.equal(x.calls.length,0);x.queue.close();
 const y=await fixture();y.control.onSpend=async()=>{y.edit('New input during authorization');y.queue.committed();};y.edit('Frozen earlier input');y.queue.committed();assert.equal((await y.queue.flush()).reason,'input-changed');assert.equal(y.calls.filter(c=>c==='retain').length,0);assert.equal(y.calls.filter(c=>c==='policy').length,0);y.queue.close();
});
test('forecast reuses only exact verified document identities on the same connection and bank',async()=>{
 const x=await fixture(),state=x.store.read(),head=state.cloudWorkspaceStatus.snapshotHash,plan=buildCloudWorkspaceSnapshot(state,{ownerId:'owner-a',parentHash:head});
 const forecast=forecastCheckpointWrites(plan,state,{connectionId:'connection-a',bank:'bank-a'});assert.equal(forecast.missingDocuments,1);assert.equal(forecast.reusedDocuments,1);assert.equal(forecast.totalReservationUSD,.20);
 assert.equal(forecastCheckpointWrites(plan,state,{connectionId:'different',bank:'bank-a'}).missingDocuments,2);Object.values(state.cloudWorkspaceSnapshots)[0].documents[plan.documents[0].hash].status='awaiting-readback';assert.equal(forecastCheckpointWrites(plan,state,{connectionId:'connection-a',bank:'bank-a'}).missingDocuments,2);x.queue.close();
});
test('continuous new saves stop after one bounded follow-up rather than becoming a background spending loop',async()=>{
 const x=await fixture();let edit=0;x.control.onRetain=async()=>{x.edit(`New committed observation ${++edit}`);x.queue.committed();};x.edit('Initial committed change');x.queue.committed();const result=await x.queue.flush();assert.equal(result.reason,'followup-bound');assert.equal(x.budgets.length,2);assert.equal(x.store.read().cloudWorkspaceStatus.status,'pending');const paid=x.calls.filter(c=>c==='retain').length;await new Promise(r=>setTimeout(r,15));assert.equal(x.calls.filter(c=>c==='retain').length,paid);x.queue.close();
});
