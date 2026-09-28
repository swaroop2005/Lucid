import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/db.js';
import {MemoryProvider,resolveRecall} from '../server/providers.js';
import {CloudWorkflow} from '../server/cloud-workflow.js';
const fp='a'.repeat(64),scope='review-workspace';
const config={memoryMode:'hindsight',allowExternal:true,hindsightUrl:'https://example.invalid',bank:'review-bank',workspaceScope:scope};
function storeWithArticle(){const s=new Store(':memory:');s.update(state=>state.articles.push({id:'KA-0001',revision:1,fingerprint:fp,title:'Reviewed article',executor:'Kubernetes',hosting:'Self-managed',symptom:'runner-restarts',sourceCases:[],sourceIds:[],citations:[]}));return s;}
function fact(id,override={}){return {id,text:'Source evidence remains uncertain.',document_id:scope+'-KA-0001-r1-'+fp.slice(0,12),tags:[scope],metadata:{article_id:'KA-0001',revision:'1',hash:fp,workspace_scope:scope},...override};}
function latch(){let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};}

test('foreign source facts cannot resolve a coincident local article even with matching id/revision/hash',async()=>{
 const store=storeWithArticle();try{
  const foreign=fact('foreign',{document_id:'other-workspace-KA-0001-r1-'+fp.slice(0,12),tags:['other-workspace'],metadata:{article_id:'KA-0001',revision:'1',hash:fp,workspace_scope:'other-workspace'}});
  const wrongMetadata=fact('wrong-metadata',{metadata:{...foreign.metadata}}),wrongTag=fact('wrong-tag',{tags:['other-workspace']}),wrongPrefix=fact('wrong-prefix',{document_id:foreign.document_id});
  const provider=new MemoryProvider(store,config,{recall:async(_bank,_q,options)=>{assert.deepEqual(options.tags,[scope]);assert.equal(options.tagsMatch,'all_strict');return {results:[wrongMetadata,wrongTag,wrongPrefix],source_facts:{foreign}};}});
  const records=await provider.recall('A matching symptom');assert.deepEqual(records,[]);assert.deepEqual(resolveRecall(store.read(),records),[]);
 }finally{store.close();}
});
test('source-fact fallback is retained and merged but local omissions are explicitly flagged',async()=>{
 const store=storeWithArticle();try{
  const facts=Object.fromEntries(Array.from({length:5},(_,i)=>['f'+i,fact('f'+i,{text:i===4?'This did not fix the issue.':'A bounded observation.'})]));
  const observation=fact('observation',{source_fact_ids:Object.keys(facts),chunk_id:'chunk-one'});
  const provider=new MemoryProvider(store,config,{recall:async()=>({results:[observation],source_facts:facts,chunks:{'chunk-one':{id:'chunk-one',text:'Original retained evidence.',truncated:false}}})});
  const records=await provider.recall('test'),resolved=resolveRecall(store.read(),records);
  assert.ok(records.some(r=>r.factId==='f4'));assert.equal(resolved.length,1);assert.equal(resolved[0].memoryEvidence.sourceFacts.length,4);assert.equal(resolved[0].memoryEvidence.truncated,true);assert.equal(resolved[0].memoryEvidence.chunks[0].text,'Original retained evidence.');
  const missing=new MemoryProvider(store,config,{recall:async()=>({results:[fact('observation',{source_fact_ids:['not-returned']})],source_facts:{}})});
  assert.equal((await missing.recall('test'))[0].truncated,true);
 }finally{store.close();}
});
test('a long raw source fact marks its own clipped provenance excerpt as truncated',async()=>{
 const store=storeWithArticle();try{
  const raw=fact('raw',{text:'x'.repeat(1600)+' This did not fix the issue.'});
  const provider=new MemoryProvider(store,config,{recall:async()=>({results:[],source_facts:{raw}})});
  const [record]=await provider.recall('test');assert.equal(record.sourceFacts[0].text.length,1500);assert.equal(record.truncated,true);
 }finally{store.close();}
});
test('environment-configured live providers share one durable workspace scope and never query unscoped',async()=>{
 const one=new Store(':memory:'),two=new Store(':memory:');try{
  const envConfig={...config,workspaceScope:undefined};let sent;
  const first=new MemoryProvider(one,envConfig,{recall:async(_b,_q,options)=>{sent=options;return {results:[]};}}),reopened=new MemoryProvider(one,envConfig,{}),other=new MemoryProvider(two,envConfig,{});
  assert.equal(first.scope(),reopened.scope());assert.notEqual(first.scope(),other.scope());assert.match(first.scope(),/^lucid-workspace-/);
  await first.recall('test');assert.deepEqual(sent.tags,[first.scope()]);assert.equal(sent.tagsMatch,'all_strict');
 }finally{one.close();two.close();}
});
test('verified failed and cancelled operations without a document remain retryable; auth failures do not',async()=>{
 const store=storeWithArticle();try{
  const provider=new MemoryProvider(store,config,{getDocument:async()=>{throw Object.assign(new Error('missing document'),{statusCode:404});}});
  for(const status of ['failed','cancelled']){provider.operation=async()=>({status});const result=await provider.retentionStatus({providerOperationId:'op-original',docId:'absent-document',articleHash:fp});assert.equal(result.status,status);assert.equal(result.retryable,true);}
  provider.operation=async()=>({status:'completed'});assert.equal((await provider.retentionStatus({providerOperationId:'op-original',docId:'absent-document'})).status,'unverified');
  provider.client={getDocument:async()=>{throw Object.assign(new Error('not authorized'),{statusCode:401});}};await assert.rejects(provider.retentionStatus({providerOperationId:'op-original',docId:'absent-document'}),/not authorized/);
 }finally{store.close();}
});
test('connection changes prevent status, retry and retirement against another bank or credential',async()=>{
 const store=storeWithArticle();try{
  let current={baseUrl:'https://example.invalid',bank:'first',apiKey:'fake-one'},calls=0;
  const workflow=new CloudWorkflow(store,{read:()=>current},()=>({retentionStatus:async()=>{calls++;return {status:'succeeded'};},retryRetention:async()=>{calls++;},retireDocument:async()=>{calls++;}}));
  store.update(s=>{s.articles[0].cloudRetention={revision:1,status:'succeeded',connectionId:workflow.connectionId(),docId:'old-doc',providerOperationId:'old-operation'};});
  for(const next of [{...current,bank:'second'},{...current,apiKey:'fake-two'}]){current=next;assert.equal(workflow.retentionView(store.read().articles[0]).connectionMismatch,true);await assert.rejects(workflow.checkRetention('KA-0001',1),/another connection/);await assert.rejects(workflow.retryRetention('KA-0001',1),/another connection/);await assert.rejects(workflow.retireOlder('KA-0001',1),/current revision/);}
  assert.equal(calls,0);
 }finally{store.close();}
});
test('connection changes during status reconciliation cannot overwrite the saved status',async()=>{
 const store=storeWithArticle();try{
  let current={baseUrl:'https://example.invalid',bank:'first',apiKey:'fake-one'};const entered=latch(),reply=latch();
  const workflow=new CloudWorkflow(store,{read:()=>current},()=>({retentionStatus:async()=>{entered.release();return reply.promise;}}));
  store.update(s=>{s.articles[0].cloudRetention={revision:1,status:'processing',connectionId:workflow.connectionId(),operationId:'op',providerOperationId:'op'};});
  const pending=workflow.checkRetention('KA-0001',1);await entered.promise;current={...current,bank:'second'};reply.release({status:'succeeded',retryable:false});await assert.rejects(pending,/Connection changed/);assert.equal(store.read().articles[0].cloudRetention.status,'processing');
 }finally{store.close();}
});
test('one explicit safe retry preserves provider operation identity and cannot be repeated',async()=>{
 const store=storeWithArticle();try{
  let retries=0;const settings={read:()=>({baseUrl:'https://example.invalid',bank:'same',apiKey:'fake-one'})};
  const workflow=new CloudWorkflow(store,settings,()=>({retentionStatus:async()=>({status:'failed',retryable:true}),retryRetention:async retention=>{retries++;assert.equal(retention.providerOperationId,'original-cloud-operation');return {operation_id:'original-cloud-operation'};}}));
  store.update(s=>{s.articles[0].cloudRetention={revision:1,status:'failed',connectionId:workflow.connectionId(),operationId:'local-original',providerOperationId:'original-cloud-operation',retries:0};});
  const result=await workflow.retryRetention('KA-0001',1);assert.equal(result.status,'processing');assert.equal(result.providerOperationId,'original-cloud-operation');assert.equal(result.retries,1);await assert.rejects(workflow.retryRetention('KA-0001',1),/retry allowance/);assert.equal(retries,1);
 }finally{store.close();}
});
test('reflection previews are not saved if the case, approved revision or connection changes during generation',async()=>{
 for(const changed of ['case','article','connection']){
  const store=storeWithArticle();try{
   let current={baseUrl:'https://example.invalid',bank:'first',apiKey:'fake-one'};const entered=latch(),reply=latch();
   const workflow=new CloudWorkflow(store,{read:()=>current},()=>({recall:async()=>[{articleId:'KA-0001',revision:1,hash:fp,factId:'fact-current'}],reflect:async()=>{entered.release();return reply.promise;}}));
   store.update(s=>{s.articles[0].cloudRetention={revision:1,status:'succeeded',connectionId:workflow.connectionId()};});
   const pending=workflow.reflect('CS-1043');await entered.promise;
   if(changed==='case')store.update(s=>{s.cases.find(c=>c.id==='CS-1043').description='A different observed failure.';});
   if(changed==='article')store.update(s=>{s.articles[0].revision=2;s.articles[0].fingerprint='b'.repeat(64);});
   if(changed==='connection')current={...current,bank:'second'};
   reply.release({structured_output:{finding:'Cause remains unknown.',evidence:[{articleId:'KA-0001',revision:1,factId:'fact-current'}],conflicts:[],missingFacts:['Exact versions are unknown.'],nextSteps:['Inspect the actual events.']}});
   await assert.rejects(pending,/changed during reflection/);assert.equal(store.read().cases.find(c=>c.id==='CS-1043').reflection,undefined,changed);
  }finally{store.close();}
 }
});
test('status reconciliation verifies frozen original content and scope instead of trusting matching article metadata',async()=>{
 const store=storeWithArticle();try{
  const {hash}=await import('../server/domain.js');
  let doc={id:'expected-doc',tags:[scope],memory_unit_count:1,original_text:'different content',document_metadata:{hash:fp}};
  const provider=new MemoryProvider(store,config,{getDocument:async()=>doc});
  const retention={docId:'expected-doc',articleHash:fp,contentHash:hash('frozen approved content')};
  assert.equal((await provider.retentionStatus(retention)).status,'unverified');
  doc={...doc,original_text:'frozen approved content'};assert.equal((await provider.retentionStatus(retention)).status,'succeeded');
  doc={...doc,tags:['other-workspace']};assert.equal((await provider.retentionStatus(retention)).status,'unverified');
 }finally{store.close();}
});

test('retry completion or failure cannot overwrite a replacement retention after an in-flight article change',async()=>{
 for(const fails of [false,true]){
  const store=storeWithArticle();try{
   const entered=latch(),reply=latch();
   const workflow=new CloudWorkflow(store,{read:()=>({baseUrl:'https://example.invalid',bank:'first',apiKey:'fake-one'})},()=>({retentionStatus:async()=>({status:'failed',retryable:true}),retryRetention:async()=>{entered.release();return reply.promise;}}));
   store.update(s=>{s.articles[0].cloudRetention={revision:1,status:'failed',connectionId:workflow.connectionId(),operationId:'original',providerOperationId:'original',retries:0};});
   const pending=workflow.retryRetention('KA-0001',1);await entered.promise;
   const replacement={revision:2,status:'succeeded',connectionId:workflow.connectionId(),operationId:'replacement',providerOperationId:'replacement',retries:0};
   store.update(s=>{s.articles[0].revision=2;s.articles[0].cloudRetention=replacement;});
   if(fails)reply.release(Promise.reject(new Error('transport failure')));else reply.release({operation_id:'original'});
   await assert.rejects(pending);assert.deepEqual(store.read().articles[0].cloudRetention,replacement);assert.equal(workflow.busy,false);
  }finally{store.close();}
 }
});

test('connection change during a retry is surfaced instead of returning a current-connection success',async()=>{
 const store=storeWithArticle();try{
  let current={baseUrl:'https://example.invalid',bank:'first',apiKey:'fake-one'};const entered=latch(),reply=latch();
  const workflow=new CloudWorkflow(store,{read:()=>current},()=>({retentionStatus:async()=>({status:'failed',retryable:true}),retryRetention:async()=>{entered.release();return reply.promise;}}));
  const firstConnection=workflow.connectionId();store.update(s=>{s.articles[0].cloudRetention={revision:1,status:'failed',connectionId:firstConnection,operationId:'original',providerOperationId:'original',retries:0};});
  const pending=workflow.retryRetention('KA-0001',1);await entered.promise;current={...current,bank:'second'};reply.release({operation_id:'original'});
  await assert.rejects(pending);assert.equal(store.read().articles[0].cloudRetention.connectionId,firstConnection);assert.equal(workflow.retentionView(store.read().articles[0]).connectionMismatch,true);assert.equal(workflow.busy,false);
 }finally{store.close();}
});

test('retirement stops additional remote mutations when connection changes during its first request',async()=>{
 const store=storeWithArticle();try{
  let current={baseUrl:'https://example.invalid',bank:'first',apiKey:'fake-one'};const entered=latch(),reply=latch(),calls=[];
  const workflow=new CloudWorkflow(store,{read:()=>current},()=>({retireDocument:async id=>{calls.push(id);if(calls.length===1){entered.release();await reply.promise;}}}));
  store.update(s=>{s.articles[0].revision=3;s.articles[0].cloudRetention={revision:3,status:'succeeded',connectionId:workflow.connectionId()};s.articles[0].cloudHistory=[1,2].map(revision=>({revision,docId:'old-'+revision,status:'succeeded',connectionId:workflow.connectionId()}));});
  const pending=workflow.retireOlder('KA-0001',3);await entered.promise;current={...current,bank:'second'};reply.release();
  await assert.rejects(pending);assert.deepEqual(calls,['old-1']);assert.equal(store.read().articles[0].cloudHistory[1].retiredAt,undefined);assert.equal(workflow.busy,false);
 }finally{store.close();}
});

test('reflection generation schema permits only current recalled citation tuples',async()=>{
 const {scopedReflectionSchema,validateReflection}=await import('../server/reflection.js');
 const candidates=[{id:'KA-0001',revision:2,fingerprint:fp,fix:'Inspect evidence.'},{id:'KA-0002',revision:1,fingerprint:'b'.repeat(64),fix:'Check limits.'}];
 const records=[{articleId:'KA-0001',revision:2,hash:fp,factId:'current-one'},{articleId:'KA-0001',revision:1,hash:fp,factId:'stale'},{articleId:'KA-0001',revision:2,hash:'c'.repeat(64),factId:'wrong-hash'},{articleId:'KA-0002',revision:1,hash:'b'.repeat(64),factId:'current-two'}];
 const variants=scopedReflectionSchema(candidates,records).properties.evidence.items.anyOf;
 assert.deepEqual(variants.map(x=>[x.properties.articleId.enum,x.properties.revision.enum,x.properties.factId.enum]),[[['KA-0001'],[2],['current-one']],[['KA-0002'],[1],['current-two']]]);
 const body={finding:'Cause remains unconfirmed.',conflicts:[],missingFacts:['Affected versions'],nextSteps:['Inspect evidence.']};
 assert.throws(()=>validateReflection({...body,evidence:[{articleId:'KA-0001',revision:2,factId:'current-two'}]},candidates,records),/unavailable/);
 assert.throws(()=>scopedReflectionSchema(candidates,[]),/No verified current citation/);
});
