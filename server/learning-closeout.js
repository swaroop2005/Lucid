import {randomUUID} from 'node:crypto';
import {DomainError,hash,requireArticle,requireCase} from './domain.js';
import {MemoryProvider} from './providers.js';
import {verifyScopeDocument,verifiedArticleScope} from './hindsight-scope.js';

export const LEARNING_MAX_CHECKS=3;
export const LEARNING_MAX_MODELS=20;
const fail=message=>{throw new DomainError(message,409);};
const view=record=>{const {plan:_plan,...status}=record;return structuredClone(status);};
const currentPlan=(store,article,scope)=>MemoryProvider.prototype.prepareRetention.call({store,c:{},scope:()=>scope},article);
function approval(state,articleId,caseId,revision){
 const article=requireArticle(state,articleId),c=requireCase(state,caseId);
 if(article.curation||article.revision!==revision||!article.sourceCases?.includes(caseId)||!c.articleIds?.includes(articleId)||!c.resolution?.fix?.trim()||!c.resolution?.evidence?.trim()||!article.reviewer?.trim())fail('Only the current explicitly reviewed article from a recorded confirmed resolution or workaround can enter learning closeout.');
 return {article,c};
}
export function assertManualLearningPolicies(response){
 const items=response?.items;
 if(!Array.isArray(items)||!Number.isInteger(response.total)||response.total!==items.length||items.length>LEARNING_MAX_MODELS||(response.offset!==undefined&&response.offset!==0)||response.truncated===true||response.has_more===true||response.next_cursor||response.nextCursor)fail('The complete bounded model refresh policy could not be checked. Learning remains pending.');
 if(new Set(items.map(item=>item.id)).size!==items.length||items.some(item=>!item.id||item.trigger?.refresh_after_consolidation!==false||item.trigger?.refresh_cron!==null))fail('Every existing model must have an explicitly verified manual refresh policy before learning retention.');
 return {modelCount:items.length,automaticRefresh:false};
}

// Called only after the existing explicit resolution + article approval workflow.
// It never scans articles to infer approval, changes operational outbox entries,
// retries a write, or promotes a generated investigation into verified knowledge.
export class LearningCloseout{
 constructor(store,providerFactory,{connectionId,authorize,now=()=>new Date().toISOString()}={}){this.store=store;this.providerFactory=providerFactory;this.connectionId=connectionId;this.authorize=authorize;this.now=now;this.busy=false;}
 enqueue(articleId,{caseId,expectedRevision}={}){
  const state=this.store.read(),{article,c}=approval(state,articleId,caseId,expectedRevision);
  if(!state.workspaceId)fail('A durable workspace identity is required before queuing learning.');
  const key=`${article.id}:r${article.revision}:${article.fingerprint}`,existing=state.learningCloseouts?.[key];
  if(existing)return view(existing);
  // A prior write owned by another workflow must be reconciled there, never resent.
  if(article.cloudRetention?.revision===article.revision)return {key:null,articleId,revision:article.revision,status:verifiedArticleScope(article,{connectionId:this.connectionId?.(),scope:`lucid-workspace-${state.workspaceId}`})?'succeeded':'existing-retention',note:'This revision already has a Cloud retention record; no new write was queued.'};
  const scope=`lucid-workspace-${state.workspaceId}`,plan=currentPlan(this.store,article,scope),at=this.now();
  const record={key,articleId,revision:article.revision,articleHash:article.fingerprint,caseId,resolutionHash:hash(c.resolution),workspaceId:state.workspaceId,scope,connectionId:this.connectionId?.()||null,bank:null,plan,planHash:hash(plan),operationId:randomUUID(),status:'pending',attempts:0,checks:0,createdAt:at,note:'Reviewed lesson is queued; a configured connection and authorized budget are required.'};
  return this.store.update(s=>{approval(s,articleId,caseId,expectedRevision);s.learningCloseouts??={};if(s.learningCloseouts[key])return view(s.learningCloseouts[key]);s.learningCloseouts[key]=record;return view(record);});
 }
 lookup(key){const record=this.store.read().learningCloseouts?.[key];if(!record)fail('Learning closeout was not queued by article approval.');return record;}
 guard(record,provider){
  const state=this.store.read(),{article,c}=approval(state,record.articleId,record.caseId,record.revision);
  if(state.workspaceId!==record.workspaceId||record.scope!==`lucid-workspace-${state.workspaceId}`||article.fingerprint!==record.articleHash||hash(c.resolution)!==record.resolutionHash||hash(record.plan)!==record.planHash||hash(currentPlan(this.store,article,record.scope))!==record.planHash)fail('Approved learning evidence changed after its packet was frozen.');
  if(record.connectionId&&this.connectionId?.()!==record.connectionId)fail('The learning connection changed. No additional Cloud operation was sent.');
  if(provider&&(provider.c?.memoryMode!=='hindsight'||provider.c?.allowExternal!==true||provider.scope()!==record.scope||provider.c.bank!==record.bank))fail('Learning provider does not match its frozen workspace and bank.');
  return article;
 }
 update(key,changes){return this.store.update(state=>{const record=state.learningCloseouts?.[key];if(!record)fail('Learning closeout disappeared.');Object.assign(record,changes);return view(record);});}
 async network(record,provider,kind,operation,call){
  this.guard(record,provider);if(typeof this.authorize!=='function')fail('No authorized learning budget is available.');
  const request={articleId:record.articleId,revision:record.revision,articleHash:record.articleHash,planHash:record.planHash,docId:record.plan.docId,packet:record.plan.packet,operationId:record.operationId,scope:record.scope,bank:record.bank,operation};
  const reservation=await this.authorize({id:kind==='learning-retain'?`${record.operationId}:retain`:randomUUID(),kind,closeoutId:record.key,connectionId:record.connectionId,request});
  try{this.guard(this.lookup(record.key),provider);const response=await call();this.guard(this.lookup(record.key),provider);await reservation?.complete?.(response);return response;}
  catch(error){await reservation?.fail?.(error);throw error;}
 }
 async run(key,{maxChecks=LEARNING_MAX_CHECKS}={}){
  if(!Number.isInteger(maxChecks)||maxChecks<0||maxChecks>LEARNING_MAX_CHECKS)fail('Learning status checks must be bounded from zero to three.');
  if(this.busy)fail('Another learning closeout action is running.');
  let record=this.lookup(key);
  if(record.status==='succeeded'){this.guard(record);return view(record);}
  if(record.status==='preparing'&&record.attempts===0)return view(record);
  if(record.status!=='pending'){
   // Restart recovery is read-only, including a crash before write acceptance.
   if(!maxChecks)return view(record);return this.check(key);
  }
  if(!this.connectionId?.()||typeof this.authorize!=='function')return this.update(key,{note:'Learning is pending: configure Hindsight and authorize a local budget before Cloud synchronization.'});
  this.busy=true;let provider;
  try{
   this.guard(record);provider=this.providerFactory();
   this.store.update(state=>{const current=state.learningCloseouts[key];if(current.status!=='pending')fail('Learning dispatch was already claimed.');Object.assign(current,{status:'preparing',connectionId:current.connectionId||this.connectionId(),bank:current.bank||provider.c.bank});});
   record=this.lookup(key);this.guard(record,provider);
   const policies=await this.network(record,provider,'learning-policy-read','list-model-policies',()=>provider.getClient().listMentalModels(record.bank,{detail:'content',limit:LEARNING_MAX_MODELS,offset:0,signal:AbortSignal.timeout(20000)}));
   const policy=assertManualLearningPolicies(policies);this.update(key,{policyCheckedAt:this.now(),policy});
   await this.network(record,provider,'learning-retain','retain',async()=>{
    this.store.update(state=>{const current=state.learningCloseouts[key];this.guard(current,provider);if(current.status!=='preparing'||current.attempts!==0)fail('This lesson already had a write attempt.');const article=requireArticle(state,current.articleId);if(article.cloudRetention?.revision===current.revision)fail('This revision already has a retention attempt.');
     const at=this.now();Object.assign(current,{status:'dispatched',attempts:1,dispatchedAt:at});state.cloudPackets??={};state.cloudPackets[`${current.connectionId}:${article.id}:${article.revision}`]=structuredClone(current.plan);
     if(article.cloudRetention){article.cloudHistory??=[];article.cloudHistory.push(structuredClone(article.cloudRetention));}
     article.cloudRetention={connectionId:current.connectionId,revision:current.revision,articleHash:current.articleHash,packetHash:current.plan.packet.metadata.packet_hash,contentHash:hash(current.plan.packet.content),status:'dispatched',operationId:current.operationId,providerOperationId:current.operationId,docId:current.plan.docId,retryable:false,retries:0,learningCloseoutId:key};delete article.cloudScope;
    });
    const article=this.guard(this.lookup(key),provider);return provider.retain(article,{plan:structuredClone(record.plan),operationId:record.operationId,async:true});
   }).then(response=>{
    if(response?.provider!=='hindsight'||response.docId!==record.plan.docId)fail('Cloud acceptance did not identify the frozen document.');
    const providerOperationId=response.result?.operation_id||record.operationId;if(typeof providerOperationId!=='string'||!providerOperationId||providerOperationId.length>200)fail('Cloud operation identity could not be verified.');
    this.store.update(state=>{const current=state.learningCloseouts[key];Object.assign(current,{status:'processing',providerOperationId,note:'Cloud accepted the frozen lesson; exact retained content and facts still require verification.'});Object.assign(requireArticle(state,current.articleId).cloudRetention,{status:'processing',providerOperationId});});
   });
  }catch(error){
   record=this.lookup(key);const attempted=record.attempts>0;
   this.update(key,{status:attempted?'unverified':'pending',note:attempted?'Cloud write outcome is unverified. Only status checks are permitted; no write will be retried.':'Learning remains pending: connection, budget, source identity or manual refresh policy could not be verified.'});
   if(attempted)this.store.update(state=>{const article=state.articles.find(a=>a.id===record.articleId);if(article?.cloudRetention?.operationId===record.operationId)Object.assign(article.cloudRetention,{status:'unverified',retryable:false});});
   // Provider errors may include credentials or raw requests. Persist only a safe category.
   if(error?.status===402||error?.statusCode===402)this.update(key,{blockedBy:'provider-credit'});
   return view(this.lookup(key));
  }finally{this.busy=false;}
  for(let i=0;i<maxChecks;i++){const status=await this.check(key);if(status.status!=='processing')return status;}
  return view(this.lookup(key));
 }
 async check(key){
  if(this.busy)fail('Another learning closeout action is running.');const record=this.lookup(key);
  if(record.status==='succeeded'){this.guard(record);return view(record);}
  if(record.status==='pending'||(record.status==='preparing'&&record.attempts===0))return view(record);
  this.busy=true;
  try{
   this.guard(record);const provider=this.providerFactory();this.guard(record,provider);
   let operation=null,document=null;
   try{operation=await this.network(record,provider,'learning-metadata','operation-status',()=>provider.operation('status',record.providerOperationId||record.operationId));}catch(error){if(error.status!==404&&error.statusCode!==404)throw error;}
   try{document=await this.network(record,provider,'learning-metadata','get-document',()=>provider.getClient().getDocument(record.bank,record.plan.docId,{signal:AbortSignal.timeout(20000)}));}catch(error){if(error.status!==404&&error.statusCode!==404)throw error;}
   this.guard(this.lookup(key),provider);
   let policy=null;const article=this.guard(record,provider);
   if(document&&Object.entries(record.plan.packet.metadata).every(([name,value])=>document.document_metadata?.[name]===value))try{policy=verifyScopeDocument(article,document,{connectionId:record.connectionId,scope:record.scope,verifiedAt:this.now()});}catch{/* incomplete or mismatched content is not eligible */}
   const status=policy?'succeeded':['pending','processing'].includes(operation?.status)?'processing':['failed','cancelled'].includes(operation?.status)?operation.status:'unverified';
   return this.store.update(state=>{const current=state.learningCloseouts[key],a=requireArticle(state,record.articleId);this.guard(current,provider);if(a.cloudRetention?.operationId!==record.operationId)fail('Learning retention identity changed during verification.');Object.assign(current,{status,checkedAt:this.now(),checks:current.checks+1,note:policy?'Exact frozen content, complete scope tags, source metadata and nonzero retained facts verified.':'Cloud evidence is not yet verified. Status reads may resume; no new write is allowed.'});Object.assign(a.cloudRetention,{status,checkedAt:current.checkedAt,retryable:false});if(policy)a.cloudScope=policy;return view(current);});
  }catch(error){this.update(key,{status:'unverified',note:'Learning status or source identity could not be verified. No new retention or retry was sent.'});if(error?.status===402||error?.statusCode===402)this.update(key,{blockedBy:'provider-credit'});return view(this.lookup(key));}
  finally{this.busy=false;}
 }
}
