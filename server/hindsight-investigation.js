import {randomUUID} from 'node:crypto';
import {DomainError,applicability,hash,requireCase} from './domain.js';
import {investigationInput,investigationModelContext,investigationInstructions,validateInvestigationOutput} from './openai.js';
import {reflectionIdentity,supportDirective} from './reflection.js';
import {sourceScopeTags,equalTags,investigationTagGroups,verifiedArticleScope} from './hindsight-scope.js';
import {officialDocumentApplicability,verifiedOfficialDocumentScope} from './hindsight-documents.js';
import {buildAuditRequest,validateAuditOutput,renderAuditDiagnostics} from './hindsight-audit.js';
import {buildInvestigationPlanRequest,validateInvestigationPlan,renderInvestigationPlan,parseInvestigationPlanText} from './investigation-plan.js';

// Two complete article packets can produce several facts plus observation ancestors.
// Validate all of them within a fixed allowance; never accept partial provenance.
export const MAX_PROVENANCE_READS=32;
export const investigationResponseSchema={type:'object',description:'Complete editable support drafts. Preserve exact inline [ID] evidence attribution in each field; never replace the drafts with third-person summaries. Missing or unrecorded actions remain unknown, not undone. No cause is established merely by a historical report. Obey each source usePolicy: historical sources suggest conditional hypotheses and diagnostic questions, not prescriptions or current mechanism exclusions.',additionalProperties:false,required:['finding','customer','engineering','citations','nextQuestions'],properties:{
 finding:{type:'string',description:'Current reported observations and explicitly conditional hypotheses, with inline [ID] citations for evidence-based claims. Do not say likely, confirmed, or not applied without case evidence. Distinguish an unknown action from a failed or unperformed one.'},
 customer:{type:'string',description:'The complete concise unsent message addressed to the customer, preserving inline [ID] citations. Acknowledge what they already tried, ask the most discriminating unresolved question and give one source-supported next diagnostic check. A useful next step can request an observable artifact without inventing a command. Prescriptive changes require an explicit exact-version official instruction and current-case evidence establishing its prerequisites. Do not summarize the customer in third person.'},
 engineering:{type:'string',description:'The complete internal engineering draft with known environment and versions, all failed attempts relevant to advice, uncertainties, and the next discriminating check with expected observation. Preserve exact inline [ID] citations on technical claims. Do not repeat a completed or failed check without explicitly identifying new evidence or a different target. Historical nonmatch or missing evidence cannot rule out a current mechanism. For a conditional hypothesis, identify the observation that would distinguish it and explain the next decision for each result.'},
 citations:{type:'array',description:'Exactly the canonical evidence IDs appearing as separate [ID] inline citations in finding, customer, engineering or nextQuestions. No combined [ID1, ID2] brackets. Do not list an ID absent from the draft text.',items:{type:'string'}},
 nextQuestions:{type:'array',maxItems:3,description:'Up to three unresolved questions ordered by diagnostic value. Do not ask for values or completed checks already in the case. Preserve inline [ID] attribution if a question relies on supplied evidence.',items:{type:'string'}}}};
export function investigationRecallQuery(c){
 // Versions belong to applicability, not natural-language date extraction.
 const versions=new Set([c.runnerVersion,c.serverVersion,c.chartVersion].filter(v=>typeof v==='string'&&/^\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?$/.test(v)));
 const discovery=text=>String(text||'').replace(/\b\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?\b/g,token=>versions.has(token)?'':token).replace(/\s+/g,' ').trim();
 const title=discovery([c.title,c.executor,c.symptom].filter(Boolean).join(' '));
 if(Buffer.byteLength(title)>1000)throw new DomainError('Investigation search summary is too long.');
 let query=title;
 // Discovery text only: the full report and every failed attempt remain intact in Reflect context.
 for(const word of discovery(c.description).split(/\s+/)){if(Buffer.byteLength(query+' '+word)>1500)break;query+=' '+word;}
 return query.trim();
}
const fail=message=>{throw new DomainError(message,502);};
const basedOnSchemaKeys=new Set(['memories','mental_models','directives']);
export function eligibleInvestigationArticles(state,c,{connectionId,scope}){
 return state.articles.filter(a=>verifiedArticleScope(a,{connectionId,scope})&&applicability(c,a).status!=='incompatible').map(a=>({...a,match:applicability(c,a)}));
}
export function eligibleInvestigationDocuments(state,c,{connectionId,scope}){
 return (state.officialDocuments||[]).filter(d=>verifiedOfficialDocumentScope(d,{connectionId,scope})&&officialDocumentApplicability(c,d).status==='review').map(d=>({...d,match:officialDocumentApplicability(c,d)}));
}
const sourceRecord=source=>source.kind==='official-document'?{sourceId:source.id,sourceType:'official-document',officialDocumentId:source.id,revision:source.revision,documentHash:source.fingerprint,url:source.url,component:source.component,version:source.version,sourceHash:source.sourceHash,sectionHash:source.sectionHash}:{sourceId:source.id,sourceType:'experience-memory',articleId:source.id,revision:source.revision,articleHash:source.fingerprint};
export function validateRawFact(fact,articles,scope){
 if(!fact||typeof fact.id!=='string'||!fact.id||typeof fact.text!=='string'||!['world','experience'].includes(fact.type||fact.fact_type))fail('Returned memory is not a verifiable source fact.');
 const article=articles.find(a=>a.cloudScope.docId===fact.document_id&&equalTags(fact.tags,sourceScopeTags(a,scope)));
 const metadata=fact.metadata;
 if(!article||String(metadata?.revision)!==String(article.revision)||metadata?.hash!==article.fingerprint||metadata?.workspace_scope!==scope)fail('Returned memory is outside the exact current source scope.');
 if(article.kind==='official-document'){
  if(metadata.source_type!=='official-document'||metadata.official_document_id!==article.id||metadata.article_id!=null||metadata.source_hash!==article.sourceHash||metadata.section_hash!==article.sectionHash||metadata.component!==article.component||metadata.version!==article.version||metadata.source_ref!==article.sourceRef||metadata.source_commit!==(article.sourceCommit||''))fail('Returned memory is outside the exact official document scope.');
 }else if(metadata.article_id!==article.id||metadata.official_document_id!=null||metadata.source_type==='official-document')fail('Returned memory is outside the exact current article scope.');
 return {factId:fact.id,...sourceRecord(article),documentId:fact.document_id,text:fact.text,type:fact.type||fact.fact_type};
}
export function validateRecallEvidence(result,articles,scope){
 if(!Array.isArray(result?.results))fail('Hindsight recall returned no verifiable result list.');
 if(result.results.length>100)fail('Recall exceeded the bounded result validation limit.');
 return result.results.map(fact=>validateRawFact(fact,articles,scope));
}
export const MAX_DISCOVERY_READS=8;
// The provider's semantic arm can find useful sources that its final cross-encoder
// discards. Trace IDs are discovery hints only; fresh facts establish eligibility.
export async function semanticRecallEvidence(result,articles,scope,readMemory){
 const arms=result?.trace?.retrieval_results;
 if(!Array.isArray(arms)||result.trace.truncated===true)return validateRecallEvidence(result,articles,scope).map(r=>({...r,discovery:'Validated final results; semantic trace unavailable'}));
 const candidates=arms.filter(a=>a.method_name==='semantic'&&['world','experience'].includes(a.fact_type)).flatMap(a=>Array.isArray(a.results)?a.results:[])
  .filter(r=>typeof r.node_id==='string'&&r.node_id.length<=200&&typeof r.text==='string'&&Number.isFinite(r.score)).sort((a,b)=>b.score-a.score);
 const unique=[...new Map(candidates.map(r=>[r.node_id,r])).values()].slice(0,MAX_DISCOVERY_READS),records=[];
 for(const candidate of unique){
  const fact=await readMemory(candidate.node_id);
  if(fact?.id!==candidate.node_id||fact.state!=='valid'||fact.invalidated_at||fact.edited_at||fact.text!==candidate.text)fail('Semantic discovery fact changed or is not valid.');
  records.push({...validateRawFact(fact,articles,scope),discovery:'Hindsight semantic arm',semanticScore:candidate.score});
 }
 // If the provider supplies semantic candidates, use their verified ordering.
 // Never pad a short list with less relevant final-ranking matches.
 return unique.length?records:validateRecallEvidence(result,articles,scope).map(r=>({...r,discovery:'Validated final results; no recognized semantic candidates'}));
}
export async function validateBasedOn(result,articles,{scope,readMemory,allowedDirectiveContents=[supportDirective],maxReads=MAX_PROVENANCE_READS}={}){
 const basis=result?.based_on;
 if(!basis||typeof basis!=='object'||Array.isArray(basis)||Object.keys(basis).some(key=>!basedOnSchemaKeys.has(key)))fail('Hindsight did not return the expected evidence provenance.');
 for(const key of basedOnSchemaKeys)if(basis[key]!=null&&!Array.isArray(basis[key]))fail('Malformed Hindsight evidence provenance.');
 if(basis.mental_models?.length)fail('Unreviewed mental models were used by the investigation.');
 if((basis.directives||[]).some(d=>!d?.id||!allowedDirectiveContents.includes(d.content)))fail('An unverified directive was used by the investigation.');
 const memories=basis.memories||[];
 if(memories.length>maxReads)fail('Evidence provenance exceeds the bounded verification allowance.');
 const loaded=new Map(),records=[];let reads=0;
 const read=async id=>{
  if(typeof id!=='string'||!id||id.length>200)fail('Memory provenance is missing an exact fact ID.');
  if(!loaded.has(id)){if(++reads>maxReads)fail('Evidence provenance exceeds the bounded verification allowance.');loaded.set(id,await readMemory(id));}
  const fact=loaded.get(id);if(!fact||fact.id!==id||fact.state!=='valid'||fact.invalidated_at||fact.edited_at)fail('Memory lookup did not return the requested valid, unedited fact.');return fact;
 };
 for(const citation of memories){
  const fact=await read(citation.id);
  if(citation.text!==fact.text||(citation.type&&citation.type!==(fact.type||fact.fact_type)))fail('Cited memory text or type changed during verification.');
  if((fact.type||fact.fact_type)==='observation'){
   const article=articles.find(a=>equalTags(fact.tags,sourceScopeTags(a,scope)));
   const sourceIds=fact.source_memory_ids||fact.source_fact_ids;
   if(!article||!Array.isArray(sourceIds)||!sourceIds.length||new Set(sourceIds).size!==sourceIds.length)fail('Observation has no complete exact source provenance.');
   const sources=[];for(const id of sourceIds){const source=validateRawFact(await read(id),[article],scope);sources.push(source);}
   records.push({factId:fact.id,type:'observation',text:fact.text,...sourceRecord(article),documentId:article.cloudScope.docId,sourceFacts:sources});
  }else records.push(validateRawFact(fact,articles,scope));
 }
 return {records,readCount:reads,directives:basis.directives||[],mentalModels:[]};
}

// Reusable for an explicitly authorized audit of a saved candidate. The caller owns
// durable authorization, response recording and source/connection drift checks.
// This helper never recalls, regenerates a candidate, retries, or writes to a store.
export async function runInvestigationAudit({context,candidate,selected,provider,scope,budget='high',network}){
 if(typeof network!=='function')throw new DomainError('A durable audit network wrapper is required.',409);
 if(!['mid','high'].includes(budget))throw new DomainError('Choose balanced or deep Hindsight search.');
 if(provider.c.memoryMode!=='hindsight'||provider.scope()!==scope)throw new DomainError('The Hindsight audit scope changed.',409);
 validateInvestigationOutput(candidate,context);
 const sourceIds=context.evidence.filter(e=>['experience-memory','official-document'].includes(e.kind)).map(e=>e.id);
 if(!Array.isArray(selected)||new Set(selected.map(s=>s.id)).size!==selected.length||selected.length!==sourceIds.length||selected.some(s=>!sourceIds.includes(s.id)))throw new DomainError('Audit sources differ from the complete selected candidate evidence.',409);
 const {query,responseSchema,inputHash}=buildAuditRequest(context,candidate);
 const options={budget,...(responseSchema?{responseSchema}:{}),tagGroups:investigationTagGroups(selected,scope),applyAllDirectives:false,excludeMentalModels:true,includeFacts:true,includeToolCalls:true,includeToolCallOutput:true,reflectSearchObservationsMaxTokens:4096,reflectSearchObservationsIncludeEntities:false};
 const response=await network('investigation-audit',{query,options,auditInputHash:inputHash},()=>provider.getClient().reflect(provider.c.bank,query,{...options,signal:AbortSignal.timeout(180000)}));
 if(response.structured_output_error)fail('Hindsight audit extraction failed. The candidate remains private; no automatic retry was sent.');
 if(!response.structured_output)fail('Hindsight returned no structured audit. Existing drafts are unchanged.');
 if(!response.trace||!Array.isArray(response.trace.tool_calls)||!Array.isArray(response.trace.llm_calls))fail('Hindsight did not return a complete audit trace.');
 const provenance=await validateBasedOn(response,selected,{scope,readMemory:factId=>network('investigation-provenance',{factId,phase:'audit'},()=>provider.readMemory(factId))});
 const audit=validateAuditOutput(response.structured_output,context,candidate),output=renderAuditDiagnostics(audit,context);
 return {output,provenance,trace:response.trace,usage:response.usage||null,inputHash,audit};
}

// SDK output is evidence, not permission to widen retrieval or invoke other providers.
export class HindsightInvestigation{
 constructor(store,provider,{connectionId,authorize,protocol='audit-v1',now=()=>new Date().toISOString()}={}){if(!['audit-v1','plan-v2','plan-v3-raw'].includes(protocol))throw new DomainError('Unknown investigation protocol.');this.protocol=protocol;this.store=store;this.provider=provider;this.connectionId=connectionId;this.authorize=authorize;this.now=now;this.busy=false;}
 async investigate(caseId,{budget='high',useMemory=true,references=[]}={}){
  if(this.busy)throw new DomainError('Another Hindsight investigation is running.',409);
  if(!['mid','high'].includes(budget))throw new DomainError('Choose balanced or deep Hindsight search.');
  if(typeof this.authorize!=='function')throw new DomainError('A durable credit reservation is required before investigation.',409);
  const state=this.store.read(),c=requireCase(state,caseId),connectionId=this.connectionId?.(),scope=this.provider.scope();
  if(!connectionId||this.provider.c.memoryMode!=='hindsight')throw new DomainError('A verified Hindsight connection is required.',409);
  const inputHash=reflectionIdentity(c),eligible=useMemory?[...eligibleInvestigationArticles(state,c,{connectionId,scope}),...eligibleInvestigationDocuments(state,c,{connectionId,scope})]:[];
  const documentRejections=useMemory?(state.officialDocuments||[]).map(d=>({id:d.id,reasons:officialDocumentApplicability(c,d).reasons,match:officialDocumentApplicability(c,d).status})).filter(d=>d.match!=='review').map(({id,reasons})=>({id,reasons})):[];
  // Validate the complete case before any paid discovery. Whole evidence selection happens after recall.
  investigationInput(c,[],references,{documentRejections});const recallQuery=investigationRecallQuery(c);
  const currentSource=(snapshot,source)=>(source.kind==='official-document'?snapshot.officialDocuments:snapshot.articles)?.find(row=>row.id===source.id);
  const sourceIdentity=hash(eligible.map(a=>currentSource(state,a)));
  const check=()=>{
   const current=this.store.read();if(this.connectionId()!==connectionId||this.provider.scope()!==scope||reflectionIdentity(requireCase(current,caseId))!==inputHash)throw new DomainError('The case or Hindsight connection changed during investigation. Drafts were not applied.',409);
   const same=eligible.map(a=>currentSource(current,a));
   if(same.some(a=>!a)||hash(same)!==sourceIdentity)throw new DomainError('Approved source scope changed during investigation. Drafts were not applied.',409);
  };
  const id=randomUUID(),entry={id,at:this.now(),caseId,connectionId,inputHash,budget,useMemory,status:'prepared',phases:[],eligibleArticleIds:eligible.filter(a=>a.kind!=='official-document').map(a=>a.id),eligibleDocumentIds:eligible.filter(a=>a.kind==='official-document').map(a=>a.id),policyVersion:2,protocol:this.protocol};
  const update=fn=>this.store.update(s=>{s.hindsightInvestigations??=[];let saved=s.hindsightInvestigations.find(x=>x.id===id);if(!saved){saved=structuredClone(entry);s.hindsightInvestigations.push(saved);}fn(saved);});
  update(()=>{});this.busy=true;
  const network=async(kind,request,call)=>{
   check();const reservation=await this.authorize({id:`${id}:${entry.phases.length}`,investigationId:id,kind,budget,connectionId,request});check();
   const phase={kind,at:this.now(),status:'dispatched',request};entry.phases.push(phase);update(saved=>{saved.status='dispatched';saved.phases.push(structuredClone(phase));});
   try{const response=await call();update(saved=>{Object.assign(saved.phases.at(-1),{status:'received',response});});await reservation?.complete?.(response);check();return response;}
   catch(error){update(saved=>{saved.phases.at(-1).status='unverified';});await reservation?.fail?.(error);throw error;}
  };
  try{
   // Global directives always apply even under strict tags. Check before paying for generation.
   const directiveList=await network('investigation-metadata',{action:'list-directives',limit:100},()=>this.provider.getClient().listDirectives(this.provider.c.bank,{limit:100,signal:AbortSignal.timeout(20000)}));
   const directives=directiveList.items||directiveList.directives;
   if(!Array.isArray(directives)||typeof directiveList.total!=='number'||directiveList.total>directives.length||directives.some(d=>d.is_active!==false&&d.content!==supportDirective))fail('Active directive policy could not be completely verified before investigation.');
   let records=[],recall=null;
   if(eligible.length){
    const query=recallQuery;
    const options={budget,types:['world','experience'],maxTokens:4096,includeChunks:true,maxChunkTokens:4096,includeEntities:false,trace:true,tagGroups:investigationTagGroups(eligible,scope),queryTimestamp:c.occurredAt||this.now()};
    recall=await network('investigation-recall',{query,options},()=>this.provider.getClient().recall(this.provider.c.bank,query,{...options,signal:AbortSignal.timeout(90000)}));
    validateRecallEvidence(recall,eligible,scope);
    records=this.protocol.startsWith('plan-')?await semanticRecallEvidence(recall,eligible,scope,factId=>network('investigation-provenance',{factId,phase:'discovery'},()=>this.provider.readMemory(factId))):validateRecallEvidence(recall,eligible,scope);
   }
   const ranked=[...new Set(records.map(r=>r.sourceId))].map(id=>eligible.find(a=>a.id===id));
   const context=investigationInput(c,ranked.filter(a=>a.kind!=='official-document'),references,{officialDocuments:ranked.filter(a=>a.kind==='official-document'),documentRejections}),selected=ranked.filter(a=>context.evidence.some(e=>e.id===a.id));
   for(const item of context.evidence){if(['experience-memory','official-document'].includes(item.kind)){const a=selected.find(a=>a.id===item.id);item.retrieval={provider:'Hindsight strict scoped recall',documentId:a.cloudScope.docId,revision:a.revision,hash:a.fingerprint,factIds:records.filter(r=>r.sourceId===a.id).map(r=>r.factId),contentBasis:item.kind==='official-document'?'Complete exact-version official section; normative guidance, not an observed resolution':'Canonical source-reviewed article; retrieved facts are not independent corroboration'};}}
   let query=investigationInstructions+'\nUse Hindsight search only within the server-enforced eligible scopes. Cite supplied canonical evidence IDs, not raw fact IDs. Return the requested editable drafts. Case and evidence data follow:\n'+JSON.stringify(investigationModelContext(context));
   if(Buffer.byteLength(query)>19000)throw new DomainError('The complete investigation context exceeds its input allowance.');
   let responseSchema=structuredClone(investigationResponseSchema);const citationIds=context.evidence.map(e=>e.id);
   if(citationIds.length)responseSchema.properties.citations.items.enum=citationIds;
   else responseSchema.properties.citations.maxItems=0;
   let planRequest=null;
   if(this.protocol.startsWith('plan-')){planRequest=buildInvestigationPlanRequest(context,{rawText:this.protocol==='plan-v3-raw'});query=planRequest.query;responseSchema=this.protocol==='plan-v3-raw'?undefined:planRequest.responseSchema;}
   const options={budget,...(responseSchema?{responseSchema}:{}),tagGroups:investigationTagGroups(selected,scope),applyAllDirectives:false,excludeMentalModels:true,includeFacts:true,includeToolCalls:true,includeToolCallOutput:true,reflectSearchObservationsMaxTokens:4096,reflectSearchObservationsIncludeEntities:false};
   update(saved=>{saved.context=context;saved.selectedArticleIds=selected.filter(a=>a.kind!=='official-document').map(a=>a.id);saved.selectedDocumentIds=selected.filter(a=>a.kind==='official-document').map(a=>a.id);});
   const response=await network('investigation-reflect',{query,options},()=>this.provider.getClient().reflect(this.provider.c.bank,query,{...options,signal:AbortSignal.timeout(180000)}));
   if(this.protocol!=='plan-v3-raw'&&response.structured_output_error)fail('Hindsight generated prose but structured draft extraction failed. The response is recorded; no automatic retry was sent.');
   if(this.protocol!=='plan-v3-raw'&&!response.structured_output)fail('Hindsight returned no structured draft. The response is recorded; existing drafts are unchanged.');
   if(!response.trace||!Array.isArray(response.trace.tool_calls)||!Array.isArray(response.trace.llm_calls))fail('Hindsight did not return a complete investigation trace.');
   const provenance=await validateBasedOn(response,selected,{scope,readMemory:factId=>network('investigation-provenance',{factId},()=>this.provider.readMemory(factId))});
   if(this.protocol.startsWith('plan-')){
    const plan=this.protocol==='plan-v3-raw'?parseInvestigationPlanText(response.text,context):validateInvestigationPlan(response.structured_output,context),output=renderInvestigationPlan(plan,context);
    check();provenance.selectionFacts=records.filter(r=>selected.some(a=>a.id===r.sourceId));
    const result={...output,evidenceIds:context.evidence.map(e=>e.id),selectedDocumentIds:selected.filter(a=>a.kind==='official-document').map(a=>a.id),evidenceSelection:context.selection,provider:`Hindsight evidence plan · ${budget==='high'?'deep':'balanced'} search`,usage:response.usage||null,provenance,trace:response.trace,investigationId:id,reviewRequired:true,generatedAt:this.now(),inputHash,connectionId};
    update(saved=>{saved.plan=plan;saved.planInputHash=planRequest.inputHash;saved.status='succeeded';saved.result=result;});return result;
   }
   const candidate=validateInvestigationOutput(response.structured_output,context);
   check();
   provenance.selectionFacts=records.filter(r=>selected.some(a=>a.id===r.sourceId));
   // Never expose the first candidate as a result, even when its shape/provenance pass.
   update(saved=>{saved.candidateContext=context;saved.candidate=response.structured_output;saved.validatedCandidate=candidate;saved.candidateProvenance=provenance;saved.candidateUsage=response.usage||null;saved.status='awaiting-audit';});
   const audited=await runInvestigationAudit({context,candidate:response.structured_output,selected,provider:this.provider,scope,budget,network});
   check();audited.provenance.selectionFacts=provenance.selectionFacts;
   const result={...audited.output,evidenceIds:context.evidence.map(e=>e.id),selectedDocumentIds:selected.filter(a=>a.kind==='official-document').map(a=>a.id),evidenceSelection:context.selection,provider:`Hindsight Reflect + evidence audit · ${budget==='high'?'deep':'balanced'} search`,usage:{candidate:response.usage||null,audit:audited.usage},provenance:audited.provenance,trace:response.trace,auditTrace:audited.trace,investigationId:id,reviewRequired:true,generatedAt:this.now(),inputHash,connectionId};
   update(saved=>{saved.audit=audited.audit;saved.auditInputHash=audited.inputHash;saved.auditProvenance=audited.provenance;});
   update(saved=>{saved.status='succeeded';saved.result=result;});return result;
  }catch(error){update(saved=>{saved.status='unverified';saved.failure={name:error.name,message:error instanceof DomainError?error.message:'The Hindsight response could not be verified. Existing drafts are unchanged.'};});if(error instanceof DomainError)throw error;throw new DomainError('Hindsight investigation could not be verified. Existing drafts are unchanged; no automatic retry or other provider was used.',502);}
  finally{this.busy=false;}
 }
}
