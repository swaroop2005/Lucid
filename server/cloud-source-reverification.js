import {randomUUID} from 'node:crypto';
import {buildMemoryPacket} from './memory-evidence.js';
import {DomainError,hash} from './domain.js';
import {verifyScopeDocument,equalTags} from './hindsight-scope.js';
import {prepareOfficialDocumentRetention,verifyOfficialDocumentScope} from './hindsight-documents.js';

export const SOURCE_REVERIFICATION_LIMIT=32;
const fail=message=>{throw new DomainError(`Cloud source reverification: ${message}`,409);};
export class CloudSourceReverification{
 constructor(store,providerFactory,{connectionId,authorize,now=()=>new Date().toISOString()}={}){Object.assign(this,{store,providerFactory,connectionId,authorize,now});this.busy=false;}
 prepare(id,provider){
  const state=this.store.read(),scope=`lucid-workspace-${state.workspaceId}`,official=id.startsWith('DOC-'),source=(official?state.officialDocuments:state.articles)?.find(s=>s.id===id);
  if(!source||(!official&&!/^KA-\d+$/.test(id))||provider.c?.memoryMode!=='hindsight'||provider.c?.allowExternal!==true||provider.scope()!==scope)fail('source or provider does not match the recovered workspace.');
  const plan=official?prepareOfficialDocumentRetention(source,{scope}):provider.prepareRetention(source);
  return {source,official,plan,scope,workspaceId:state.workspaceId,identity:hash(plan)};
 }
 async verify(sourceIds){
  if(this.busy||!Array.isArray(sourceIds)||!sourceIds.length||sourceIds.length>SOURCE_REVERIFICATION_LIMIT||sourceIds.some(id=>typeof id!=='string')||new Set(sourceIds).size!==sourceIds.length)fail('select one to32 distinct canonical source IDs.');
  const connection=this.connectionId?.();if(!connection||typeof this.authorize!=='function')fail('a configured connection and read authorization are required.');this.busy=true;
  try{
   const provider=this.providerFactory(),records=[];
   for(const id of sourceIds){
    const frozen=this.prepare(id,provider),{source,official,scope}=frozen,guard=()=>{if(this.connectionId()!==connection||this.prepare(id,provider).identity!==frozen.identity)fail('connection or immutable source changed during verification.');};guard();
    let plan=frozen.plan,packetPolicyVersion=official?null:2;
    const expectedTags=frozen.plan.packet.tags;
    const read=async candidate=>{
     const request={operation:'get-source-document',sourceId:id,sourceKind:official?'official-document':'knowledge-article',revision:source.revision,sourceHash:source.fingerprint,docId:candidate.docId,contentHash:hash(candidate.packet.content),packetHash:candidate.packet.metadata.packet_hash,scope,bank:provider.c.bank};
     const reservation=await this.authorize({id:randomUUID(),kind:'workspace-source-read',connectionId:connection,workspaceId:frozen.workspaceId,bank:provider.c.bank,request});
     let document;
     try{guard();document=await provider.getClient().getDocument(provider.c.bank,candidate.docId,{signal:AbortSignal.timeout(20000)});}
     catch(error){await reservation?.fail?.(error);guard();if(error.status===404||error.statusCode===404)return {document:null,missing:true};throw new DomainError('Cloud source read could not be verified; no write or retry was sent.',502);}
     guard();try{await reservation?.complete?.(document);}catch{throw new DomainError('Cloud source read accounting could not be completed; no fallback was sent.',502);}return {document,missing:document===null};
    };
    let result=await read(plan);
    // A historic packet can have been retagged into exact revision scope without
    // changing its original document ID/content/metadata. Only an explicit modern
    // 404 (including SDK null, its documented 404 mapping) permits the second
    // deterministic read; a present mismatched document never triggers fallback.
    if(result.missing&&!official){
     guard();const packet=buildMemoryPacket(source,this.store.read(),{scope});
     plan={packet,docId:`${scope}-${source.id}-r${source.revision}-${source.fingerprint.slice(0,12)}-p${packet.metadata.packet_hash.slice(0,12)}`};
     packetPolicyVersion=1;result=await read(plan);
    }
    const {document}=result;
    const exact=!!(document&&document.bank_id===provider.c.bank&&document.id===plan.docId&&typeof document.original_text==='string'&&document.original_text===plan.packet.content&&equalTags(document.tags,expectedTags)&&document.memory_unit_count>0&&Object.entries(plan.packet.metadata).every(([key,value])=>document.document_metadata?.[key]===value));
    guard();this.store.update(state=>{
     guard();const current=(official?state.officialDocuments:state.articles).find(s=>s.id===id);
     if(!exact){if(current.cloudScope)current.cloudScope.verified=false;if(current.cloudRetention)current.cloudRetention.status='unverified';if(!official)current.sync='unverified';records.push({sourceId:id,status:'unverified',reason:'Full original content, exact scope, source metadata and nonzero facts did not verify.'});return;}
     const retention={status:'succeeded',connectionId:connection,revision:source.revision,...(official?{documentHash:source.fingerprint}:{articleHash:source.fingerprint}),docId:plan.docId,contentHash:hash(plan.packet.content),packetHash:plan.packet.metadata.packet_hash,...(packetPolicyVersion===1?{packetPolicyVersion:1}:{}),retryable:false,reverifiedAt:this.now()};
     // Existing proofs are never rebound. Construct a new proof only from the
     // fresh exact document and the deterministic immutable current packet.
     const candidate={...current,cloudRetention:retention};const policy=official?verifyOfficialDocumentScope(candidate,document,{connectionId:connection,scope,verifiedAt:this.now()}):verifyScopeDocument(candidate,document,{connectionId:connection,scope,verifiedAt:this.now()});
     current.cloudRetention=retention;current.cloudScope=policy;if(!official)current.sync='succeeded';records.push({sourceId:id,status:'verified',docId:plan.docId,revision:source.revision,...(packetPolicyVersion===1?{packetPolicyVersion:1,scopePolicyVersion:2}:{})});
    });
   }
   return {records,verified:records.filter(r=>r.status==='verified').length,total:records.length,readOnlyProvider:true};
  }finally{this.busy=false;}
 }
}
