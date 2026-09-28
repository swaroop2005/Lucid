import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInvestigationAuthorizer} from '../server/hindsight-budget.js';
import {HindsightCreditBudget} from '../scripts/lib/hindsight-credit-budget.js';
import {hash} from '../server/domain.js';
import {buildMemoryPacket} from '../server/memory-evidence.js';
import {articleScopeTags} from '../server/hindsight-scope.js';
import {buildDerivedPlan,HindsightDerived} from '../server/hindsight-derived.js';

test('experiment ceiling is checked atomically against all prior reservations',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hindsight-experiment-budget-'));
 try{
  const ledgerPath=join(dir,'ledger.json'),ledger=new HindsightCreditBudget(ledgerPath),secret={baseUrl:'https://api.hindsight.vectorize.io',bank:'fake-bank',apiKey:'test-only-secret'},connectionId=hash([secret.baseUrl,secret.bank,hash(secret.apiKey)]);
  ledger.initialize();ledger.update(l=>Object.assign(l,{connectionId,workspaceId:'workspace'}));
  const authorize=createInvestigationAuthorizer({ledgerPath,reservationCeilingUSD:.15,store:{read:()=>({workspaceId:'workspace'})},settings:{read:()=>secret}});
  const input={id:'one',kind:'investigation-reflect',budget:'high',connectionId,request:{query:'bounded',options:{budget:'high',includeFacts:true,excludeMentalModels:true}}};
  await authorize(input);
  await assert.rejects(authorize({...input,id:'two'}),/ceiling/);
  assert.equal(ledger.read().calls.length,1);
  assert.throws(()=>ledger.reserve({id:'atomic',operation:'investigation-reflect',category:'evaluation',reservedUSD:.1,reservationCeilingUSD:.15}),/ceiling/);
  assert.throws(()=>ledger.reserve({id:'bad-limit',operation:'investigation-reflect',category:'evaluation',reservedUSD:.01,reservationCeilingUSD:NaN}),/ceiling/);
  assert.equal(ledger.summary().reservedUSD,.1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('app budget requires pinned authority, locks reservations and stops after insufficient credit',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hindsight-app-budget-'));
 try{
  const ledgerPath=join(dir,'ledger.json'),ledger=new HindsightCreditBudget(ledgerPath),secret={baseUrl:'https://api.hindsight.vectorize.io',bank:'test-bank',apiKey:'test-only-secret'},connectionId=hash([secret.baseUrl,secret.bank,hash(secret.apiKey)]);
  const authorize=createInvestigationAuthorizer({ledgerPath,store:{read:()=>({workspaceId:'workspace'})},settings:{read:()=>secret}});
  const input={id:'investigation:0',investigationId:'investigation',kind:'investigation-reflect',budget:'high',connectionId,request:{query:'A bounded case',options:{budget:'high',includeFacts:true,excludeMentalModels:true}}};
  await assert.rejects(authorize(input),/no authorized local budget/);
  ledger.initialize();await assert.rejects(authorize(input),/does not match/);
  ledger.update(l=>Object.assign(l,{connectionId,workspaceId:'workspace'}));
  writeFileSync(ledgerPath+'.lock','another operation');await assert.rejects(authorize(input),/locked/);rmSync(ledgerPath+'.lock');
  const reservation=await authorize(input);assert.equal(ledger.read().calls[0].status,'dispatched');assert.equal(ledger.summary().reservedUSD,.10);
  await assert.rejects(authorize(input),/already reserved/);
  reservation.fail({status:402});assert.equal(ledger.read().stopped.httpStatus,402);
  await assert.rejects(authorize({...input,id:'investigation:1'}),/stopped/);
  assert.equal(ledger.summary().reservedUSD,.10);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

// Real plan validation, service and durable budget bridge; only the SDK and article
// store are fakes. Each test owns a temporary credit ledger, never the app ledger.
function derivedBudgetFixture(){
 const dir=mkdtempSync(join(tmpdir(),'hindsight-derived-budget-')),ledgerPath=join(dir,'ledger.json');
 const ledger=new HindsightCreditBudget(ledgerPath),state={workspaceId:'budget-derived',articles:[],cases:[],companies:[]};
 const secret={baseUrl:'https://api.hindsight.vectorize.io',bank:'fake-bank',apiKey:'test-only-secret'};
 const connectionId=()=>hash([secret.baseUrl,secret.bank,hash(secret.apiKey)]),scope='lucid-workspace-'+state.workspaceId;
 for(let i=1;i<=2;i++){
  const article={id:`KA-000${i}`,revision:1,fingerprint:hash({i}),title:`Source lesson ${i}`,executor:'Shell',hosting:'Self-managed',runnerVersion:'',serverVersion:'',chartVersion:'',symptom:'Historical configuration failure',fix:`Reporter ${i} recovered after correcting configuration.`,cause:'Unknown',verification:'Reported outcome only',limitations:'Unknown versions and no independent reproduction',updatedAt:'2026-09-28T00:00:00Z',sourceCases:[],sourceReports:[],citations:[],curation:{immutable:true,method:'assistant-source-inspection',reviewer:'AI source reviewer',reviewedAt:'2026-09-28T00:00:00Z'}};
  state.articles.push(article);
 }
 for(const a of state.articles){
  const contentHash=hash(buildMemoryPacket(a,state,{scope}).content),docId=`${scope}-${a.id}-r1-doc`;
  a.cloudRetention={connectionId:connectionId(),status:'succeeded',revision:1,articleHash:a.fingerprint,contentHash,docId};
  a.cloudScope={connectionId:connectionId(),revision:1,articleHash:a.fingerprint,contentHash,docId,tags:articleScopeTags(a,scope),policyVersion:2,verifiedAt:'2026-09-28T00:00:00Z'};
 }
 const facts=state.articles.map(a=>({id:'fact-'+a.id,text:a.fix,type:'world',state:'valid',document_id:a.cloudScope.docId,tags:a.cloudScope.tags,metadata:{article_id:a.id,revision:'1',hash:a.fingerprint,workspace_scope:scope}}));
 const store={read:()=>structuredClone(state),update:fn=>fn(state)},settings={read:()=>({...secret})};
 ledger.initialize();ledger.update(l=>Object.assign(l,{connectionId:connectionId(),workspaceId:state.workspaceId}));
 const authorize=createInvestigationAuthorizer({ledgerPath,store,settings}),calls=[];
 const record=kind=>{
  const call=ledger.read().calls.at(-1),attempt=state.hindsightDerived[0].attempts.at(-1);
  assert.equal(call.operation,kind);assert.equal(call.status,'dispatched');
  assert.equal(attempt.kind,kind);assert.equal(attempt.status,'dispatched');
  assert.equal(call.limits.requestHash,hash(attempt.request));calls.push(kind);
 };
 let model;
 const client={
  listDirectives:async()=>{record('derived-metadata');return {items:[],total:0};},
  createMentalModel:async(bank,name,query,options)=>{
   record('derived-create');assert.equal(state.hindsightDerived[0].status,'dispatched');
   model={id:options.id,bank_id:bank,name,source_query:query,tags:options.tags,max_tokens:options.maxTokens,trigger:{mode:'full',refresh_after_consolidation:false,refresh_cron:null,exclude_mental_models:true,keep_trace:true,tag_groups:options.trigger.tagGroups,include_chunks:true,recall_max_tokens:4096,recall_chunks_max_tokens:4096},last_refreshed_at:'2026-09-28T01:00:00Z',content:'Compare the reported recoveries [KA-0001] [KA-0002].',is_stale:false};
   model.reflect_response={text:model.content,based_on:{memories:facts.map(f=>({id:f.id,text:f.text,type:f.type})),mental_models:[],directives:[]}};
   return {mental_model_id:model.id,operation_id:'fake-create-operation'};
  },
  getMentalModel:async()=>{record('derived-read');return structuredClone(model);}
 };
 const provider={c:{bank:secret.bank},scope:()=>scope,getClient:()=>client,operation:async()=>{record('derived-metadata');return {status:'completed'};},readMemory:async id=>{record('derived-provenance');return structuredClone(facts.find(f=>f.id===id));}};
 const service=new HindsightDerived(store,{provider:()=>provider,connectionId,authorize});
 const input={name:'Configuration comparison',question:'Which diagnostic checks distinguish these historical recoveries?',articleIds:state.articles.map(a=>a.id)};
 const view=service.stage(input),plan=state.hindsightDerived[0].plan;
 assert.deepEqual(plan,buildDerivedPlan(state,input,{connectionId:connectionId(),scope,bank:secret.bank,id:view.id}));
 const run=action=>service.run(view.id,action,{expectedPlanHash:view.planHash,acknowledgeCreditUse:true});
 return {state,secret,ledger,authorize,connectionId,client,provider,service,view,plan,calls,run,model:()=>model,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}

test('derived workflow uses the real locked authorizer for every SDK phase and preserves evaluation funds',async()=>{
 const x=derivedBudgetFixture();try{
  const articles=structuredClone(x.state.articles);
  assert.equal(x.ledger.read().calls.length,0);assert.deepEqual(x.calls,[]);
  await x.run('create');const result=await x.run('check');
  assert.equal(result.status,'reviewable');assert.equal(result.snapshot.provenance.records.length,2);
  assert.deepEqual(x.calls,['derived-metadata','derived-create','derived-metadata','derived-read','derived-provenance','derived-provenance']);
  assert.deepEqual(x.ledger.read().calls.map(c=>[c.operation,c.reservedUSD,c.status]),[
   ['derived-metadata',0,'completed'],['derived-create',.50,'completed'],['derived-metadata',0,'completed'],['derived-read',.05,'completed'],['derived-provenance',0,'completed'],['derived-provenance',0,'completed']
  ]);
  assert.equal(x.ledger.summary().reservedUSD,.55);assert.equal(x.ledger.summary().byCategory.evaluation.reservedUSD,0);
  assert.equal(x.ledger.summary().byCategory.derived.reservedUSD,.55);
  assert.deepEqual(x.state.articles,articles);assert.equal(x.state.hindsightDerived[0].snapshots[0].humanReviewed,false);
  await assert.rejects(x.run('create'),/already dispatched/);assert.equal(x.ledger.read().calls.length,6);
 }finally{x.cleanup();}
});

test('derived source and connection drift prevent dispatch, and authorizer independently rejects unsafe scope',async()=>{
 for(const drift of ['article','connection']){
  const x=derivedBudgetFixture();try{
   if(drift==='article')x.state.articles[0].fix+=' Changed after planning.';else x.secret.bank='different-bank';
   await assert.rejects(x.run('create'),/retained content|connection/);
   assert.equal(x.ledger.read().calls.length,0);assert.deepEqual(x.calls,[]);
  }finally{x.cleanup();}
 }
 const x=derivedBudgetFixture();try{
  const request={name:x.plan.name,sourceQuery:x.plan.sourceQuery,options:structuredClone(x.plan.options),sourceSnapshots:x.plan.sourceSnapshots,planHash:x.plan.planHash};
  request.options.trigger.tagGroups=[{tags:['lucid-workspace-budget-derived'],match:'all'}];
  await assert.rejects(x.authorize({id:'forged-scope',derivedId:x.plan.id,kind:'derived-create',connectionId:x.connectionId(),request}),/exact source scopes/);
  assert.equal(x.ledger.read().calls.length,0);
 }finally{x.cleanup();}
});

test('remote derived configuration drift rejects the billed read before any provenance or snapshot',async()=>{
 const x=derivedBudgetFixture();try{
  await x.run('create');x.model().trigger.refresh_after_consolidation=true;
  await assert.rejects(x.run('check'),/configuration differs/);
  assert.equal(x.ledger.summary().reservedUSD,.55);
  assert.equal(x.ledger.read().calls.at(-1).operation,'derived-read');
  assert.equal(x.ledger.read().calls.at(-1).status,'completed');
  assert.equal(x.state.hindsightDerived[0].snapshots.length,0);
  assert.ok(!x.calls.includes('derived-provenance'));
 }finally{x.cleanup();}
});

test('source drift during a successful SDK read preserves its reservation and cannot publish the result',async()=>{
 const x=derivedBudgetFixture();try{
  await x.run('create');const read=x.client.getMentalModel;
  x.client.getMentalModel=async(...args)=>{const response=await read(...args);x.state.articles[0].fix+=' Concurrent source change.';return response;};
  await assert.rejects(x.run('check'),/retained content/);
  assert.equal(x.ledger.summary().reservedUSD,.55);
  assert.equal(x.state.hindsightDerived[0].snapshots.length,0);
  assert.ok(!x.calls.includes('derived-provenance'));
  assert.equal(x.service.view()[0].stale,true);
 }finally{x.cleanup();}
});

test('mandatory audit has its own bounded reservation and cannot silently repeat',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hindsight-audit-budget-'));
 try{
  const ledgerPath=join(dir,'ledger.json'),ledger=new HindsightCreditBudget(ledgerPath),secret={baseUrl:'https://api.hindsight.vectorize.io',bank:'test-bank',apiKey:'test-only-secret'},connectionId=hash([secret.baseUrl,secret.bank,hash(secret.apiKey)]);
  ledger.initialize();ledger.update(l=>Object.assign(l,{connectionId,workspaceId:'workspace'}));
  const authorize=createInvestigationAuthorizer({ledgerPath,store:{read:()=>({workspaceId:'workspace'})},settings:{read:()=>secret}});
  const request={query:'Whole case, selected evidence and saved candidate',auditInputHash:'a'.repeat(64),options:{budget:'high',includeFacts:true,excludeMentalModels:true,includeToolCalls:true,includeToolCallOutput:true,applyAllDirectives:false}},input={id:'audit:0',investigationId:'inv-audit',kind:'investigation-audit',budget:'high',connectionId,request};
  for(const invalid of [{...request,query:'x'.repeat(48001)},{...request,auditInputHash:''},{...request,options:{...request.options,excludeMentalModels:false}},{...request,options:{...request.options,applyAllDirectives:true}}])await assert.rejects(authorize({...input,request:invalid}),/audit exceeds/);
  assert.equal(ledger.summary().reservedUSD,0);const reservation=await authorize(input);assert.equal(ledger.summary().reservedUSD,.10);await reservation.complete({usage:{input_tokens:1}});
  await assert.rejects(authorize({...input,id:'audit:1'}),/already reserved/);assert.equal(ledger.summary().reservedUSD,.10);
  assert.throws(()=>ledger.reserve({id:'audit:atomic',category:'evaluation',operation:'investigation-audit',reservedUSD:.10,limits:{investigationId:'inv-audit'}}),/already reserved/);assert.equal(ledger.summary().reservedUSD,.10);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
