import {hash} from './domain.js';
import {MemoryProvider} from './providers.js';

export function validateLearningAuthorization({state,store,secret,connectionId,closeoutId,kind,request}){
 const record=state.learningCloseouts?.[closeoutId],article=state.articles.find(a=>a.id===record?.articleId),c=state.cases.find(c=>c.id===record?.caseId);
 if(!record||!article||article.curation||!article.reviewer?.trim()||!c?.resolution?.fix?.trim()||!c.resolution.evidence?.trim()||!article.sourceCases?.includes(c.id)||!c.articleIds?.includes(article.id))throw new Error('Learning dispatch requires a queued explicitly reviewed outcome.');
 const scope='lucid-workspace-'+state.workspaceId,plan=MemoryProvider.prototype.prepareRetention.call({store,c:{},scope:()=>scope},article);
 const expected={articleId:article.id,revision:article.revision,articleHash:article.fingerprint,planHash:hash(plan),docId:plan.docId,packet:plan.packet,operationId:record.operationId,scope,bank:secret.bank,operation:request?.operation};
 if(record.workspaceId!==state.workspaceId||record.connectionId!==connectionId||record.bank!==secret.bank||record.scope!==scope||record.revision!==article.revision||record.articleHash!==article.fingerprint||record.resolutionHash!==hash(c.resolution)||record.planHash!==hash(plan)||hash(record.plan)!==hash(plan)||hash(request)!==hash(expected))throw new Error('Learning request differs from its current approved frozen packet.');
 if(Buffer.byteLength(plan.packet.content)>12000)throw new Error('Reviewed learning packet exceeds its approved retention allowance.');
 const operations={'learning-policy-read':['list-model-policies'],'learning-retain':['retain'],'learning-metadata':['operation-status','get-document']};
 if(!operations[kind]?.includes(request.operation))throw new Error('Learning operation is outside its bounded workflow.');
 if(kind==='learning-retain'&&(record.status!=='preparing'||record.attempts!==0||!record.policyCheckedAt||record.policy?.automaticRefresh!==false||article.cloudRetention?.revision===article.revision))throw new Error('Learning write requires current policy and an unattempted revision.');
 return true;
}
