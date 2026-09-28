import {buildCloudWorkspaceSnapshot,canonicalWorkspace} from './cloud-workspace.js';
import {hash,DomainError} from './domain.js';

const contentHash=state=>hash(canonicalWorkspace(state));
// Cached verified identities reduce the forecast, not the archive's fresh
// readback requirements. Missing previously attempted documents are never resent.
export function forecastCheckpointWrites(plan,state,{connectionId,bank}={}){
 const known=new Set();
 for(const record of Object.values(state.cloudWorkspaceSnapshots||{})){
  if(record.status!=='verified'||record.connectionId!==connectionId||record.bank!==bank)continue;
  for(const doc of record.plan?.documents||[])if(record.documents?.[doc.hash]?.status==='verified'){
   const same=plan.documents.find(next=>next.docId===doc.docId&&next.hash===doc.hash&&next.content===doc.content&&hash(next.tags)===hash(doc.tags)&&hash(next.metadata)===hash(doc.metadata));if(same)known.add(doc.docId);
  }
 }
 const missing=plan.documents.filter(doc=>!known.has(doc.docId)),writeReservationUSD=Number((missing.length*.15).toFixed(2)),policyReservationUSD=missing.length?.05:0;
 return {missingDocuments:missing.length,docIds:missing.map(doc=>doc.docId),reusedDocuments:known.size,writeReservationUSD,policyReservationUSD,totalReservationUSD:Number((writeReservationUSD+policyReservationUSD).toFixed(2)),archiveBytes:plan.forecast.archiveBytes,note:'Whole compressed chunks can change after a small edit. This full-batch reservation estimate is not a provider billing cap.'};
}

export class CloudCheckpointQueue{
 constructor(store,{archiveFactory,canSpend,debounceMs=300,now=()=>new Date().toISOString(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  Object.assign(this,{store,archiveFactory,canSpend,debounceMs,now,wait});this.lastCommittedHash=contentHash(store.read());this.generation=0;this.timer=null;this.running=null;this.closed=false;
 }
 assertCanEdit(){const state=this.store.read(),active=state.cloudWorkspaceStatus?.activeOwnerId,local=state.cloudWorkspaceLocal?.ownerId;if(active&&active!==local)throw new DomainError('Cloud workspace belongs to another active owner.',409);}
 pending(note,extra={}){this.assertCanEdit();this.store.update(state=>{state.cloudWorkspaceStatus={...state.cloudWorkspaceStatus,status:'pending',note,...extra};});}
 committed(){
  if(this.closed)return {queued:false,reason:'closed'};this.assertCanEdit();const current=contentHash(this.store.read());if(current===this.lastCommittedHash)return {queued:false,reason:'no-canonical-change'};
  this.lastCommittedHash=current;this.generation++;this.pending('Committed changes await a budgeted Cloud checkpoint.');
  if(!this.running){clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;void this.flush().catch(()=>{});},this.debounceMs);this.timer.unref?.();}
  return {queued:true};
 }
 async flush(){
  if(this.closed)return {status:'closed'};clearTimeout(this.timer);this.timer=null;if(this.running)return this.running;if(!this.generation)return {status:'idle'};
  this.running=this.drain();try{return await this.running;}finally{this.running=null;}
 }
 async readChecks(archive,snapshotHash,initial){
  let result=initial;for(let n=0;result?.status!=='verified'&&n<3;n++){await this.wait(2000);result=await archive.publish(snapshotHash,{maxWrites:0});}return result;
 }
 async drain(){
  let result={status:'pending'};
  for(let pass=0;pass<2;pass++){
   const generation=this.generation;
   try{
    this.assertCanEdit();const archive=this.archiveFactory?.();if(!archive||typeof this.canSpend!=='function'){this.pending('Cloud checkpoint awaits a configured connection and full-batch credit authorization.');return {status:'pending',reason:'not-configured'};}
    const connection=archive.connectionId?.();archive.guard(connection);const inventory=await archive.discover(connection),head=inventory.head;
    if(head&&head.manifest.nextOwnerId!==archive.ownerId){this.pending('Cloud ownership changed; recover or request an explicit handoff before saving.');return {status:'pending',reason:'owner-changed'};}
    const state=this.store.read(),pending=Object.values(state.cloudWorkspaceSnapshots||{}).filter(record=>record.status!=='verified');
    if(pending.length){
     if(pending.length!==1){this.pending('Multiple pending checkpoints require explicit reconciliation.');return {status:'pending',reason:'reconciliation-required'};}
     result=await this.readChecks(archive,pending[0].plan.snapshotHash,{status:'pending'});
     if(result.status!=='verified'){this.pending('Earlier writes remain unverified. Automatic writes stopped; explicitly reconcile before saving again.');return {...result,reason:'unverified-prior-write'};}
    }else{
     const plan=buildCloudWorkspaceSnapshot(state,{ownerId:archive.ownerId,parentHash:head?.hash||null,createdAt:this.now()});
     if(head?.manifest.stateHash===plan.manifest.stateHash){
      // A known verified checkpoint can become clean again after a reverted edit.
      if(state.cloudWorkspaceSnapshots?.[head.hash]?.status==='verified')this.store.update(s=>{s.cloudWorkspaceStatus={...s.cloudWorkspaceStatus,status:'verified',snapshotHash:head.hash,activeOwnerId:head.manifest.nextOwnerId,note:'The current contents match the verified Cloud checkpoint.'};});
      return {status:'unchanged',snapshotHash:head.hash};
     }
     const forecast=forecastCheckpointWrites(plan,state,{connectionId:connection,bank:archive.bank});
     if(forecast.missingDocuments>32){this.pending('This save exceeds 32 new archive documents and needs explicit cost review.',{automaticForecast:forecast});return {status:'pending',reason:'write-bound',forecast};}
     const decision=await this.canSpend({plan,forecast,workspaceId:archive.workspaceId,connectionId:connection,bank:archive.bank});archive.guard(connection);
     if(decision!==true&&decision?.allowed!==true){this.pending('Insufficient authorized credit for the entire checkpoint; no paid operation was sent.',{automaticForecast:forecast});return {status:'pending',reason:'budget-denied',forecast};}
     // Any commit during preflight invalidates the frozen input before staging.
     if(contentHash(this.store.read())!==contentHash(state)){this.pending('Newer changes arrived during checkpoint preparation. A new committed save can retry.');return {status:'pending',reason:'input-changed'};}
     archive.stage(plan);result=await archive.publish(plan.snapshotHash,{maxWrites:forecast.missingDocuments});result=await this.readChecks(archive,plan.snapshotHash,result);
     if(result.status!=='verified'){this.pending('Cloud readback remains incomplete. No automatic resend or additional paid pass will run.');return {...result,reason:'unverified-write'};}
    }
    if(this.generation===generation&&this.store.read().cloudWorkspaceStatus?.status!=='pending')return result;
    if(pass===1){this.pending('Newer changes remain pending after the bounded follow-up. Save again to authorize another checkpoint.');return {status:'pending',reason:'followup-bound'};}
   }catch{
    try{this.pending('Cloud checkpoint stopped after a verification or authorization failure. No automatic retry was scheduled.');}catch{/* Owner handoff also prevents local status writes. */}return {status:'pending',reason:'failed'};
   }
  }
  return result;
 }
 close(){this.closed=true;clearTimeout(this.timer);this.timer=null;}
}
