import {DomainError,hash} from './domain.js';
import {officialDocumentScopeTags} from './hindsight-documents.js';

export const HINDSIGHT_SCOPE_POLICY_VERSION=2;
export function articleScopeTags(article,scope){
 if(!/^[-a-zA-Z0-9_:]{1,160}$/.test(scope||'')||!/^KA-\d+$/.test(article?.id||'')||!Number.isInteger(article.revision)||article.revision<1||!/^[a-f0-9]{64}$/.test(article.fingerprint||''))throw new DomainError('A valid workspace and exact article revision are required.');
 const executor=['Kubernetes','Docker','Shell'].includes(article.executor)?article.executor:'Unknown';
 return [scope,'product:gitlab-runner',`executor:${executor.toLowerCase()}`,`lucid-source:${article.id}:r${article.revision}:${article.fingerprint}`];
}
export const equalTags=(left,right)=>Array.isArray(left)&&Array.isArray(right)&&left.length===new Set(left).size&&left.length===right.length&&left.every(tag=>right.includes(tag));
export const sourceScopeTags=(source,scope)=>source.kind==='official-document'?officialDocumentScopeTags(source,scope):articleScopeTags(source,scope);
export function verifiedArticleScope(article,{connectionId,scope}){
 const policy=article.cloudScope,retained=article.cloudRetention;
 if(!policy||policy.policyVersion!==2||policy.verified===false||!policy.verifiedAt||!Number.isFinite(Date.parse(policy.verifiedAt))||policy.connectionId!==connectionId||policy.revision!==article.revision||policy.articleHash!==article.fingerprint||!policy.contentHash||!policy.docId?.startsWith(scope+'-')||!equalTags(policy.tags,articleScopeTags(article,scope)))return false;
 return retained?.status==='succeeded'&&retained.connectionId===connectionId&&retained.revision===article.revision&&retained.articleHash===article.fingerprint&&retained.docId===policy.docId&&retained.contentHash===policy.contentHash;
}
export function investigationTagGroups(articles,scope){
 // A permanent impossible conjunction is safe even if somebody accidentally retains the reserved tag.
 if(!articles.length){const tags=[`${scope}:baseline-never-retain`];return [{tags,match:'exact'},{not:{tags,match:'any_strict'}}];}
 return [{or:articles.map(article=>({tags:sourceScopeTags(article,scope),match:'exact'}))}];
}
export function verifyScopeDocument(article,document,{connectionId,scope,verifiedAt=new Date().toISOString()}={}){
 const retained=article.cloudRetention,tags=articleScopeTags(article,scope);
 if(!retained||retained.connectionId!==connectionId||retained.revision!==article.revision||retained.articleHash!==article.fingerprint||!retained.contentHash||document?.id!==retained.docId||!document.id.startsWith(scope+'-')||typeof document.original_text!=='string'||hash(document.original_text)!==retained.contentHash||!equalTags(document.tags,tags)||!(document.memory_unit_count>0))throw new DomainError('The retained document does not match this exact article scope.',409);
 return {connectionId,revision:article.revision,articleHash:article.fingerprint,docId:retained.docId,tags,verifiedAt,policyVersion:2,contentHash:retained.contentHash};
}
