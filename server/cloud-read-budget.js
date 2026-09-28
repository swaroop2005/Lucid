import {existsSync} from 'node:fs';
import {HindsightCreditBudget} from '../scripts/lib/hindsight-credit-budget.js';
import {hash,DomainError} from './domain.js';

// Read-only recovery does not grant paid credit authority on a fresh machine.
// Existing deployments share the global metadata allowance; fresh caches keep
// a separate, explicitly zero-credit read journal with the same finite bound.
export function createCloudReadAuthorizer({settings,ledgerPath='work/hindsight-50-ledger.json',readLedgerPath='.data/cloud-read-ledger.json'}={}){
 return async({id,kind,connectionId,workspaceId,bank,request})=>{
  const secret=settings.read(),actual=secret?hash([secret.baseUrl,secret.bank,hash(secret.apiKey)]):null;
  if(!['workspace-read','workspace-source-read'].includes(kind)||connectionId!==actual||bank!==secret?.bank||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(workspaceId||''))throw new DomainError('Cloud recovery read does not match the selected connection and workspace.',409);
  const prefix=`lucid-ops-${workspaceId}-`;
  if(kind==='workspace-source-read'){
   if(request?.operation!=='get-source-document'||request.bank!==bank||request.scope!==`lucid-workspace-${workspaceId}`||!['official-document','knowledge-article'].includes(request.sourceKind)||!/^(?:KA|DOC)-[A-Za-z0-9_-]+$/.test(request.sourceId||'')||!Number.isInteger(request.revision)||request.revision<1||!['sourceHash','contentHash','packetHash'].every(k=>/^[a-f0-9]{64}$/.test(request[k]||''))||!request.docId?.startsWith(`${request.scope}-${request.sourceId}-r${request.revision}-`))throw new DomainError('Source recovery read is outside its exact canonical workspace identity.',409);
  }else if(request?.operation==='get-document'){
   if(typeof request.documentId!=='string'||!request.documentId.startsWith(prefix)||!/^.+-(?:manifest|chunk)-[a-f0-9]{64}$/.test(request.documentId))throw new DomainError('Recovery read is outside the operational archive.',409);
  }else if(request?.operation==='list-manifests'){
   const q=request.query;if(q?.q!==prefix+'manifest-'||q.limit!==128||q.offset!==0||q.tags_match!=='all_strict'||hash(q.tags)!==hash([`lucid-operational:${workspaceId}`,'kind:workspace-manifest']))throw new DomainError('Recovery inventory must use the complete bounded workspace scope.',409);
  }else throw new DomainError('Unapproved recovery metadata operation.',409);
  const ledger=new HindsightCreditBudget(existsSync(ledgerPath)?ledgerPath:readLedgerPath);
  if(!existsSync(ledger.file))ledger.withLock(()=>{if(!existsSync(ledger.file))ledger.save({schemaVersion:1,provider:'Hindsight Cloud metadata only',capUSD:0,unallocatedSafetyUSD:0,categoryCaps:{metadata:0},maxMetadataOperations:6000,calls:[],authorization:'Configured connection permits bounded zero-credit recovery reads. This journal authorizes no paid operations.'});});
  ledger.reserve({id,category:'metadata',operation:kind,reservedUSD:0,limits:{workspaceId,bank,connectionId,sourceId:request.sourceId,documentId:request.docId||request.documentId,requestHash:hash(request)}});ledger.mark(id,'dispatched');
  return {complete:()=>ledger.mark(id,'completed'),fail:error=>ledger.mark(id,'unverified',{httpStatus:error?.status||null})};
 };
}
