import {randomUUID} from 'node:crypto';
import {DomainError,hash,requireArticle} from './domain.js';
import {MemoryProvider} from './providers.js';
export const CURATED_BATCH_MAX_ARTICLES=5;
export const CURATED_BATCH_MAX_BYTES=40_000;
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const itemInput=item=>({...item.packet,document_id:item.docId,observation_scopes:'combined'});
export const curatedBatchRequest=batch=>({items:batch.items.map(itemInput),async:true,operation_id:batch.operationId});
const batchBytes=batch=>bytes(curatedBatchRequest(batch));
const manifestHash=manifest=>{const {manifestHash:_hash,...content}=manifest;return hash(content);};
function requireManifest(manifest){
 if(manifest?.schemaVersion!==1||manifest.manifestHash!==manifestHash(manifest)||!Array.isArray(manifest.batches))throw new DomainError('Frozen retention manifest hash is invalid.',409);
 const ids=new Set(),operations=new Set(),batchIds=new Set();
 for(const batch of manifest.batches){
  if(!batch.id||batchIds.has(batch.id)||!batch.operationId||operations.has(batch.operationId)||!batch.items?.length||batch.items.length>CURATED_BATCH_MAX_ARTICLES||batchBytes(batch)>CURATED_BATCH_MAX_BYTES||batch.bytes!==batchBytes(batch))throw new DomainError('Frozen batch identity or bounds are invalid.',409);
  operations.add(batch.operationId);batchIds.add(batch.id);
  for(const item of batch.items){if(ids.has(item.articleId)||item.contentHash!==hash(item.packet.content)||item.articleHash!==item.packet.metadata.hash||item.packetHash!==item.packet.metadata.packet_hash||item.packet.metadata.workspace_scope!==manifest.scope||!item.packet.tags.includes(manifest.scope)||!item.docId.startsWith(manifest.scope+'-'))throw new DomainError('Frozen article packet identity is invalid.',409);ids.add(item.articleId);}
 }
 if(manifest.totalArticles!==ids.size||manifest.totalBytes!==manifest.batches.reduce((n,b)=>n+b.bytes,0))throw new DomainError('Frozen manifest totals do not match.',409);
 return manifest;
}
export function buildCuratedRetentionManifest(state,{connectionId,bank,scope,articleIds,now=new Date().toISOString()}={}){
 if(!state.workspaceId||scope!==`lucid-workspace-${state.workspaceId}`||!connectionId||!bank)throw new DomainError('A current connection and workspace scope are required.');
 const selected=articleIds||state.articles.filter(a=>a.curation?.immutable).map(a=>a.id);
 if(selected.length>500||new Set(selected).size!==selected.length)throw new DomainError('Select at most500 distinct curated articles.');
 const provider=new MemoryProvider({read:()=>state},{memoryMode:'offline',workspaceScope:scope}),items=[],skipped=[];
 for(const id of selected){
  const a=requireArticle(state,id);if(!a.curation?.immutable)throw new DomainError('Only immutable source-reviewed articles can enter this batch.');
  if(a.cloudRetention?.revision===a.revision){skipped.push({articleId:id,reason:a.cloudRetention.connectionId===connectionId&&a.cloudRetention.status==='succeeded'?'already-verified':'existing-retention-requires-status-review'});continue;}
  const {packet,docId}=provider.prepareRetention(a);items.push({articleId:a.id,revision:a.revision,articleHash:a.fingerprint,packetHash:packet.metadata.packet_hash,contentHash:hash(packet.content),docId,packet});
 }
 const batches=[];let current;
 for(const item of items){
  if(!current||current.items.length>=CURATED_BATCH_MAX_ARTICLES||batchBytes({...current,items:[...current.items,item]})>CURATED_BATCH_MAX_BYTES){current={id:'batch-'+String(batches.length+1).padStart(3,'0'),operationId:randomUUID(),items:[]};batches.push(current);}
  current.items.push(item);current.bytes=batchBytes(current);
  if(current.bytes>CURATED_BATCH_MAX_BYTES)throw new DomainError('One article exceeds the bounded batch request.');
 }
 const manifest={schemaVersion:1,id:randomUUID(),createdAt:now,workspaceId:state.workspaceId,connectionId,bank,scope,batches,skipped,totalArticles:items.length,totalBytes:batches.reduce((n,b)=>n+b.bytes,0),policy:'Explicit budgeted dispatch only; no retry or automatic mental-model/page creation. Source review is not human review or reproduction.'};
 manifest.manifestHash=manifestHash(manifest);return requireManifest(manifest);
}

export class CuratedRetentionWorkflow{
 constructor(store,provider,{connectionId,reserve}={}){this.store=store;this.provider=provider;this.connectionId=connectionId;this.reserve=reserve;this.busy=false;}
 guard(state,manifest,batch){
  requireManifest(manifest);
  if(this.connectionId?.()!==manifest.connectionId||this.provider.c.bank!==manifest.bank||this.provider.scope()!==manifest.scope||state.workspaceId!==manifest.workspaceId)throw new DomainError('Connection or workspace changed; no additional Cloud operation was sent.',409);
  for(const item of batch.items){const a=requireArticle(state,item.articleId);if(!a.curation?.immutable||a.revision!==item.revision||a.fingerprint!==item.articleHash||hash(this.provider.prepareRetention(a))!==hash({packet:item.packet,docId:item.docId}))throw new DomainError('Published article or evidence changed after the batch was frozen.',409);}
 }
 lookup(planId,batchId){const state=this.store.read(),plan=state.curatedRetentionPlans?.[planId];if(!plan)throw new DomainError('Staged retention manifest not found.',404);const batch=plan.manifest.batches.find(b=>b.id===batchId),record=plan.batches.find(b=>b.id===batchId);if(!batch||!record)throw new DomainError('Staged retention batch not found.',404);this.guard(state,plan.manifest,batch);return {manifest:plan.manifest,batch,record};}
 stage(manifest){
  requireManifest(manifest);
  return this.store.update(state=>{
   this.guard(state,manifest,{items:[]});for(const batch of manifest.batches)this.guard(state,manifest,batch);
   state.curatedRetentionPlans??={};const existing=state.curatedRetentionPlans[manifest.id];if(existing){if(existing.manifest.manifestHash!==manifest.manifestHash)throw new DomainError('A staged manifest cannot be changed.',409);return {id:manifest.id,manifestHash:manifest.manifestHash,batches:existing.batches};}
   for(const item of manifest.batches.flatMap(b=>b.items)){const a=requireArticle(state,item.articleId);if(a.cloudRetention?.revision===item.revision)throw new DomainError('Article already has a retention attempt; check its status instead.',409);}
   state.curatedRetentionPlans[manifest.id]={manifest:structuredClone(manifest),batches:manifest.batches.map(b=>({id:b.id,operationId:b.operationId,status:'staged'}))};return {id:manifest.id,manifestHash:manifest.manifestHash,batches:state.curatedRetentionPlans[manifest.id].batches};
  });
 }
 async authorize(details){if(typeof this.reserve!=='function')throw new DomainError('An explicit budget reservation is required before Cloud access.',400);await this.reserve(details);}
 async dispatch(planId,batchId,{expectedPlanHash,acknowledgeCreditUse}={}){
  if(this.busy)throw new DomainError('Another batch action is running.',409);
  const {manifest,batch,record}=this.lookup(planId,batchId);
  if(acknowledgeCreditUse!==true||expectedPlanHash!==manifest.manifestHash)throw new DomainError('Explicit credit acknowledgement and frozen plan hash are required.');
  if(record.status!=='staged')throw new DomainError('This batch already had a dispatch attempt. Only status reads are allowed.',409);
  this.busy=true;
  try{
   await this.authorize({kind:'retain-batch',planId,batchId,operationId:batch.operationId,manifestHash:manifest.manifestHash,articleCount:batch.items.length,maxRequestBytes:batch.bytes,maxMetadataCalls:1});
   this.store.update(state=>{
    this.guard(state,manifest,batch);const r=state.curatedRetentionPlans[planId].batches.find(b=>b.id===batchId);if(r.status!=='staged')throw new DomainError('Batch already dispatched.',409);
    for(const item of batch.items){const a=requireArticle(state,item.articleId);if(a.cloudRetention?.revision===item.revision)throw new DomainError('Article already has a retention attempt.',409);}
    const at=new Date().toISOString();Object.assign(r,{status:'dispatched',dispatchedAt:at});state.cloudOperations??=[];state.cloudOperations.push({id:batch.operationId,at,kind:'retain-batch',status:'dispatched',planId,batchId});state.cloudPackets??={};
    for(const item of batch.items){const a=requireArticle(state,item.articleId);if(a.cloudRetention?.docId){a.cloudHistory??=[];a.cloudHistory.push(a.cloudRetention);}state.cloudPackets[`${manifest.connectionId}:${a.id}:${a.revision}`]={packet:item.packet,docId:item.docId};a.cloudRetention={connectionId:manifest.connectionId,revision:item.revision,articleHash:item.articleHash,packetHash:item.packetHash,contentHash:item.contentHash,status:'dispatched',operationId:batch.operationId,providerOperationId:batch.operationId,docId:item.docId,retryable:false,retries:0,batchManaged:true,planId,batchId};}
   });
   const client=this.provider.getClient();
   const models=await client.listMentalModels(manifest.bank,{detail:'metadata',limit:1,signal:AbortSignal.timeout(20000)});
   this.guard(this.store.read(),manifest,batch);
   if(models.total!==0)throw new DomainError('Existing mental models or pages require separate refresh-policy review before retention. No retain request was sent.',409);
   const response=await client.retainBatch(manifest.bank,batch.items.map(itemInput),{async:true,operationId:batch.operationId,signal:AbortSignal.timeout(60000)});
   this.guard(this.store.read(),manifest,batch);
   // A provider acceptance is not document verification, even for a synchronous response.
   return this.update(planId,batchId,manifest,batch,{status:'processing',providerOperationId:response.operation_id||batch.operationId,note:'Batch accepted; verify every document before treating retention as complete.'});
  }catch(error){this.fail(planId,batchId,batch.operationId);throw error instanceof DomainError?error:new DomainError('Batch dispatch could not be verified. No retry was sent; resume with status reads only.',502);}finally{this.busy=false;}
 }
 update(planId,batchId,manifest,batch,status,documents){return this.store.update(state=>{
  this.guard(state,manifest,batch);const row=state.curatedRetentionPlans[planId].batches.find(b=>b.id===batchId);if(row.operationId!==batch.operationId)throw new DomainError('Batch identity changed.',409);Object.assign(row,status);
  for(const item of batch.items){const a=requireArticle(state,item.articleId),r=a.cloudRetention;if(r?.operationId!==batch.operationId||r?.connectionId!==manifest.connectionId||r?.revision!==item.revision)throw new DomainError('Article retention changed during Cloud operation.',409);const doc=documents?.find(d=>d.articleId===a.id);Object.assign(r,status,...(doc?[{status:doc.verified?'succeeded':status.status,note:doc.note}]:[]),{retryable:false,batchManaged:true});}
  const operation=state.cloudOperations?.find(o=>o.id===batch.operationId);if(operation)operation.status=status.status;return structuredClone(row);
 });}
 fail(planId,batchId,operationId){this.store.update(state=>{const row=state.curatedRetentionPlans?.[planId]?.batches.find(b=>b.id===batchId);if(row?.operationId!==operationId||row.status==='staged')return;row.status='unverified';row.note='Outcome is unverified. Do not resend; use explicit status checks.';for(const a of state.articles){if(a.cloudRetention?.operationId===operationId&&a.cloudRetention.status!=='succeeded')Object.assign(a.cloudRetention,{status:'unverified',retryable:false,batchManaged:true});}const operation=state.cloudOperations?.find(o=>o.id===operationId);if(operation)operation.status='unverified';});}
 async check(planId,batchId){
  if(this.busy)throw new DomainError('Another batch action is running.',409);const {manifest,batch,record}=this.lookup(planId,batchId);if(record.status==='staged')throw new DomainError('This batch has not been dispatched. Status checks never dispatch it.',409);this.busy=true;
  try{
   await this.authorize({kind:'batch-status',planId,batchId,operationId:batch.operationId,manifestHash:manifest.manifestHash,maxMetadataCalls:batch.items.length+1});this.guard(this.store.read(),manifest,batch);
   const operation=await this.provider.operation('status',record.providerOperationId||batch.operationId);this.guard(this.store.read(),manifest,batch);
   const documents=[];for(const item of batch.items){let doc;try{doc=await this.provider.getClient().getDocument(manifest.bank,item.docId,{signal:AbortSignal.timeout(20000)});}catch(error){if(error.status!==404&&error.statusCode!==404)throw error;}
    this.guard(this.store.read(),manifest,batch);const verified=!!(doc&&doc.id===item.docId&&doc.tags?.includes(manifest.scope)&&Number(doc.memory_unit_count)>0&&typeof doc.original_text==='string'&&hash(doc.original_text)===item.contentHash);
    documents.push({articleId:item.articleId,docId:item.docId,verified,note:verified?'Exact source content, workspace scope and retained facts verified.':'Document content, scope or retained facts do not yet verify.'});
   }
   const status=documents.every(d=>d.verified)?'succeeded':['pending','processing'].includes(operation.status)?'processing':['failed','cancelled'].includes(operation.status)?operation.status:'unverified';
   return this.update(planId,batchId,manifest,batch,{status,checkedAt:new Date().toISOString(),documents,retryable:false,note:status==='succeeded'?'Every document verified.':'Batch remains unverified or incomplete; no retry was sent.'},documents);
  }catch(error){this.fail(planId,batchId,batch.operationId);throw error instanceof DomainError?error:new DomainError('Batch status could not be verified. No retention or retry was sent.',502);}finally{this.busy=false;}
 }
}
