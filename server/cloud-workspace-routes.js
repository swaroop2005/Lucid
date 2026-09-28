import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {createClient,sdk} from '@vectorize-io/hindsight-client';
import {CloudWorkspaceArchive,canonicalWorkspace,buildCloudWorkspaceSnapshot} from './cloud-workspace.js';
import {CloudCheckpointQueue,forecastCheckpointWrites} from './cloud-checkpoint-queue.js';
import {CloudSourceReverification} from './cloud-source-reverification.js';
import {DomainError,hash} from './domain.js';

const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
const stageInput=z.object({expectedParentHash:digest.nullable(),nextOwnerId:id.optional()}).strict();
const publishInput=z.object({snapshotHash:digest,maxWrites:z.number().int().min(0).max(32).default(5)}).strict();
const previewInput=z.object({workspaceId:id,ownerId:id}).strict();
const applyInput=z.object({previewId:z.string().uuid(),expectedLocalHash:digest,snapshotHash:digest,confirmReplace:z.literal(true)}).strict();
const localHash=state=>hash(canonicalWorkspace(state));
function defaultBackup(state){
 const folder=join(process.cwd(),'.data','recovery-backups');mkdirSync(folder,{recursive:true,mode:0o700});const path=join(folder,`${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}.json`);writeFileSync(path,JSON.stringify(state),{mode:0o600,flag:'wx'});return {path};
}
// The high-level SDK listDocuments omits tag filters in0.10.1; use the
// generated endpoint so archive discovery never lists a broad unfiltered bank.
export function cloudArchiveTransport(provider){
 const client=()=>provider.getClient();let api;
 return {
  listDocuments:async(bank,query)=>{api??=createClient({baseUrl:provider.c.hindsightUrl,headers:{Authorization:`Bearer ${provider.c.hindsightKey}`}});const result=await sdk.listDocuments({client:api,path:{bank_id:bank},query,signal:AbortSignal.timeout(20000)});if(!result.data)throw new DomainError('Cloud archive inventory could not be read.',502);return result.data;},
  getDocument:(bank,documentId)=>client().getDocument(bank,documentId,{signal:AbortSignal.timeout(20000)}),
  listMentalModels:(bank,options)=>client().listMentalModels(bank,{...options,signal:AbortSignal.timeout(20000)}),
  retain:(bank,content,options)=>client().retain(bank,content,{...options,signal:AbortSignal.timeout(60000)})
 };
}
export function mountCloudWorkspaceRoutes(app,store,{cloud,authorize,transportFactory=cloudArchiveTransport,backupState=defaultBackup,canSpend,budgetStatus,checkpointOptions={},now=()=>new Date().toISOString(),wait}={}){
 store.update(state=>{state.workspaceId??=randomUUID();state.cloudWorkspaceLocal??={ownerId:randomUUID()};});
 const previews=new Map();let active=false;let checkpoints;
 const configured=()=>!!cloud?.connectionId?.();
 const currentOwner=()=>store.read().cloudWorkspaceLocal.ownerId;
 const assertCanEdit=()=>{const state=store.read(),owner=state.cloudWorkspaceStatus?.activeOwnerId;if(owner&&owner!==state.cloudWorkspaceLocal.ownerId)throw new DomainError('This cache is read-only after owner handoff. Recover with the active owner before editing.',409);};
 const service=(journal=store,workspaceId=store.read().workspaceId,ownerId=currentOwner())=>{
  if(!configured())throw new DomainError('Configure the Hindsight connection before Cloud workspace operations.',409);const provider=cloud.provider();return new CloudWorkspaceArchive(journal,transportFactory(provider),{workspaceId,bank:provider.c.bank,ownerId,connectionId:()=>cloud.connectionId(),authorize,now,...(wait?{wait}:{})});
 };
 const status=()=>{const state=store.read();return {workspaceId:state.workspaceId,ownerId:state.cloudWorkspaceLocal.ownerId,configured:configured(),status:state.cloudWorkspaceStatus||{status:'pending',snapshotHash:null,note:'No verified Cloud checkpoint is recorded for this cache.'},pending:Object.values(state.cloudWorkspaceSnapshots||{}).filter(record=>record.status!=='verified').map(record=>({snapshotHash:record.plan.snapshotHash,status:record.status,forecast:record.plan.forecast})),localHash:localHash(state),budget:budgetStatus?.()};};
 const exclusive=handler=>async(req,res)=>{if(active||checkpoints?.running)throw new DomainError('Another Cloud workspace action is running.',409);active=true;try{await handler(req,res);}finally{active=false;}};
 checkpoints=new CloudCheckpointQueue(store,{archiveFactory:()=>{if(active)throw new DomainError('Another Cloud workspace action is running.',409);return configured()?service():null;},canSpend,...checkpointOptions});
 app.get('/api/cloud-workspace',(_req,res)=>res.json(status()));
 app.post('/api/cloud-workspace/stage',exclusive(async(req,res)=>{
  const input=stageInput.parse(req.body);assertCanEdit();const before=localHash(store.read()),archive=service(),inventory=await archive.discover();
  if((inventory.head?.hash||null)!==input.expectedParentHash)throw new DomainError('Cloud head changed. Review or recover the latest checkpoint before staging.',409);
  if(inventory.head&&inventory.head.manifest.nextOwnerId!==currentOwner())throw new DomainError('The active Cloud owner must hand off this workspace before this editor can publish.',409);
  if(before!==localHash(store.read()))throw new DomainError('Local case or knowledge data changed during checkpoint preparation.',409);
  const plan=buildCloudWorkspaceSnapshot(store.read(),{ownerId:currentOwner(),parentHash:input.expectedParentHash,nextOwnerId:input.nextOwnerId||currentOwner(),createdAt:now()});const staged=archive.stage(plan);res.json({...staged,forecast:plan.forecast});
 }));
 app.post('/api/cloud-workspace/publish',exclusive(async(req,res)=>{const input=publishInput.parse(req.body);assertCanEdit();const archive=service(),state=store.read(),plan=state.cloudWorkspaceSnapshots?.[input.snapshotHash]?.plan;if(!plan)throw new DomainError('Checkpoint not staged.',404);if(input.maxWrites>0&&canSpend){const forecast=forecastCheckpointWrites(plan,state,{connectionId:cloud.connectionId(),bank:archive.bank});if(!await canSpend({plan,forecast,workspaceId:archive.workspaceId,connectionId:cloud.connectionId(),bank:archive.bank}))throw new DomainError('Insufficient authorized credit for this complete checkpoint. Read-only verification remains available.',409);}res.json(await archive.publish(input.snapshotHash,{maxWrites:input.maxWrites}));}));
 app.post('/api/cloud-workspace/recovery-preview',exclusive(async(req,res)=>{
  const input=previewInput.parse(req.body),expectedLocalHash=localHash(store.read()),connectionId=cloud?.connectionId?.();const scratch={workspaceId:input.workspaceId},journal={read:()=>structuredClone(scratch),update:fn=>fn(scratch)};
  const recovered=await service(journal,input.workspaceId,input.ownerId).recover();if(expectedLocalHash!==localHash(store.read()))throw new DomainError('Local data changed during recovery preview.',409);
  const previewId=randomUUID(),preview={previewId,...input,expectedLocalHash,connectionId,snapshotHash:recovered.snapshotHash,createdAt:now()};if(previews.size>=3)previews.delete(previews.keys().next().value);previews.set(previewId,preview);
  res.json({previewId,expectedLocalHash,snapshotHash:recovered.snapshotHash,workspaceId:input.workspaceId,activeOwnerId:recovered.activeOwnerId,canEdit:recovered.canEdit,counts:Object.fromEntries(['cases','companies','articles','officialDocuments'].map(key=>[key,recovered.state[key]?.length||0]))});
 }));
 app.post('/api/cloud-workspace/recovery-apply',exclusive(async(req,res)=>{
  const input=applyInput.parse(req.body),preview=previews.get(input.previewId);if(!preview||preview.expectedLocalHash!==input.expectedLocalHash||preview.snapshotHash!==input.snapshotHash||preview.connectionId!==cloud?.connectionId?.()||Date.parse(now())-Date.parse(preview.createdAt)>10*60*1000)throw new DomainError('Recovery preview is absent, stale or belongs to another connection.',409);
  if(localHash(store.read())!==input.expectedLocalHash)throw new DomainError('Local workspace changed after preview; no data was replaced.',409);
  const scratch={workspaceId:preview.workspaceId},journal={read:()=>structuredClone(scratch),update:fn=>fn(scratch)};const recovered=await service(journal,preview.workspaceId,preview.ownerId).recover();
  if(recovered.snapshotHash!==preview.snapshotHash||localHash(store.read())!==input.expectedLocalHash||preview.connectionId!==cloud.connectionId())throw new DomainError('Cloud head, connection or local data changed during recovery; no data was replaced.',409);
  const previous=store.read(),backup=await backupState(structuredClone(previous));if(!backup)throw new DomainError('Previous local workspace backup was not confirmed; recovery was not applied.',409);
  store.update(state=>{
   if(localHash(state)!==input.expectedLocalHash||preview.connectionId!==cloud.connectionId())throw new DomainError('Local data or connection changed while its backup was saved.',409);
   const migrations=state.migrations||[];for(const key of Object.keys(state))delete state[key];Object.assign(state,{cases:[],companies:[],articles:[],officialDocuments:[],historicalKnowledgeAssociations:[],incidents:[],events:[],outbox:[],memories:[],corpus:[],corpusSources:[],replayOutcomes:{},hindsightInvestigations:[],hindsightDerived:[],cloudOperations:[],cloudPackets:{},cloudWorkspaceSnapshots:{},migrations,...recovered.state,cloudWorkspaceLocal:{ownerId:preview.ownerId},cloudWorkspaceStatus:{status:'verified',snapshotHash:recovered.snapshotHash,activeOwnerId:recovered.activeOwnerId,verifiedAt:recovered.verifiedAt,requiresSourceReverification:true,note:'Cloud original-text checkpoint freshly recovered. Approved source documents must be reverified before use; one active editor only.'}});
  });previews.delete(input.previewId);res.json({restored:true,requiresSourceReverification:true,snapshotHash:recovered.snapshotHash,workspaceId:preview.workspaceId,activeOwnerId:recovered.activeOwnerId,canEdit:recovered.canEdit,backupSaved:true});
 }));
 app.post('/api/cloud-workspace/verify-sources',exclusive(async(req,res)=>{const input=z.object({sourceIds:z.array(z.string()).min(1).max(32)}).strict().parse(req.body);if(!configured())throw new DomainError('Configure Hindsight before source verification.',409);const verifier=new CloudSourceReverification(store,()=>cloud.provider(),{connectionId:()=>cloud.connectionId(),authorize,now});res.json(await verifier.verify(input.sourceIds));}));
 const markPending=()=>{assertCanEdit();return store.update(state=>{state.cloudWorkspaceStatus={...state.cloudWorkspaceStatus,status:'pending',dirtyAt:now(),note:'Local changes await a bounded Cloud checkpoint. No paid background write has been dispatched.'};return statusFrom(state);});};
 const statusFrom=state=>({status:state.cloudWorkspaceStatus.status,snapshotHash:state.cloudWorkspaceStatus.snapshotHash||null});
 return {status,assertCanEdit,markPending,queue:markPending,committed:()=>checkpoints.committed(),flush:()=>checkpoints.flush(),close(){checkpoints.close();previews.clear();}};
}
