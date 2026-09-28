import {randomUUID} from 'node:crypto';
import {MemoryProvider,resolveRecall} from './providers.js';
import {DomainError,requireArticle,requireCase,applicability,hash} from './domain.js';
import {reflectionIdentity,reflectionStatus,validateReflection,scopedReflectionSchema} from './reflection.js';
export class CloudWorkflow{
 constructor(store,settings,factory=(s,c)=>new MemoryProvider(s,c)){
  this.store=store;this.settings=settings;this.factory=factory;this.busy=false;
  store.update(s=>{s.workspaceId??=randomUUID();s.cloudOperations??=[];s.cloudPackets??={};});
 }
 connectionId(){const c=this.settings.read();return c?hash([c.baseUrl,c.bank,hash(c.apiKey)]):null;}
 retentionView(a){return a.cloudRetention&&a.cloudRetention.connectionId!==this.connectionId()?{...a.cloudRetention,status:'unverified',retryable:false,connectionMismatch:true,note:'This retention belongs to a different or unrecorded connection. Retain this revision explicitly in the current connection.'}:a.cloudRetention;}
 provider(){const secret=this.settings.read();if(!secret)throw new DomainError('Save Hindsight credentials in Connections first.',400);return this.factory(this.store,{memoryMode:'hindsight',allowExternal:true,hindsightUrl:secret.baseUrl,hindsightKey:secret.apiKey,bank:secret.bank,workspaceScope:`lucid-workspace-${this.store.read().workspaceId}`});}
 reserve(kind){
  const provider=this.provider();if(this.busy)throw new DomainError('Another Cloud action is running.',409);
  const at=new Date().toISOString(),id=randomUUID(),limit=kind==='retain'?2:kind==='reflect'?3:5;
  this.store.update(s=>{if(s.cloudOperations.filter(x=>x.kind===kind&&x.at.slice(0,10)===at.slice(0,10)).length>=limit)throw new DomainError(`Local daily Cloud ${kind} limit reached.`,429);s.cloudOperations.push({id,at,kind,status:'dispatched'});});
  this.busy=true;return {provider,id};
 }
 finish(id,status){this.store.update(s=>{const operation=s.cloudOperations.find(x=>x.id===id);if(operation)operation.status=status;});this.busy=false;}
 async recall(query,context={}){
  if(Buffer.byteLength(query)>7000)throw new DomainError('Report exceeds the Cloud recall input limit.',400);
  const {provider,id}=this.reserve('recall');try{const results=await provider.recall(query,context);this.finish(id,'succeeded');return results;}
  catch{this.finish(id,'unverified');throw new DomainError('Cloud recall could not be verified. No retry or local fallback was made.',502);}
 }
 async retain(articleId,expectedRevision){
  const article=requireArticle(this.store.read(),articleId);
  if(article.revision!==expectedRevision)throw new DomainError('Article changed; review its latest revision.',409);
  if(article.cloudRetention?.revision===article.revision&&article.cloudRetention.connectionId===this.connectionId())return article.cloudRetention;
  const candidate=this.provider(),connectionId=this.connectionId(),key=`${connectionId}:${article.id}:${article.revision}`;
  // Prepare and validate before reserving an operation; freeze the packet for this revision.
  let plan=this.store.read().cloudPackets[key];
  if(!plan){plan=candidate.prepareRetention?.(article)||{};this.store.update(s=>{s.cloudPackets[key]=plan;});}
  const {provider,id}=this.reserve('retain');
  this.store.update(s=>{const a=requireArticle(s,articleId);if(a.cloudRetention?.docId){a.cloudHistory??=[];if(!a.cloudHistory.some(h=>h.docId===a.cloudRetention.docId))a.cloudHistory.push(a.cloudRetention);}a.cloudRetention={connectionId,revision:article.revision,articleHash:article.fingerprint,packetHash:plan.packet?.metadata.packet_hash,contentHash:plan.packet?hash(plan.packet.content):undefined,status:'dispatched',operationId:id,providerOperationId:id,docId:plan.docId,retryable:false,retries:0};});
  try{
   const result=await provider.retain(article,{plan,operationId:id,async:true});
   const status={...requireArticle(this.store.read(),articleId).cloudRetention,status:result.result?.async?'processing':'succeeded',docId:result.docId,providerOperationId:result.result?.async?(result.result.operation_id||id):undefined,note:result.result?.async?'Cloud accepted the evidence packet. Check status to verify completion.':'This reviewed revision was retained.'};
   this.store.update(s=>{const a=requireArticle(s,articleId);if(a.revision===article.revision)a.cloudRetention=status;else{a.cloudHistory??=[];a.cloudHistory.push(status);}});
   this.finish(id,status.status);return status;
  }catch{this.store.update(s=>{const a=requireArticle(s,articleId);if(a.cloudRetention?.operationId===id){a.cloudRetention.status='unverified';a.cloudRetention.note='Dispatch outcome is unknown. Check Cloud status before any retry.';}});this.finish(id,'unverified');throw new DomainError('Cloud retention could not be verified. The article remains local. Check Cloud status; no automatic retry was sent.',502);}
 }
 async checkRetention(articleId,expectedRevision){
  const a=requireArticle(this.store.read(),articleId);
  if(a.revision!==expectedRevision||a.cloudRetention?.revision!==a.revision)throw new DomainError('Review or retain the current article revision first.',409);
  const retention=structuredClone(a.cloudRetention);if(retention.connectionId!==this.connectionId())throw new DomainError('This retention belongs to another connection. No operation was sent.',409);
  const status=await this.provider().retentionStatus(retention);if(retention.connectionId!==this.connectionId())throw new DomainError('Connection changed while Cloud status was checked.',409);
  return this.store.update(s=>{const current=requireArticle(s,articleId);if(current.revision!==expectedRevision||current.cloudRetention.operationId!==retention.operationId)throw new DomainError('Article retention changed while status was checked.',409);Object.assign(current.cloudRetention,status,{checkedAt:new Date().toISOString(),retryable:!retention.batchManaged&&status.retryable&&!!retention.providerOperationId&&(retention.retries||0)<1});return current.cloudRetention;});
 }
 async retryRetention(articleId,expectedRevision){
  if(requireArticle(this.store.read(),articleId).cloudRetention?.batchManaged)throw new DomainError('Batch retention permits status checks only; automatic or article-level retries are disabled.',409);
  const checked=await this.checkRetention(articleId,expectedRevision);
  if(checked.connectionId!==this.connectionId())throw new DomainError('Connection changed. Check this operation again.',409);
  if(!checked.retryable)throw new DomainError('Only a verified failed or cancelled operation with retry allowance can be retried.',409);
  const {provider,id}=this.reserve('retain');
  this.store.update(s=>{const r=requireArticle(s,articleId).cloudRetention;r.retryable=false;r.retries=(r.retries||0)+1;r.status='dispatched';});
  try{const result=await provider.retryRetention(checked);const status=this.store.update(s=>{const current=requireArticle(s,articleId),r=current.cloudRetention;if(current.revision!==expectedRevision||r?.operationId!==checked.operationId||r?.connectionId!==checked.connectionId||this.connectionId()!==checked.connectionId)throw new DomainError('Article retention or connection changed during retry. Check the original operation before further actions.',409);Object.assign(r,{status:'processing',providerOperationId:result.operation_id||r.providerOperationId,note:'The same Cloud operation was explicitly retried. Check status before using it.'});return r;});this.finish(id,'processing');return status;}
  catch(error){this.store.update(s=>{const r=requireArticle(s,articleId).cloudRetention;if(r?.operationId===checked.operationId&&r?.connectionId===checked.connectionId)r.status='unverified';});this.finish(id,'unverified');if(error instanceof DomainError)throw error;throw new DomainError('Retry outcome is unknown. No second retry was sent; check Cloud status.',502);}
 }
 async retireOlder(articleId,expectedRevision){
  const a=requireArticle(this.store.read(),articleId);
  if(a.revision!==expectedRevision||a.cloudRetention?.revision!==a.revision||a.cloudRetention.status!=='succeeded'||a.cloudRetention.connectionId!==this.connectionId())throw new DomainError('Verify retention of the current revision before retiring older documents.',409);
  const older=(a.cloudHistory||[]).filter(r=>r.revision<a.revision&&r.docId&&!r.retiredAt&&r.connectionId===this.connectionId());
  if(older.length>10)throw new DomainError('Review at most ten older documents in one retirement action.',400);
  const provider=this.provider(),connectionId=this.connectionId();if(this.busy)throw new DomainError('Another Cloud action is running.',409);this.busy=true;
  try{for(const r of older){if(this.connectionId()!==connectionId)throw new DomainError('Connection changed during retirement. No additional documents were changed.',409);if(requireArticle(this.store.read(),articleId).revision!==expectedRevision)throw new DomainError('Article changed during retirement.',409);await provider.retireDocument(r.docId);this.store.update(s=>{const row=requireArticle(s,articleId).cloudHistory.find(h=>h.docId===r.docId);if(row){row.retiredAt=new Date().toISOString();row.status='retired';}});if(this.connectionId()!==connectionId)throw new DomainError('Connection changed during retirement. Completed changes were recorded; no additional documents were changed.',409);}return {retired:older.length,note:'Older source documents are preserved, with the active workspace tag removed.'};}finally{this.busy=false;}
 }
 reflectionStatus(caseId){return reflectionStatus(this.store.read(),caseId,!!this.settings.read(),this.connectionId());}
 async reflect(caseId){
  const initial=this.store.read(),c=requireCase(initial,caseId),before=reflectionIdentity(c),connectionId=this.connectionId();
  const available=this.reflectionStatus(caseId);if(!available.canReflect)throw new DomainError(available.reason,400);
  const query=`${c.title} ${c.description} ${c.executor} ${c.symptom} ${c.runnerVersion}`;
  const records=await this.recall(query,c),state=this.store.read();
  const candidates=resolveRecall(state,records).filter(a=>applicability(c,a).status!=='incompatible').slice(0,6);
  if(!candidates.length)throw new DomainError('No current applicable approved memory was recalled. Reflection was not dispatched.',409);
  if(connectionId!==this.connectionId()||before!==reflectionIdentity(requireCase(state,caseId)))throw new DomainError('Case changed while memory was recalled. Review it before reflecting.',409);
  const facts=records.filter(r=>candidates.some(a=>a.id===r.articleId&&a.revision===r.revision&&a.fingerprint===r.hash));
  const context=JSON.stringify({case:{title:c.title,report:c.description,executor:c.executor,hosting:c.hosting,runnerVersion:c.runnerVersion,serverVersion:c.serverVersion,sourceEventDate:c.occurredAt||c.sourceDate||null,failedAttempts:c.attempts?.filter(a=>a.result==='Failed'),steps:c.tasks},approvedEvidence:candidates.map(a=>({articleId:a.id,revision:a.revision,fix:a.fix,cause:a.cause||'Unknown',limitations:a.limitations,facts:facts.filter(f=>f.articleId===a.id).map(f=>({factId:f.factId}))}))});
  if(Buffer.byteLength(context)>12000)throw new DomainError('Reflection context is too large. Review and reduce the current evidence before using credit.',400);
  const {provider,id}=this.reserve('reflect');
  try{
   const result=await provider.reflect('Review the support case using the supplied current approved memory. Preserve uncertainty and contradictions. Return the requested structured preview, citing only supplied article/revision/fact IDs. Do not claim that an unknown cause is established.',context,{responseSchema:scopedReflectionSchema(candidates,facts)});
   const preview=validateReflection(result.structured_output,candidates,facts);
   this.store.update(s=>{const current=requireCase(s,caseId);if(connectionId!==this.connectionId()||before!==reflectionIdentity(current)||candidates.some(a=>!s.articles.some(now=>now.id===a.id&&now.revision===a.revision&&now.fingerprint===a.fingerprint)))throw new DomainError('Case or approved knowledge changed during reflection. The preview was not saved.',409);current.reflection={preview,connectionId,inputHash:before,articleHashes:Object.fromEntries(candidates.map(a=>[a.id,a.fingerprint]))};});
   this.finish(id,'succeeded');return this.reflectionStatus(caseId);
  }catch(error){this.finish(id,'unverified');if(error instanceof DomainError)throw error;throw new DomainError('Reflection could not be validated. No preview was applied and no automatic retry was made.',502);}
 }
}
