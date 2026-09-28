import {curationExclusions} from './historical-knowledge.js';
import {studySearch,studyReference,studies} from './study-library.js';
import {addCaseTask,updateCaseTask} from './tasks.js';
import {openSourceInvestigation} from './source-investigation.js';
import {relatedCases} from './related-cases.js';
import express from 'express';
import {CloudWorkflow} from './cloud-workflow.js';
import {HindsightInvestigation} from './hindsight-investigation.js';
import {mountDerivedRoutes} from './hindsight-derived-routes.js';
import {officialDocumentEvidence,verifiedOfficialDocumentScope} from './hindsight-documents.js';
import {corpusBatch,corpusSnapshot,reviewImport,importCorpus,openReplay} from './corpus.js';
import {incidentInput,saveIncident,refreshIncidentLinks,caseLinks} from './incidents.js';
import {references,referenceSearch} from './reference-library.js';
import {versionedReference} from './versioned-docs.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { initialState, hiddenOutcomes, sources } from './fixtures.js';
import { DomainError,requireCase,requireArticle,applicability,incidentMatch,questions,event,approveKnowledge,reuseArticle,publicSnapshot,hash,offlineDrafts } from './domain.js';
import { MemoryProvider,RetentionWorker,resolveRecall } from './providers.js';
const text=z.string().trim().max(4000), required=text.min(3);
const context=z.object({title:required.optional(),description:required.optional(),owner:text.max(100).optional(),priority:z.enum(['Low','Normal','High','Urgent']).optional(),hosting:z.enum(['Self-managed','GitLab.com','Dedicated','Unknown']),executor:z.enum(['Kubernetes','Docker','Shell','Unknown']),serverVersion:text.max(80),runnerVersion:text.max(80),chartVersion:text.max(80),host:text.max(200),service:text.max(100),occurredAt:text.max(80),recentChanges:text,stage:text.max(100),symptom:text.max(100)}).strict();
const knowledge=z.object({title:required,fix:required,cause:text,verification:required,limitations:required,reviewer:required,reviewed:z.literal(true),serverVersion:text.max(80).default(''),runnerVersion:text.max(80).default(''),chartVersion:text.max(80).default(''),targetArticleId:z.string().optional(),expectedRevision:z.number().int().optional()}).strict();
const identity=c=>hash([c.title,c.description,c.hosting,c.executor,c.serverVersion,c.runnerVersion,c.chartVersion,c.host,c.occurredAt,c.stage,c.symptom,c.service,c.recentChanges,c.attempts,c.resolution,c.drafts,c.publicEvidence,c.tasks]);
export function createApp(store,config,dependencies={}){
 const app=express();const memory=dependencies.memory||new MemoryProvider(store,{...config,memoryMode:'offline',agentMode:'offline',allowExternal:false});const worker=new RetentionWorker(store,memory);const cloud=dependencies.cloudWorkflow||(dependencies.settings?new CloudWorkflow(store,dependencies.settings):null);
 const reserveEvidence=()=>dependencies.evidence?.reserveSources([...curationExclusions(store.read(),dependencies.evidence?.db)]);reserveEvidence();
 app.disable('x-powered-by');app.use(express.json({limit:'100kb'}));
 app.use('/api',(req,res,next)=>{
  res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
  if(!['127.0.0.1','localhost','[::1]'].includes(req.hostname))return res.status(403).json({error:'Local access only.'});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   if(req.get('x-lucid-local')!=='1')return res.status(403).json({error:'Use the local Lucid workspace to make changes.'});
   const origin=req.get('origin');if(origin){try{if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname)||new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Origin not allowed.'});}catch{return res.status(403).json({error:'Invalid origin.'});}}
  }next();
 });
 mountDerivedRoutes(app,store,{cloud,configured:()=>!!dependencies.settings?.status().configured,authorize:dependencies.authorizeHindsight,service:dependencies.hindsightDerived});
 // Historical OpenAI code and saved results remain inactive. No credentials or provider routes are mounted.
 let investigationBusy=false;
 if(dependencies.settings){
  app.get('/api/cloud-settings',(_,res)=>res.json(dependencies.settings.status()));
  app.put('/api/cloud-settings',(req,res)=>{dependencies.settings.save(req.body);res.json({saved:true});});
  app.post('/api/cloud-settings/test',()=>{throw new DomainError('Standalone paid connection checks are paused. Hindsight investigations use the shared credit allowance.',410);});
 }
 if(dependencies.evidence){
 app.get('/api/evidence/:id/related',(req,res)=>{const report=dependencies.evidence.get(req.params.id);if(!report)throw new DomainError('Report not found.',404);res.json(relatedCases(dependencies.evidence,report,{excludeIds:[report.id],excludeUrls:[report.url]}));});
 app.get('/api/evidence/enrichment',(_,res)=>res.json(dependencies.evidence.enrichmentStats()));
 app.get('/api/evidence/:id/enrichment',(req,res)=>{if(!dependencies.evidence.get(req.params.id))throw new DomainError('Report not found.',404);res.json(dependencies.evidence.getEnrichment(req.params.id));});
 app.get('/api/evidence/:id/discussion',(req,res)=>{if(!dependencies.evidence.get(req.params.id))throw new DomainError('Report not found.',404);res.json(dependencies.evidence.discussion(req.params.id,{page:Number(req.query.page)||1,limit:50}));});
 app.post('/api/evidence/:id/open',(req,res)=>{const report=dependencies.evidence.get(req.params.id);if(!report)throw new DomainError('Report not found.',404);const reference=dependencies.evidence.selectedReference(report.id);const result=store.update(s=>openSourceInvestigation(s,report,reference));res.status(201).json({id:result.id});});
 app.get('/api/evidence/stats',(_,res)=>res.json(dependencies.evidence.stats()));
 app.get('/api/evidence',(req,res)=>res.json(dependencies.evidence.search({q:String(req.query.q||'').slice(0,500),family:String(req.query.family||'').slice(0,100),kind:String(req.query.kind||'').slice(0,50),outcome:String(req.query.outcome||'').slice(0,50),state:String(req.query.state||'').slice(0,20),page:Math.floor(Number(req.query.page)||1)})));
 app.get('/api/evidence/:id',(req,res)=>{const report=dependencies.evidence.get(req.params.id);if(!report)throw new DomainError('Report not found.',404);res.json(report);});
 }
 if(cloud){
 app.post('/api/articles/:id/cloud-status',async(req,res)=>{
  const {expectedRevision}=z.object({expectedRevision:z.number().int().positive()}).strict().parse(req.body);
  if(!dependencies.authorizeHindsight)throw new DomainError('Cloud status requires the authorized Hindsight credit ledger.',409);
  const operationId='status-'+randomUUID(),connectionId=cloud.connectionId();
  const reservation=await dependencies.authorizeHindsight({id:operationId,investigationId:operationId,kind:'investigation-metadata',budget:'mid',connectionId,request:{action:'retention-status',articleId:req.params.id,expectedRevision}});
  if(cloud.connectionId()!==connectionId)throw new DomainError('The Hindsight connection changed before status lookup.',409);
  try{const result=await cloud.checkRetention(req.params.id,expectedRevision);await reservation?.complete?.(result);res.json(result);}catch(error){await reservation?.fail?.(error);throw error;}
 });
 app.post('/api/articles/:id/retry-cloud',()=>{throw new DomainError('Manual retention retries are paused. The reviewed batch workflow owns retention and its credit allowance.',410);});
 app.post('/api/articles/:id/retire-cloud',()=>{throw new DomainError('Cloud retagging is paused because it can trigger billed reconsolidation. Use the reviewed batch workflow.',410);});
 }
 app.get('/api/cases/:id/reflection',(req,res)=>res.json({preview:requireCase(store.read(),req.params.id).reflection?.preview||null,stale:true,canReflect:false,reason:'Use Prepare investigation for the current scoped Hindsight workflow.'}));
 app.post('/api/cases/:id/reflection',()=>{throw new DomainError('This earlier reflection workflow is inactive. Use Prepare investigation with Hindsight.',410);});
 app.get('/api/knowledge/curation-summary',(_,res)=>{const articles=publicSnapshot(store.read(),config).articles.filter(a=>a.curation);res.json({articles:articles.length,sourceReports:new Set(articles.flatMap(a=>[...(a.historicalReportIds||[]),...(a.associatedHistoricalReports||[]).map(r=>r.reportId)])).size,humanReviewed:0,confirmed:0,independentlyReproduced:0,retention:'Local index; Hindsight retention requires an explicit action'});});
 app.get('/api/corpus',(_,res)=>res.json(corpusSnapshot(store.read())));
 app.post('/api/corpus/preview',(req,res)=>{const {records}=corpusBatch.parse(req.body);const plan=reviewImport(store.read(),records);res.json({added:plan.additions.length,duplicates:plan.duplicates});});
 app.post('/api/corpus/import',(req,res)=>{const {records}=corpusBatch.parse(req.body);const result=store.update(s=>importCorpus(s,records));reserveEvidence();res.json(result);});
 app.post('/api/corpus/:id/open',(req,res)=>res.json(store.update(s=>openReplay(s,req.params.id))));
 app.get('/api/cases/:id/related',(req,res)=>{const state=store.read(),c=requireCase(state,req.params.id);if(!dependencies.evidence)throw new DomainError('The local evidence index is unavailable.',503);const origin=[...sources,...(state.corpusSources||[])].find(s=>s.id===c.sourceId);res.json(relatedCases(dependencies.evidence,c,{excludeIds:c.evidenceReportId?[c.evidenceReportId]:[],excludeUrls:origin?[origin.url]:[]}));});
 app.get('/api/cases/:id/evidence',(req,res)=>{const c=requireCase(store.read(),req.params.id);res.json({selected:c.publicEvidence||[],suggested:dependencies.evidence?.suggest(String(req.query.q||`${c.title} ${c.description}`).slice(0,4000),c)||[]});});
 app.post('/api/cases/:id/evidence',(req,res)=>{const {id,remove}=z.object({id:z.string().max(100),remove:z.boolean().default(false)}).strict().parse(req.body);const ref=remove?null:id.startsWith('STUDY-')?studyReference(studies.find(s=>'STUDY-'+s.id===id)||(()=>{throw new DomainError('Study not found.',404)})()):dependencies.evidence?.selectedReference(id.replace(/^SRC-/,''),requireCase(store.read(),req.params.id));if(!remove&&!ref)throw new DomainError('Source report not found.',404);res.json(store.update(s=>{const c=requireCase(s,req.params.id);c.publicEvidence??=[];if(remove)c.publicEvidence=c.publicEvidence.filter(r=>r.id!==id);else if(!c.publicEvidence.some(r=>r.id===ref.id)){if(c.publicEvidence.length>=3)throw new DomainError('Keep up to three selected sources per investigation.',400);c.publicEvidence.push(ref);}c.analysis=null;event(s,c,remove?'Reference removed from investigation.':'Source selected for investigation; outcome remains unverified.');return c.publicEvidence;}));});
 app.get('/api/references',(_,res)=>res.json(references));
 app.get('/api/official-documents',(_,res)=>{const state=store.read();res.json((state.officialDocuments||[]).map(d=>({id:d.id,title:d.title,url:d.url,component:d.component,version:d.version,sectionHeading:d.sectionHeading,sectionText:d.sectionText,executor:d.executor,hosting:d.hosting,sourceHash:d.sourceHash,sectionHash:d.sectionHash,sourceRef:d.sourceRef,sourceCommit:d.sourceCommit,retrievedAt:d.retrievedAt,cloudVerified:!!cloud&&verifiedOfficialDocumentScope(d,{connectionId:cloud.connectionId(),scope:'lucid-workspace-'+state.workspaceId})})));});
 app.get('/api/workspace',(_,res)=>{const snapshot=publicSnapshot(store.read(),config);if(cloud)snapshot.articles=snapshot.articles.map(a=>({...a,cloudRetention:cloud.retentionView(a)}));const hindsight=dependencies.settings?.status();Object.assign(snapshot.config,{agentMode:hindsight?.configured?'hindsight-on-demand':'offline',supportModel:null,cloudMemoryAvailable:!!hindsight?.configured,externalEnabled:!!hindsight?.configured,liveVerified:!!hindsight?.lastResult?.verified,verificationScope:'Hindsight connection status only; generated advice still requires review.'});res.json(snapshot);});
 app.post('/api/articles/:id/retain-cloud',()=>{throw new DomainError('Manual Cloud retention is paused. Reviewed batches use the shared credit allowance; this article remains local.',410);});
 app.post('/api/incidents',(req,res)=>{const input=incidentInput.parse(req.body);res.status(201).json(store.update(s=>saveIncident(s,input)));});
 app.put('/api/incidents/:id',(req,res)=>{const input=incidentInput.parse(req.body);res.json(store.update(s=>saveIncident(s,input,req.params.id)));});
 app.post('/api/cases',(req,res)=>{
  const input=z.object({title:required,description:required,companyName:required,contact:required}).strict().parse(req.body);
  const result=store.update(s=>{let company=s.companies.find(o=>o.name.toLowerCase()===input.companyName.toLowerCase());if(!company){company={id:randomUUID(),name:input.companyName,note:'Locally entered company'};s.companies.push(company);}
   const template=initialState().cases[0];const id=`CS-${Math.max(...s.cases.map(c=>Number(c.id.slice(3))))+1}`;const c={...template,id,title:input.title,description:input.description,companyId:company.id,contact:input.contact,owner:'',priority:'Normal',tasks:[],hosting:'Unknown',executor:'Unknown',symptom:'unclassified',stage:'Unknown',sourceId:null,sourceDate:null,reconstructed:false,timeline:[],attempts:[],articleIds:[],incidentIds:[],publicEvidence:[]};s.cases.unshift(c);event(s,c,'Case created.');return c;});res.status(201).json(result);
 });
 app.patch('/api/cases/:id/context',(req,res)=>{const data=context.parse(req.body);res.json(store.update(s=>{const c=requireCase(s,req.params.id);Object.assign(c,data,{analysis:null});refreshIncidentLinks(s,c);event(s,c,'Environment details updated; investigation needs refreshing.');return c;}));});
 app.get('/api/cases/:id/tasks',(req,res)=>res.json(requireCase(store.read(),req.params.id).tasks||[]));
 app.post('/api/cases/:id/tasks',(req,res)=>{const input=z.object({title:required.max(500),sourceId:z.string().max(100).optional()}).strict().parse(req.body);res.status(201).json(store.update(s=>addCaseTask(s,req.params.id,input)));});
 app.patch('/api/cases/:id/tasks/:taskId',(req,res)=>{const input=z.object({completed:z.boolean(),evidence:text.max(2000).default('')}).strict().parse(req.body);res.json(store.update(s=>updateCaseTask(s,req.params.id,req.params.taskId,input)));});
 app.post('/api/cases/:id/attempts',(req,res)=>{
  const data=z.object({step:required,result:z.enum(['Failed','Succeeded','Inconclusive']),evidence:required,articleId:z.string().optional()}).strict().parse(req.body);
  res.json(store.update(s=>{const c=requireCase(s,req.params.id);if(data.articleId)requireArticle(s,data.articleId);c.attempts.push({...data,id:randomUUID(),at:new Date().toISOString()});c.analysis=null;event(s,c,`Recorded ${data.result.toLowerCase()} attempt: ${data.step}`);return c;}));
 });
 app.post('/api/cases/:id/analyze',async(req,res)=>{
  const input=z.object({useMemory:z.boolean(),useHindsight:z.boolean().default(false),searchDepth:z.enum(['mid','high']).default('high'),acknowledgeCreditUse:z.literal(true).optional(),useModel:z.boolean().optional(),useCloud:z.boolean().optional()}).strict().parse(req.body);
  const useMemory=input.useMemory,live=input.useHindsight||input.useModel||input.useCloud;
  if(live&&!input.acknowledgeCreditUse)throw new DomainError('Select the credit-using Hindsight investigation explicitly.',400);
  if(live&&!cloud&&!dependencies.hindsightInvestigation)throw new DomainError('Save a Hindsight connection before investigating.',400);
  if(investigationBusy)throw new DomainError('Another investigation is running.',409);
  const state=store.read(),c=requireCase(state,req.params.id),before=identity(c);
  const refs=[...(c.publicEvidence||[]),...referenceSearch(`${c.title} ${c.description} ${c.stage}`,c.executor).map(r=>versionedReference(r,c)),...studySearch(`${c.title} ${c.description}`)];
  investigationBusy=true;
  try{
   let candidates=[],generated=null;
   if(live){
    const engine=dependencies.hindsightInvestigation||new HindsightInvestigation(store,cloud.provider(),{connectionId:()=>cloud.connectionId(),authorize:dependencies.authorizeHindsight});
    generated=await engine.investigate(c.id,{budget:input.searchDepth,useMemory,references:refs});
    for(const document of store.read().officialDocuments||[])if(generated.evidenceIds?.includes(document.id))refs.push(officialDocumentEvidence(document));
    const ids=new Set(generated.evidenceIds||[]);candidates=store.read().articles.filter(a=>ids.has(a.id)).map(a=>({...a,match:applicability(c,a),memoryEvidence:{provider:'Hindsight scoped source verification',revision:a.revision,documentId:a.cloudScope?.docId,retrievedAt:generated.generatedAt,sourceFacts:(generated.provenance?.records||[]).filter(r=>r.articleId===a.id).map(r=>({id:r.factId,text:r.text})),truncated:false}}));
   }else if(useMemory){const records=await memory.recall(`${c.title} ${c.description} ${c.symptom} ${c.stage} ${c.executor} ${c.hosting} ${c.runnerVersion} ${c.chartVersion}`,c);candidates=resolveRecall(store.read(),records).map(a=>({...a,match:applicability(c,a)}));}
   const drafts=generated?{customer:generated.customer,engineering:generated.engineering,provider:generated.provider}:await (dependencies.draft||((_config,ticket,articles)=>offlineDrafts(ticket,articles)))(config,c,candidates,useMemory);
   if(!generated){const evidenceRefs=refs.filter(r=>r.kind&&r.kind!=='Official documentation');if(evidenceRefs.length)drafts.engineering+='\n\nReference evidence — check applicability; not a confirmed fix:\n'+evidenceRefs.map(r=>`[${r.id}] ${r.title}: ${r.summary.slice(0,400)}\n${r.url}`).join('\n\n');}
   const result=store.update(s=>{const current=requireCase(s,c.id);if(before!==identity(current))throw new DomainError('Case changed during investigation. Run it again with the latest details.',409);if(candidates.some(a=>!s.articles.some(x=>x.id===a.id&&x.revision===a.revision&&x.fingerprint===a.fingerprint)))throw new DomainError('Knowledge changed during investigation. Run it again.',409);
    refreshIncidentLinks(s,current);current.analysis={useMemory,modelResult:generated?{provider:generated.provider,investigationId:generated.investigationId,searchDepth:input.searchDepth,mode:generated.mode,auditReview:generated.auditReview,citations:generated.citations,nextQuestions:generated.nextQuestions,usage:generated.usage,evidenceIds:generated.evidenceIds||[],evidenceSelection:generated.evidenceSelection||null,provenance:generated.provenance,traceSummary:{toolCalls:(generated.trace?.tool_calls?.length||0)+(generated.auditTrace?.tool_calls?.length||0),llmCalls:(generated.trace?.llm_calls?.length||0)+(generated.auditTrace?.llm_calls?.length||0)}}:null,provider:generated?.provider||'Local preparation · no AI call',at:new Date().toISOString(),questions:questions(c),references:refs,candidates,incidentCandidates:s.incidents.filter(i=>incidentMatch(c,i)),finding:generated?generated.finding:c.resolution?'A reviewed outcome is recorded.':'Current cause is unconfirmed. Similar symptoms alone do not establish a shared incident.'};current.drafts=drafts;event(s,current,`Investigation prepared · ${live?'Hindsight':'local preparation'} · ${useMemory?'memory enabled':'memory disabled'}.`);return current;});res.json(result);
  }finally{investigationBusy=false;}
 });
 app.put('/api/cases/:id/drafts',(req,res)=>{const data=z.object({customer:text.max(8000),engineering:text.max(16000)}).strict().parse(req.body);res.json(store.update(s=>{const c=requireCase(s,req.params.id);c.drafts={...data,provider:'Human-edited draft'};event(s,c,'Draft changes saved locally.');return c;}));});
 app.get('/api/cases/:id/replay-outcome',(req,res)=>{const state=store.read(),c=requireCase(state,req.params.id),out=hiddenOutcomes[c.id]||state.replayOutcomes?.[c.id];const result=c.reconstructed&&out?.sourceId===c.sourceId?out:null;if(!result)throw new DomainError('No withheld outcome is available for this case.',404);res.json(result);});
 app.post('/api/cases/:id/resolution',(req,res)=>{
  const data=z.object({fix:required,cause:text,evidence:required,limitations:required,engineer:required,confirmed:z.literal(true)}).strict().parse(req.body);
  res.json(store.update(s=>{const c=requireCase(s,req.params.id);c.resolution=data;c.status='Resolved';c.analysis=null;c.proposal={title:`${c.stage}: ${c.symptom.replaceAll('-',' ')}`,fix:data.fix,cause:data.cause,verification:data.evidence,limitations:data.limitations,approvedArticleId:c.proposal?.approvedArticleId};event(s,c,`Outcome confirmed by ${data.engineer}. Article draft ready for review.`);return c;}));
 });
 app.post('/api/cases/:id/knowledge',(req,res)=>{const input=knowledge.parse(req.body);const a=store.update(s=>approveKnowledge(s,req.params.id,input));res.json(a);void worker.run();});
 app.post('/api/cases/:id/reuse',(req,res)=>{const input=z.object({articleId:z.string(),reviewed:z.literal(true),evidence:required,engineer:required}).strict().parse(req.body);store.update(s=>reuseArticle(s,req.params.id,input));res.json({ok:true});});
 app.post('/api/cases/:id/incident',(req,res)=>{
  const data=z.object({incidentId:z.string(),evidence:required,confirmed:z.literal(true),expectedRevision:z.number().int().positive().optional()}).strict().parse(req.body);
  store.update(s=>{const c=requireCase(s,req.params.id),i=s.incidents.find(i=>i.id===data.incidentId);if(!i||!incidentMatch(c,i))throw new DomainError('Host, time and service do not support this incident link.');if(data.expectedRevision!==undefined&&data.expectedRevision!==(i.revision||1))throw new DomainError('Incident changed. Review the latest evidence.',409);if(!c.incidentIds.includes(i.id))c.incidentIds.push(i.id);const links=caseLinks(c);let link=links.find(l=>l.incidentId===i.id);if(!link){link={incidentId:i.id};links.push(link);}Object.assign(link,{state:'confirmed',revision:i.revision||1,evidence:data.evidence,at:new Date().toISOString()});event(s,c,`Incident link confirmed: ${i.id}. Evidence: ${data.evidence}`);});res.json({ok:true});
 });
 app.post('/api/retention/:id/retry',(req,res)=>{store.update(s=>{const job=s.outbox.find(j=>j.id===req.params.id);if(!job)throw new DomainError('Retention job not found.',404);if(job.status!=='failed')throw new DomainError('Only failed jobs can be retried.');job.status='pending';job.error=null;});res.json({ok:true});void worker.run();});
 app.use('/api',(_,res)=>res.status(404).json({error:'API route not found.'}));
 app.use((err,req,res,next)=>{if(err instanceof z.ZodError)return res.status(400).json({error:'Check required fields and valid values.',fields:err.issues.map(i=>i.path.join('.'))});if(err instanceof DomainError||err.code==='INVALID_MEMORY_PACKET')return res.status(err.status).json({error:err.message});if(err.type==='entity.parse.failed')return res.status(400).json({error:'Invalid JSON request.'});if(err.type==='entity.too.large')return res.status(413).json({error:'Request is too large.'});res.status(502).json({error:'The provider or local operation failed. No simulated fallback was used. Check configuration and try again.'});});
 return {app,worker,memory};
}
