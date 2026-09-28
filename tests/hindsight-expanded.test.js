import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/db.js';
import {approveKnowledge,requireCase,publicSnapshot} from '../server/domain.js';
import {MemoryProvider} from '../server/providers.js';
import {CloudWorkflow} from '../server/cloud-workflow.js';
import {reflectionStatus,validateReflection} from '../server/reflection.js';
const settings={read:()=>({baseUrl:'https://example.invalid',apiKey:'test-key',bank:'test-bank'})};
function setup(){const s=new Store(':memory:');const a=s.update(state=>{const c=requireCase(state,'CS-1042');c.resolution={fix:'Inspect verified liveness events.'};return approveKnowledge(state,c.id,{title:'Liveness timeout review',fix:'Inspect probe events, then test the reviewed timeout only in a matching environment.',cause:'',verification:'Historical recovery was reported; current case still needs verification.',limitations:'Exact affected versions unknown; do not infer root cause.',reviewer:'Automated regression fixture',reviewed:true});});return {s,a};}
test('async retention freezes evidence, survives restart and confirms exact scoped content',async()=>{
 const {s,a}=setup();let sent,operation='pending',retains=0;
 const factory=(store,c)=>{const p=new MemoryProvider(store,c,{retain:async(_bank,content,o)=>{retains++;sent={content,...o};return {async:true,operation_id:o.operationId};},getDocument:async()=>({id:sent.documentId,tags:sent.tags,memory_unit_count:operation==='completed'?2:0,original_text:sent.content,document_metadata:{}})});p.operation=async()=>({status:operation});return p;};
 let cloud=new CloudWorkflow(s,settings,factory);const first=await cloud.retain(a.id,1);assert.equal(first.status,'processing');assert.equal(first.providerOperationId,sent.operationId);assert.match(first.docId,/-p[a-f0-9]{12}$/);
 s.update(state=>state.cases[0].attempts.push({step:'Changed after dispatch',result:'Failed',evidence:'New observation'}));
 cloud=new CloudWorkflow(s,settings,factory);assert.equal((await cloud.retain(a.id,1)).providerOperationId,first.providerOperationId);assert.equal(retains,1);assert.equal((await cloud.checkRetention(a.id,1)).status,'processing');operation='completed';assert.equal((await cloud.checkRetention(a.id,1)).status,'succeeded');assert.equal(publicSnapshot(s.read(),{}).cloudPackets,undefined);s.close();
});
test('only verified terminal operations can retry, once, without resending content',async()=>{
 const {s,a}=setup();let state='failed',retains=0,retries=0;
 const factory=(store,c)=>{const p=new MemoryProvider(store,c,{retain:async()=>{retains++;throw new Error('uncertain transport');},getDocument:async()=>null});p.operation=async(action,id)=>{if(action==='retry'){retries++;state='pending';return {operation_id:id};}return {status:state};};return p;};
 const cloud=new CloudWorkflow(s,settings,factory);await assert.rejects(cloud.retain(a.id,1),/could not be verified/);assert.equal((await cloud.checkRetention(a.id,1)).retryable,true);assert.equal((await cloud.retryRetention(a.id,1)).status,'processing');assert.equal(retains,1);assert.equal(retries,1);state='failed';assert.equal((await cloud.checkRetention(a.id,1)).retryable,false);await assert.rejects(cloud.retryRetention(a.id,1),/retry allowance/);s.close();
});
test('reflection validates recalled IDs and becomes stale after a case or connection change',async()=>{
 const {s,a}=setup();const record={articleId:a.id,revision:a.revision,hash:a.fingerprint,factId:'fact-current'};
 const factory=()=>({recall:async()=>[record],reflect:async()=>({structured_output:{finding:'The historical workaround remains conditional; cause is unknown.',evidence:[{articleId:a.id,revision:1,factId:'fact-current'}],conflicts:[],missingFacts:['Runner version'],nextSteps:['Inspect the actual probe events.']}})});
 const cloud=new CloudWorkflow(s,settings,factory);s.update(state=>state.articles[0].cloudRetention={revision:1,status:'succeeded',connectionId:cloud.connectionId()});
 const result=await cloud.reflect('CS-1043');assert.equal(result.stale,false);assert.equal(result.preview.reviewRequired,true);assert.equal(s.read().cases.find(c=>c.id==='CS-1043').resolution,null);
 s.update(state=>state.cases.find(c=>c.id==='CS-1043').runnerVersion='18.2.0');assert.equal(cloud.reflectionStatus('CS-1043').stale,true);
 assert.equal(reflectionStatus(s.read(),'CS-1043',true,'other-connection').stale,true);
 assert.throws(()=>validateReflection({finding:'Bad citation',evidence:[{articleId:a.id,revision:1,factId:'foreign'}],conflicts:[],missingFacts:[],nextSteps:[]},[a],[record]),/unavailable/);s.close();
});
test('reflection refuses to save a response after the case changes during generation',async()=>{
 const {s,a}=setup();const record={articleId:a.id,revision:1,hash:a.fingerprint,factId:'fact-current'};let started,release;const wait=new Promise(r=>release=r),ready=new Promise(r=>started=r);
 const cloud=new CloudWorkflow(s,settings,()=>({recall:async()=>[record],reflect:async()=>{started();await wait;return {structured_output:{finding:'Review required.',evidence:[{articleId:a.id,revision:1,factId:'fact-current'}],conflicts:[],missingFacts:[],nextSteps:[]}};}}));
 s.update(state=>state.articles[0].cloudRetention={revision:1,status:'succeeded',connectionId:cloud.connectionId()});
 const pending=cloud.reflect('CS-1043');await ready;s.update(state=>state.cases.find(c=>c.id==='CS-1043').description='A materially different report was recorded.');release();await assert.rejects(pending,/changed during reflection/);assert.equal(s.read().cases.find(c=>c.id==='CS-1043').reflection,undefined);s.close();
});
test('retirement only removes the active tag from recorded older owned documents',async()=>{
 const {s,a}=setup();let tags;const cloud=new CloudWorkflow(s,settings,(store,c)=>new MemoryProvider(store,c,{getDocument:async(_bank,id)=>({id,tags:[c.workspaceScope,'product:gitlab-runner']}),updateDocument:async(_bank,_id,opts)=>{tags=opts.tags;}}));const scope=`lucid-workspace-${s.read().workspaceId}`;
 s.update(state=>{Object.assign(state.articles[0],{revision:2,cloudRetention:{revision:2,status:'succeeded',connectionId:cloud.connectionId()},cloudHistory:[{revision:1,status:'succeeded',docId:scope+'-KA-0001-r1-old',connectionId:cloud.connectionId()}]});});
 assert.equal((await cloud.retireOlder(a.id,2)).retired,1);assert.ok(!tags.includes(scope));assert.ok(tags.includes(scope+'-retired'));assert.ok(s.read().articles[0].cloudHistory[0].retiredAt);s.close();
});

test('reflection generation schema permits only freshly verified article revision and fact tuples',async()=>{
 const {scopedReflectionSchema}=await import('../server/reflection.js');
 const candidates=[{id:'KA-0001',revision:2,fingerprint:'current'},{id:'KA-0002',revision:1,fingerprint:'other'}];
 const records=[{articleId:'KA-0001',revision:2,hash:'current',factId:'valid-one'},{articleId:'KA-0001',revision:1,hash:'old',factId:'stale'},{articleId:'KA-0002',revision:1,hash:'other',factId:'valid-two'}];
 const choices=scopedReflectionSchema(candidates,records).properties.evidence.items.anyOf;
 assert.equal(choices.length,2);assert.deepEqual(choices[0].properties.articleId.enum,['KA-0001']);assert.deepEqual(choices[0].properties.revision.enum,[2]);assert.deepEqual(choices[0].properties.factId.enum,['valid-one']);assert.deepEqual(choices[1].properties.factId.enum,['valid-two']);assert.throws(()=>scopedReflectionSchema(candidates,[]),/No verified/);
});

test('Cloud nested citation JSON strings are decoded and still strictly validated',()=>{
 const a={id:'KA-0001',revision:1,fingerprint:'current',fix:'Review events'};
 const records=[{articleId:a.id,revision:1,hash:'current',factId:'verified'}];
 const raw={finding:'Cause unknown.',evidence:[JSON.stringify({articleId:a.id,revision:1,factId:'verified'})],conflicts:[],missingFacts:[],nextSteps:[]};
 assert.equal(validateReflection(raw,[a],records).evidence[0].factId,'verified');
 assert.throws(()=>validateReflection({...raw,evidence:[JSON.stringify({articleId:a.id,revision:1,factId:'foreign'})]},[a],records),/unavailable/);
 assert.throws(()=>validateReflection({...raw,evidence:['not JSON']},[a],records));
 assert.throws(()=>validateReflection({...raw,evidence:[JSON.stringify({articleId:a.id,revision:1,factId:'verified',extra:'no'})]},[a],records));
});
