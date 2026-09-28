import {createHash} from 'node:crypto';
import {hash} from './domain.js';

export function validateWorkspaceAuthorization({state,connectionId,workspaceId,bank,kind,request}){
 if(workspaceId!==state.workspaceId||typeof bank!=='string')throw new Error('Archive workspace does not match its credit authority.');
 if(kind==='workspace-policy-read'){
  if(request?.operation!=='list-model-policies'||request.limit!==20||request.detail!=='content')throw new Error('Archive policy read exceeds its bound.');return;
 }
 const record=state.cloudWorkspaceSnapshots?.[request?.snapshotHash],doc=record?.plan.documents.find(d=>d.docId===request?.document?.docId),options=request?.options;
 if(kind!=='workspace-retain'||!record||record.connectionId!==connectionId||record.bank!==bank||request.operation!=='retain-archive'||!doc||hash(doc)!==hash(request.document)||Buffer.byteLength(doc.content)>12000||createHash('sha256').update(doc.content).digest('hex')!==doc.hash||!['chunk','manifest'].includes(doc.kind))throw new Error('Archive write requires an unchanged staged content-addressed document.');
 const journal=record.documents[doc.hash];
 if(!journal||journal.attempts!==0||options?.documentId!==doc.docId||options.operationId!==journal.operationId||options.async!==true||options.observationScopes!=='combined'||hash(options.tags)!==hash(doc.tags)||hash(options.metadata)!==hash(doc.metadata)||doc.metadata.source_type!=='operational-archive'||doc.metadata.workspace_id!==workspaceId||!doc.tags.includes(`lucid-operational:${workspaceId}`)||doc.tags.some(t=>t.startsWith('lucid-workspace-')||t.startsWith('lucid-source:')))throw new Error('Archive request differs from its isolated scope or was already attempted.');
}
