import {savedInvestigations} from './investigation-history.js';
import { createHash, randomUUID } from 'node:crypto';
import { referenceSearch } from './reference-library.js';
import {versionedReference} from './versioned-docs.js';
import { sources,hiddenOutcomes } from './fixtures.js';
export class DomainError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const requireCase=(s,id)=>{const c=s.cases.find(c=>c.id===id);if(!c)throw new DomainError('Case not found.',404);return c;};
export const requireArticle=(s,id)=>{const a=s.articles.find(a=>a.id===id);if(!a)throw new DomainError('Article not found.',404);return a;};
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function event(s,c,text){const e={id:randomUUID(),at:new Date().toISOString(),text,caseId:c?.id||null};s.events.unshift(e);if(c)c.timeline.unshift(e);}
export function applicability(c,a){
 const reasons=[];
 if(c.executor!=='Unknown'&&a.executor!=='Unknown'&&c.executor!==a.executor)reasons.push('Different executor.');
 if(c.hosting!=='Unknown'&&a.hosting!=='Unknown'&&c.hosting!==a.hosting)reasons.push('Different hosting context.');
 if(!a.curation&&c.symptom!=='unclassified'&&a.symptom!=='unclassified'&&c.symptom!==a.symptom)reasons.push('Different observed failure stage or symptom.');
 if(a.runnerVersion&&c.runnerVersion&&a.runnerVersion!==c.runnerVersion)reasons.push('Runner version differs from the reviewed version.');
 if(a.chartVersion&&c.chartVersion&&a.chartVersion!==c.chartVersion)reasons.push('Chart version differs from the reviewed version.');
 if(a.serverVersion&&c.serverVersion&&a.serverVersion!==c.serverVersion)reasons.push('Server version differs from the reviewed version.');
 if(c.attempts.some(t=>t.articleId===a.id&&t.result==='Failed'))reasons.push('This article already failed for this case.');
 if(reasons.length)return {status:'incompatible',reasons};
 return {status:'review',reasons:[...(a.curation?['AI source-reviewed historical narrative; symptom and failure-stage applicability require explicit review. No symptom match or current cause is established.']:[]),...(!c.runnerVersion||!c.chartVersion?['Version context is incomplete.']:[]),'Check the actual environment and verification evidence before reuse. Historical success does not establish the current cause.']};
}
export function incidentMatch(c,i){
 const time=Date.parse(c.occurredAt);
 return c.hosting===(i.hosting||'GitLab.com')&&c.host.trim().toLowerCase()===i.host.toLowerCase()&&i.services.some(service=>service.toLowerCase()===c.service.trim().toLowerCase())&&Number.isFinite(time)&&time>=Date.parse(i.start)&&time<=Date.parse(i.end);
}
export const questionRules=[
 ['hosting','Where is GitLab hosted?','Separate GitLab.com outages from self-managed configurations.','DOC-HELM'],
 ['executor','Which executor runs this job?','The investigation depends on the executor.','DOC-K8S'],
 ['serverVersion','Which GitLab server version is affected?','Keep server and Runner versions distinct.','DOC-HELM'],
 ['runnerVersion','Which GitLab Runner version is installed?','Check release-specific behavior.','DOC-HELM'],
 ['chartVersion','Which Runner Helm chart version is installed?','Chart and Runner versions use different numbering.','DOC-HELM'],
 ['occurredAt','When did the failure happen?','Compare the timeline with documented incident windows.','DOC-K8S'],
 ['host','Which host or instance was affected?','Do not correlate reports from unrelated installations.','DOC-HELM'],
];
export function questions(c){return questionRules.filter(([k])=>(k!=='chartVersion'||c.executor==='Kubernetes')&&(!c[k]||c[k]==='Unknown')).map(([field,text,reason,sourceId])=>({field,text,reason,sourceId}));}
export function offlineDrafts(c,candidates){
 const applicable=candidates.filter(a=>a.match.status!=='incompatible');
 const attempts=c.attempts.map(a=>`${a.step} — ${a.result}: ${a.evidence}`).join('\n')||'No attempts recorded.';
 return {customer:`Hello,\n\nThank you for the report. ${c.attempts.length?'I have the steps you already tried and will not ask you to repeat failed suggestions. ':''}${c.resolution?'The recorded outcome is: '+c.resolution.fix:'The cause is not confirmed yet. '+(questions(c).slice(0,2).map(q=>q.text).join(' '))}\n\n${applicable.length?'We have relevant historical guidance, but need to check whether it applies to your environment.':'We will use the environment details and observed error to guide the next check.'}`,engineering:`${c.id} · ${c.title}\n\nREPORTED\n${c.description}\n\nENVIRONMENT\n${c.hosting}; ${c.executor}; server ${c.serverVersion||'unknown'}, Runner ${c.runnerVersion||'unknown'}, chart ${c.chartVersion||'unknown'}.\n\nATTEMPTS\n${attempts}\n\nPLANNED CHECKS\n${(c.tasks||[]).map(t=>`${t.completed?'Completed':'Pending'}: ${t.title}${t.evidence?' — '+t.evidence:''}`).join('\n')||'No planned checks recorded.'}\n\nEVIDENCE\n${candidates.map(a=>`${a.id} r${a.revision}: ${a.match.status}. ${a.match.reasons.join(' ')}${a.match.status==='incompatible'?'':` Historical action: ${a.fix}`}`).join('\n')||'No approved memory evidence available.'}\n\nCURRENT CAUSE\n${c.resolution?.cause||'Unknown; no cause has been confirmed.'}\n\nNEXT CHECK\n${referenceSearch(`${c.title} ${c.description} ${c.stage}`,c.executor).map(r=>versionedReference(r,c)).map(r=>`${r.question} Source: ${r.url}`).join('\n')||'Identify the failing job stage and collect its exact error and relevant service logs.'}`,provider:'Offline template · no AI model called'};
}
function generalized(text,s){
 let out=text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email removed]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[address removed]').replace(/\b(?:glpat-|gsk_|sk-)[\w-]+/g,'[credential removed]');
 for(const name of [...s.companies.map(x=>x.name),...s.cases.map(x=>x.contact)].filter(x=>x.length>3))out=out.split(name).join('[customer]');
 return out;
}
// Preserve explicit public references through approval; source claims remain distinct
// from the case's independently verified outcome. URLs must remain inert HTTPS links.
export function articleCitations(s,c){
 const catalog=[...sources,...(s.corpusSources||[])];
 const seed=c.sourceId?catalog.filter(x=>x.id===c.sourceId).map(x=>({...x,status:x.verification,summary:x.summary})):[];
 return [...(c.publicEvidence||[]),...seed].filter((r,i,all)=>all.findIndex(x=>x.id===r.id)===i).flatMap(r=>{
  try {const url=new URL(r.url);if(url.protocol!=='https:'||url.username||url.password)return [];return [{id:r.id,title:r.title,url:url.href,status:r.status||'Public source; check applicability',excerpt:generalized(String(r.summary||'').slice(0,700),s),...(r.quote?{quote:generalized(r.quote,s)}:{}),sourceDate:r.sourceDate||null,contradictions:(r.contradictions||[]).filter(x=>{try{return new URL(x.url).protocol==='https:';}catch{return false;}}).map(x=>({quote:generalized(x.quote,s),url:x.url,sourceDate:x.sourceDate||null}))}];}catch{return [];}
 });
}
export function approveKnowledge(s,caseId,input){
 const c=requireCase(s,caseId);
 if(!c.resolution)throw new DomainError('Record a confirmed resolution or workaround first.');
 if(!input.reviewed)throw new DomainError('Review the generalized article before approval.');
 const content={title:generalized(input.title,s),symptom:c.symptom,executor:c.executor,hosting:c.hosting,runnerVersion:input.runnerVersion||'',chartVersion:input.chartVersion||'',serverVersion:input.serverVersion||'',fix:generalized(input.fix,s),cause:generalized(input.cause||'',s),verification:generalized(input.verification,s),limitations:generalized(input.limitations,s),sourceIds:[...new Set([...(c.sourceId?[c.sourceId]:[]),...(c.publicEvidence||[]).map(r=>r.id)])],citations:articleCitations(s,c)};
 const fingerprint=hash({...content,title:''});
 if(input.targetArticleId){
  const a=requireArticle(s,input.targetArticleId);
  if(a.curation?.immutable)throw new DomainError('Published historical knowledge is immutable. Create a separately reviewed article instead.',409);
  if(input.expectedRevision!==a.revision)throw new DomainError('This article changed. Reload and review the latest revision.',409);
  if(a.fingerprint===fingerprint)return a;
  a.history.push({...a,history:undefined});
  Object.assign(a,content,{revision:a.revision+1,fingerprint,reviewer:input.reviewer,updatedAt:new Date().toISOString(),sync:'pending'});
  if(!a.curation?.immutable&&!a.sourceCases.includes(c.id))a.sourceCases.push(c.id);
  enqueue(s,a);if(!c.articleIds.includes(a.id))c.articleIds.push(a.id);event(s,c,`Approved ${a.id} revision ${a.revision}.`);return a;
 }
 const identity=a=>hash([a.symptom,a.executor,a.hosting,a.serverVersion,a.runnerVersion,a.chartVersion,a.fix.trim().toLowerCase().replace(/\s+/g,' '),a.cause.trim().toLowerCase(),a.limitations.trim().toLowerCase()]);
 const duplicate=s.articles.find(a=>!a.curation&&(a.fingerprint===fingerprint||identity(a)===identity(content)));
 if(duplicate){if(!duplicate.sourceCases.includes(c.id))duplicate.sourceCases.push(c.id);if(!c.articleIds.includes(duplicate.id))c.articleIds.push(duplicate.id);event(s,c,`Linked existing ${duplicate.id}; no duplicate memory.`);return duplicate;}
 if(c.proposal?.approvedArticleId)throw new DomainError('This outcome already has an article. Reuse it or explicitly revise it.',409);
 const a={...content,id:`KA-${String(Math.max(0,...s.articles.map(a=>Number(/^KA-(\d+)$/.exec(a.id)?.[1]||0)))+1).padStart(4,'0')}`,revision:1,fingerprint,reviewer:input.reviewer,sourceCases:[c.id],history:[],updatedAt:new Date().toISOString(),sync:'pending'};
 s.articles.push(a);c.articleIds.push(a.id);c.proposal={...c.proposal,approvedArticleId:a.id};enqueue(s,a);event(s,c,`Approved ${a.id}; queued shared knowledge.`);return a;
}
function enqueue(s,a){s.outbox.push({id:randomUUID(),articleId:a.id,revision:a.revision,hash:a.fingerprint,status:'pending',attempts:0,error:null,createdAt:new Date().toISOString()});}
export function reuseArticle(s,caseId,input){
 const c=requireCase(s,caseId),a=requireArticle(s,input.articleId);
 if(applicability(c,a).status==='incompatible')throw new DomainError('This article is incompatible or previously failed. Investigate before proposing a revised article.');
 if(!input.reviewed||!input.evidence.trim())throw new DomainError('Record applicability and outcome evidence before linking.');
 if(!c.articleIds.includes(a.id))c.articleIds.push(a.id);
 if(!a.curation?.immutable&&!a.sourceCases.includes(c.id))a.sourceCases.push(c.id);
 c.status='Resolved';c.resolution={fix:a.fix,cause:'',evidence:input.evidence,engineer:input.engineer,limitations:a.limitations};
 event(s,c,`Reused ${a.id} r${a.revision}; verified by ${input.engineer}. No shared memory duplicated.`);
}
export function publicSnapshot(s,config){return {...s,learningCloseouts:undefined,cloudWorkspaceSnapshots:undefined,hindsightInvestigations:undefined,hindsightDerived:undefined,officialDocuments:undefined,historicalKnowledgeAssociations:undefined,articles:s.articles.map(a=>({...a,associatedHistoricalReports:(s.historicalKnowledgeAssociations||[]).filter(link=>link.articleId===a.id&&link.articleRevision===a.revision&&link.articleFingerprint===a.fingerprint).map(({reportId,sourceHash,reviewDepth,rationale,reviewedAt,method,reviewer,humanReviewed,confirmed,independentlyReproduced})=>({reportId,sourceHash,reviewDepth,rationale,reviewedAt,method,reviewer,humanReviewed,confirmed,independentlyReproduced}))})),curatedRetentionPlans:undefined,cloudPackets:undefined,corpus:undefined,replayOutcomes:undefined,corpusSources:undefined,cases:s.cases.map(c=>({...c,savedInvestigations:savedInvestigations(s,c),hasReplay:!!(c.reconstructed&&(hiddenOutcomes[c.id]||s.replayOutcomes?.[c.id])?.sourceId===c.sourceId)})),memories:undefined,config:{appName:config.appName,memoryMode:'offline',agentMode:'offline',externalEnabled:false,liveVerified:false},sources:[...sources,...(s.corpusSources||[])]};}
