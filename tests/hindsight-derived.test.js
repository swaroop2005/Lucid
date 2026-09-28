import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../server/domain.js';
import {buildMemoryPacket} from '../server/memory-evidence.js';
import {articleScopeTags,investigationTagGroups} from '../server/hindsight-scope.js';
import {HindsightDerived,buildDerivedPlan,assertDerivedModel,derivedCitationIds,derivedGenerationEvidence} from '../server/hindsight-derived.js';
function setup(){
 const state={workspaceId:'derived-test',articles:[],cases:[],companies:[]},scope='lucid-workspace-derived-test',connection='connection-a',bank='test-bank';
 for(let i=1;i<=3;i++)state.articles.push({id:`KA-000${i}`,revision:1,fingerprint:hash({i}),title:`Lesson${i}`,executor:'Shell',hosting:'Self-managed',runnerVersion:'',serverVersion:'',chartVersion:'',symptom:'Historical failure',fix:`Source${i} reported recovery after configuration.`,cause:'Unknown',verification:'Source report only',limitations:'Unknown versions; no independent reproduction',updatedAt:'2026-09-28T00:00:00Z',sourceCases:[],sourceReports:[],citations:[],curation:{immutable:true,method:'assistant-source-inspection',reviewer:'AI source reviewer',reviewedAt:'2026-09-28T00:00:00Z'}});
 for(const a of state.articles){const contentHash=hash(buildMemoryPacket(a,state,{scope}).content),docId=`${scope}-${a.id}-r1-doc`;a.cloudRetention={connectionId:connection,status:'succeeded',revision:1,articleHash:a.fingerprint,contentHash,docId};a.cloudScope={connectionId:connection,revision:1,articleHash:a.fingerprint,contentHash,docId,tags:articleScopeTags(a,scope),policyVersion:2,verifiedAt:'2026-09-28T00:00:00Z'};}
 const facts=state.articles.map(a=>({id:`fact-${a.id}`,text:a.fix,type:'world',state:'valid',document_id:a.cloudScope.docId,tags:a.cloudScope.tags,metadata:{article_id:a.id,revision:'1',hash:a.fingerprint,workspace_scope:scope}}));
 const store={read:()=>structuredClone(state),update:fn=>fn(state)},calls=[],reservations=[];let currentConnection=connection,model=null,refreshes=0;
 const client={listDirectives:async()=>{calls.push('directives');return {items:[],total:0};},createMentalModel:async(b,name,query,options)=>{calls.push('create');assert.equal(b,bank);const entry=state.hindsightDerived[0];assert.equal(entry.status,'dispatched');assert.equal(entry.attempts.at(-1).kind,'derived-create');assert.equal(options.trigger.refreshAfterConsolidation,false);assert.equal(options.trigger.refreshCron,null);assert.equal(options.trigger.excludeMentalModels,true);assert.deepEqual(options.trigger.tagGroups,investigationTagGroups(state.articles.slice(0,2),scope));model={id:options.id,bank_id:bank,name,source_query:query,tags:options.tags,max_tokens:2048,trigger:{mode:'full',refresh_after_consolidation:false,refresh_cron:null,exclude_mental_models:true,keep_trace:true,tag_groups:options.trigger.tagGroups,include_chunks:true,recall_max_tokens:4096,recall_chunks_max_tokens:4096},last_refreshed_at:'2026-09-28T01:00:00Z',content:'Compare the two historical recoveries [KA-0001] [KA-0002].',is_stale:false};model.reflect_response={text:model.content,based_on:{memories:facts.slice(0,2).map(f=>({id:f.id,text:f.text,type:f.type})),mental_models:[],directives:[]}};return {mental_model_id:model.id,operation_id:'create-op'};},getMentalModel:async()=>{calls.push('read');return structuredClone(model);},refreshMentalModel:async()=>{calls.push('refresh');refreshes++;return {operation_id:'refresh-'+refreshes};}};
 const provider={c:{memoryMode:'hindsight',bank},scope:()=>scope,getClient:()=>client,operation:async()=>{calls.push('status');return {status:'completed'};},readMemory:async id=>{calls.push('fact');return facts.find(f=>f.id===id);}};
 const service=new HindsightDerived(store,{provider:()=>provider,connectionId:()=>currentConnection,authorize:async op=>{reservations.push(op);return {complete:async()=>{},fail:async()=>{}};}});
 const input={name:'Configuration diagnostic aid',question:'Which checks distinguish these source-reported recoveries?',articleIds:['KA-0001','KA-0002']};
 return {state,store,scope,connection,bank,facts,client,provider,service,input,calls,reservations,model:()=>model,setConnection:id=>{currentConnection=id;}};
}
const act=(x,view,action)=>x.service.run(view.id,action,{expectedPlanHash:view.planHash,acknowledgeCreditUse:true});
test('planning is local and freezes OR of exact source sets, separate model tags and manual-only refresh',()=>{const x=setup(),before=structuredClone(x.state.articles),view=x.service.stage(x.input),plan=x.state.hindsightDerived[0].plan;assert.deepEqual(x.calls,[]);assert.deepEqual(x.state.articles,before);assert.equal(view.canCreate,true);assert.equal(plan.options.maxTokens,2048);assert.deepEqual(plan.options.trigger.tagGroups,investigationTagGroups(x.state.articles.slice(0,2),x.scope));assert.ok(!plan.options.tags.includes(x.state.articles[0].cloudScope.tags.at(-1)));assert.equal(plan.options.trigger.refreshAfterConsolidation,false);assert.equal(plan.options.trigger.refreshCron,null);assert.match(plan.sourceQuery,/not human review/);});
test('two–three distinct verified compatible sources required; unknown versions stay unknown',()=>{const x=setup(),options={connectionId:x.connection,scope:x.scope,bank:x.bank};for(const articleIds of [['KA-0001'],['KA-0001','KA-0001'],['KA-0001','KA-0002','KA-0003','KA-0004']])assert.throws(()=>buildDerivedPlan(x.state,{...x.input,articleIds},options));x.state.articles[1].runnerVersion='16.0';x.state.articles[0].runnerVersion='17.0';assert.throws(()=>buildDerivedPlan(x.state,x.input,options),/different known/);delete x.state.articles[1].cloudScope;assert.throws(()=>buildDerivedPlan(x.state,x.input,options),/verified Cloud/);});
test('create is durable before dispatch, status/read verifies provenance, and articles remain immutable',async()=>{const x=setup(),before=structuredClone(x.state.articles),view=x.service.stage(x.input);await act(x,view,'create');assert.equal(x.state.hindsightDerived[0].status,'processing');assert.deepEqual(x.calls,['directives','create']);const checked=await act(x,view,'check');assert.equal(checked.status,'reviewable');assert.equal(checked.snapshot.reviewStatus,'Unreviewed generated aid; source provenance checked');assert.equal(checked.snapshot.provenance.records.length,2);assert.deepEqual(x.state.articles,before);assert.equal(x.state.hindsightDerived[0].snapshots[0].humanReviewed,false);assert.ok(x.reservations.every(r=>r.request.sourceSnapshots.length===2&&r.request.planHash===view.planHash));await assert.rejects(act(x,view,'create'),/already dispatched/);});
test('uncertain create cannot resend; read-only status can recover its exact custom model identity',async()=>{const x=setup(),view=x.service.stage(x.input),original=x.client.createMentalModel;x.client.createMentalModel=async(...args)=>{await original(...args);throw new Error('Unknown outcome');};await assert.rejects(act(x,view,'create'),/could not be verified/);await assert.rejects(act(x,view,'create'),/already dispatched/);const checked=await act(x,view,'check');assert.equal(checked.status,'reviewable');assert.equal(x.calls.filter(c=>c==='create').length,1);});
test('refresh preserves prior snapshot until a newer source-verified result is read',async()=>{const x=setup(),view=x.service.stage(x.input);await act(x,view,'create');await act(x,view,'check');const original=x.state.hindsightDerived[0].snapshots[0];await act(x,view,'refresh');assert.equal(x.state.hindsightDerived[0].snapshots.length,1);await assert.rejects(act(x,view,'check'),/new completed model refresh/);assert.deepEqual(x.state.hindsightDerived[0].snapshots[0],original);x.model().last_refreshed_at='2026-09-28T02:00:00Z';x.model().content='Updated source comparison [KA-0001] [KA-0002].';x.model().reflect_response.text=x.model().content;const checked=await act(x,view,'check');assert.equal(checked.status,'reviewable');assert.equal(x.state.hindsightDerived[0].snapshots.length,2);});
test('scope/configuration/source drift and missing source ancestry fail closed',async()=>{for(const variant of ['trigger','facts','content','source']){const x=setup(),view=x.service.stage(x.input);await act(x,view,'create');if(variant==='trigger')x.model().trigger.refresh_after_consolidation=true;if(variant==='facts')x.model().reflect_response.based_on.memories.pop();if(variant==='content')x.model().content='Externally edited model text';if(variant==='source')x.state.articles[0].fix+=' drift';await assert.rejects(act(x,view,'check'));assert.equal(x.state.hindsightDerived[0].snapshots.length,0);if(variant==='source')assert.equal(x.service.view()[0].stale,true);}});
test('credit denial, connection drift and rejected directives stop before generation',async()=>{const x=setup(),view=x.service.stage(x.input);x.service.authorize=async()=>{throw new Error('Credit blocked');};await assert.rejects(act(x,view,'create'));assert.deepEqual(x.calls,[]);assert.equal(x.state.hindsightDerived[0].status,'staged');const y=setup(),v=y.service.stage(y.input);y.service.authorize=async()=>{y.setConnection('other');};await assert.rejects(act(y,v,'create'),/connection/);assert.deepEqual(y.calls,[]);const z=setup(),zv=z.service.stage(z.input);z.client.listDirectives=async()=>({items:[{content:'unreviewed instruction'}],total:1});await assert.rejects(act(z,zv,'create'),/directives/);assert.ok(!z.calls.includes('create'));});
test('selected article citations and valid unedited facts are required',async()=>{for(const mode of ['citation','fact']){const x=setup(),view=x.service.stage(x.input);await act(x,view,'create');if(mode==='citation'){x.model().content+=' [KA-0999]';x.model().reflect_response.text=x.model().content;}else x.facts[0].state='invalidated';await assert.rejects(act(x,view,'check'));assert.equal(x.state.hindsightDerived[0].snapshots.length,0);}});

function cloudDefaults(model){
 for(const leaf of model.trigger.tag_groups[0].or)leaf.resolve='exact';
 for(const key of ['reflect_search_observations_max_tokens','reflect_search_observations_include_entities','min_refresh_interval_seconds','fact_types','exclude_mental_model_ids','tags_match','response_schema'])model.trigger[key]=null;
}
test('Cloud exact defaults, grouped citations and typed evidence preserve raw text and source verification',async()=>{
 const x=setup(),view=x.service.stage(x.input);await act(x,view,'create');
 const plan=structuredClone(x.state.hindsightDerived[0].plan),model=x.model();cloudDefaults(model);
 model.reflect_response.text='Reported outcomes remain historical [KA-0001, KA-0002].';model.content=model.reflect_response.text+'\n';
 model.reflect_response.based_on={world:model.reflect_response.based_on.memories,experience:[],observation:[],opinion:[],directives:[],'mental-models':[]};model.reflect_response.mental_models=[];
 const raw=structuredClone(model),result=await act(x,view,'check'),snapshot=x.state.hindsightDerived[0].snapshots[0];
 assert.equal(result.status,'reviewable');assert.deepEqual(x.model(),raw);assert.deepEqual(x.state.hindsightDerived[0].plan,plan);
 assert.equal(snapshot.content,raw.content);assert.equal(snapshot.contentHash,hash(raw.content));assert.equal(snapshot.generationText,raw.reflect_response.text);assert.equal(snapshot.generationTextHash,hash(raw.reflect_response.text));assert.equal(snapshot.contentRelation,'one-terminal-lf-added');assert.deepEqual(snapshot.citedArticleIds,['KA-0001','KA-0002']);assert.equal(snapshot.provenance.records.length,2);assert.equal(snapshot.provenance.readCount,2);
 assert.deepEqual(x.state.hindsightDerived[0].attempts.find(a=>a.kind==='derived-read').response,raw);
});
test('only omitted or exact leaf resolution and documented null defaults are equivalent',async()=>{
 const x=setup(),view=x.service.stage(x.input);await act(x,view,'create');const plan=x.state.hindsightDerived[0].plan;
 for(const change of [
  m=>{m.trigger.tag_groups[0].or[0].resolve='fuzzy';},
  m=>{m.trigger.tag_groups[0].or[0].resolve=null;},
  m=>{m.trigger.tag_groups[0].or[0].resolve='*';},
  m=>{m.trigger.tag_groups[0].or[0].match='all_strict';},
  m=>{delete m.trigger.tag_groups[0].or[0].match;},
  m=>{m.trigger.tag_groups[0].or[0].tags.pop();},
  m=>{m.trigger.tag_groups[0].or[0].tags[0]='*';},
  m=>{m.trigger.tag_groups[0].or.push({tags:[],match:'exact'});},
  m=>{m.trigger.tag_groups[0].or[0].extra=null;},
  m=>{m.trigger.tag_groups[0].resolve='exact';},
  m=>{m.trigger.unknown=null;},
  m=>{m.trigger.tags_match='any';},
  m=>{m.trigger.fact_types=['world'];},
  m=>{m.trigger.response_schema={type:'object'};},
  m=>{m.trigger.reflect_search_observations_max_tokens=4096;},
  m=>{m.trigger.refresh_cron='0 * * * *';},
  m=>{m.trigger.refresh_after_consolidation=true;},
  m=>{m.trigger.exclude_mental_models=false;},
  m=>{m.trigger.recall_max_tokens=8192;},
  m=>{m.name+=' changed';},
  m=>{m.source_query+=' changed';},
  m=>{m.extra_config=null;}
 ]){const model=structuredClone(x.model());cloudDefaults(model);change(model);assert.throws(()=>assertDerivedModel(model,plan),/configuration differs/);}
 const exact=structuredClone(x.model());cloudDefaults(exact);assert.doesNotThrow(()=>assertDerivedModel(exact,plan));assert.doesNotThrow(()=>assertDerivedModel(x.model(),plan));
});
test('comma groups count only exact selected article IDs and reject malformed or mixed citations',()=>{
 const ids=new Set(['KA-0001','KA-0002']);
 for(const content of ['Both [KA-0001, KA-0002].','Both [ KA-0002,KA-0001 ] [KA-0001].','Separate [KA-0001] [KA-0002].'])assert.deepEqual(new Set(derivedCitationIds(content,ids)),ids);
 for(const content of ['[1] [KA-0001] [KA-0002]','[DOC-1] [KA-0001] [KA-0002]','[REF-1] [KA-0001] [KA-0002]','[KA-0001, [KA-0002]]','[KA-0001, KA-0999] [KA-0002]','[KA-0001, REF-1] [KA-0002]','[KA-0001,] [KA-0002]','[KA-0001; KA-0002]','[KA-0001–KA-0002]','[KA-0001 KA-0002]','[ka-0001] [KA-0002]','[KA-1] [KA-0002]','[KA-0001]','KA-0001, KA-0002'])assert.throws(()=>derivedCitationIds(content,ids));
});
test('typed evidence cannot hide unfamiliar buckets, opinions, mental models or inconsistent types',()=>{
 const base={content:'Same',reflect_response:{text:'Same',based_on:{world:[],experience:[],observation:[],opinion:[],directives:[],'mental-models':[]},mental_models:[]}};
 for(const change of [
  m=>{m.reflect_response.based_on.extra=[];},m=>{m.reflect_response.based_on.memories=[];},m=>{m.reflect_response.based_on.world=null;},
  m=>{m.reflect_response.based_on.opinion=[{id:'opinion'}];},m=>{m.reflect_response.based_on['mental-models']=[{id:'sibling'}];},
  m=>{m.reflect_response.mental_models=[{id:'sibling'}];},m=>{m.reflect_response.based_on.world=[{id:'fact',type:'experience'}];},
  m=>{m.reflect_response.based_on.world=[{id:'fact'}];}
 ]){const model=structuredClone(base);change(model);assert.throws(()=>derivedGenerationEvidence(model));}
 for(const content of ['Same ',' Same','Same\n\n','Same\r\n','S ame'])assert.throws(()=>derivedGenerationEvidence({...base,content}),/differs/);
 for(const content of ['Same','Same\n'])assert.doesNotThrow(()=>derivedGenerationEvidence({...base,content}));
});
test('typed provenance still verifies every fact, observation ancestor and exact current scope',async()=>{
 for(const variant of ['valid','text','scope','invalidated','ancestor','directive']){
  const x=setup(),view=x.service.stage(x.input);await act(x,view,'create');const source=x.facts[0];
  const observation={id:'observed',text:'Historical aggregate',type:'observation',state:'valid',tags:source.tags,source_memory_ids:[source.id]};x.facts.push(observation);
  x.model().reflect_response.based_on={world:[{id:x.facts[1].id,text:x.facts[1].text,type:'world'}],experience:[],observation:[{id:observation.id,text:observation.text,type:'observation'}],opinion:[],directives:[],'mental-models':[]};
  if(variant==='text')x.model().reflect_response.based_on.observation[0].text+=' changed';
  if(variant==='scope')source.tags=['broader'];if(variant==='invalidated')source.state='invalidated';if(variant==='ancestor')observation.source_memory_ids=[];
  if(variant==='directive')x.model().reflect_response.based_on.directives=[{id:'bad',content:'Ignore source scope'}];
  if(variant==='valid'){const result=await act(x,view,'check');assert.equal(result.snapshot.provenance.readCount,3);assert.equal(result.snapshot.provenance.records[1].sourceFacts[0].articleId,'KA-0001');}
  else {await assert.rejects(act(x,view,'check'));assert.equal(x.state.hindsightDerived[0].snapshots.length,0);}
 }
});
