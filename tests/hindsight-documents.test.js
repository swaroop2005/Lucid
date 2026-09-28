import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
const rawSha256=text=>createHash('sha256').update(text,'utf8').digest('hex');
import {prepareOfficialDocument,extractOfficialSection,assertOfficialDocument,importOfficialDocuments,prepareOfficialDocumentRetention,verifyOfficialDocumentScope,verifiedOfficialDocumentScope,officialDocumentApplicability,officialDocumentEvidence} from '../server/hindsight-documents.js';
import {investigationTagGroups,sourceScopeTags} from '../server/hindsight-scope.js';
import {HindsightInvestigation,validateBasedOn,validateRecallEvidence,eligibleInvestigationDocuments} from '../server/hindsight-investigation.js';
import {investigationInput,INVESTIGATION_MAX_BYTES,investigationInstructions,validateInvestigationOutput} from '../server/openai.js';
import {isAuditQuery,auditResponseFor} from './fixtures/hindsight-audit.js';
const scope='lucid-workspace-official-test',connectionId='official-connection';
function documentInput({section='## TLS checks\n\nDo not disable verification. Inspect the complete certificate chain.\n\n### Chain details\n\nThe complete chain must be available.',id='DOC-RUNNER-TLS',version='19.3.0'}={}){
 const sourceText='# Runner configuration\n\n'+section+'\n\n## Other topic\n\nUnrelated content.\n';
 return {sourceText,input:{id,revision:1,kind:'official-document',title:'TLS chain configuration',url:`https://gitlab.com/gitlab-org/gitlab-runner/-/blob/v${version}/docs/configuration/tls.md`,component:'runner',version,sourceRef:'v'+version,sourceCommit:'a'.repeat(40),sourcePath:'docs/configuration/tls.md',sectionHeading:'TLS checks',sectionText:section,sectionHash:rawSha256(section),sourceHash:rawSha256(sourceText),retrievedAt:'2026-09-28T00:00:00Z',executor:'Any',hosting:'Self-managed'}};
}
function fixture(){
 const {sourceText,input}=documentInput(),doc=prepareOfficialDocument(input,{sourceText}),plan=prepareOfficialDocumentRetention(doc,{scope});
 doc.cloudRetention={status:'succeeded',connectionId,revision:doc.revision,documentHash:doc.fingerprint,docId:plan.docId,contentHash:plan.contentHash,packetHash:plan.packetHash};
 const cloudDocument={id:plan.docId,original_text:plan.packet.content,document_metadata:plan.packet.metadata,tags:plan.packet.tags,memory_unit_count:2};
 doc.cloudScope=verifyOfficialDocumentScope(doc,cloudDocument,{connectionId,scope});
 const c={id:'CASE-1',title:'TLS registration failure',description:'Registration reports a certificate verification error.',executor:'Shell',hosting:'Self-managed',runnerVersion:'19.3.0',serverVersion:'',chartVersion:'',stage:'registration',symptom:'tls',attempts:[{step:'Retry registration',result:'Failed',evidence:'Same certificate error'}]};
 const state={workspaceId:'official-test',cases:[c],articles:[],officialDocuments:[doc]},store={read:()=>structuredClone(state),update:fn=>fn(state)};
 const fact={id:'official-fact',type:'world',text:'Inspect the complete certificate chain.',state:'valid',document_id:plan.docId,tags:plan.packet.tags,metadata:plan.packet.metadata};
 const response={text:'Draft',structured_output:{finding:'Cause remains unconfirmed [DOC-RUNNER-TLS].',customer:'Please inspect the complete chain [DOC-RUNNER-TLS].',engineering:'The retry failed; inspect the chain for this exact version [DOC-RUNNER-TLS].',citations:['DOC-RUNNER-TLS'],nextQuestions:[]},based_on:{memories:[{id:fact.id,text:fact.text,type:'world'}],mental_models:[],directives:[]},trace:{tool_calls:[],llm_calls:[]}};
 const calls=[],requests=[];
 const client={listDirectives:async()=>{calls.push('directives');return {items:[],total:0};},recall:async(_bank,_query,options)=>{calls.push('recall');requests.push({kind:'recall',options});return {results:[fact]};},reflect:async(_bank,query,options)=>{calls.push(isAuditQuery(query)?'audit':'reflect');requests.push({kind:isAuditQuery(query)?'audit':'reflect',query,options});return isAuditQuery(query)?auditResponseFor(query,response):response;}};
 const provider={c:{memoryMode:'hindsight',bank:'fake-bank'},scope:()=>scope,getClient:()=>client,readMemory:async()=>{calls.push('provenance');return fact;}};
 const service=new HindsightInvestigation(store,provider,{connectionId:()=>connectionId,authorize:async()=>({complete:()=>{},fail:()=>{}})});
 return {sourceText,input,doc,plan,cloudDocument,c,state,store,fact,response,calls,requests,client,service};
}

test('official import preserves whole exact sections and immutable separate source identities',()=>{
 const x=fixture(),state={articles:[{id:'KA-0001'}]},prepared=prepareOfficialDocument(x.input,{sourceText:x.sourceText});
 assert.deepEqual(importOfficialDocuments(state,[prepared]),{added:[prepared.id],unchanged:[]});
 assert.deepEqual(importOfficialDocuments(state,[prepared]),{added:[],unchanged:[prepared.id]});
 assert.deepEqual(state.articles,[{id:'KA-0001'}]);assert.equal(state.officialDocuments[0].sourceReports,undefined);
 const changed={...prepared,title:'Changed published title'};assert.throws(()=>importOfficialDocuments(state,[changed]),/payload changed/);
 const altered=prepareOfficialDocument({...x.input,title:'Another title'},{sourceText:x.sourceText});assert.throws(()=>importOfficialDocuments(state,[altered]),/immutable/);
 assert.equal(extractOfficialSection(x.sourceText,'TLS checks'),x.input.sectionText);
 const fenced=documentInput({section:'## TLS checks\n\n```sh\n## not a heading\n```\n\nDo not disable verification.'});assert.equal(prepareOfficialDocument(fenced.input,{sourceText:fenced.sourceText}).sectionText,fenced.input.sectionText);
});

test('official source validation rejects excerpts, content/hash drift, unsafe URLs and false release mappings',()=>{
 const x=fixture();
 for(const input of [{...x.input,sourceHash:'b'.repeat(64)},{...x.input,sectionText:'Do not disable verification.',sectionHash:rawSha256('Do not disable verification.')},{...x.input,version:'19.2.0'},{...x.input,url:x.input.url.replace('gitlab-org/gitlab-runner','other/runner')},{...x.input,url:x.input.url+'?token=private'}])assert.throws(()=>prepareOfficialDocument(input,{sourceText:x.sourceText}));
 for(const key of ['sectionText','sectionHash','sourceHash','sourceCommit']){const changed=structuredClone(x.doc);changed[key]+='x';assert.throws(()=>assertOfficialDocument(changed));assert.equal(verifiedOfficialDocumentScope(changed,{connectionId,scope}),false);}
 const large=documentInput({section:'## TLS checks\n'+ 'x'.repeat(8200)});assert.throws(()=>prepareOfficialDocument(large.input,{sourceText:large.sourceText}),/8192/);
 const within=documentInput({section:'## TLS checks\n'+ 'x'.repeat(8100)});assert.ok(prepareOfficialDocument(within.input,{sourceText:within.sourceText}));
 const preserved={...x.input,sectionText:x.input.sectionText+'\n\n',sectionHash:rawSha256(x.input.sectionText+'\n\n'),retrievedAt:'2026-09-28T00:00:00+00:00'};
 assert.equal(prepareOfficialDocument(preserved,{sourceText:x.sourceText}).sectionText,preserved.sectionText);
 const missingChild={...x.input,sectionText:x.input.sectionText.split('### Chain details')[0],sectionHash:rawSha256(x.input.sectionText.split('### Chain details')[0])};assert.throws(()=>prepareOfficialDocument(missingChild,{sourceText:x.sourceText}),/whole exact section/);
});

const pilotInputFile=new URL('../work/hindsight-documents-pilot/INPUTS.json',import.meta.url);
test('reviewed pilot source artifacts validate offline with raw hashes, preserving complete sections', {skip:!existsSync(pilotInputFile)},()=>{
 const inputs=JSON.parse(readFileSync(pilotInputFile,'utf8')),documents=[];
 for(const {document,sourceFile} of inputs.documents){
  const sourceText=readFileSync(sourceFile,'utf8');
  assert.equal(rawSha256(sourceText),document.sourceHash);assert.equal(rawSha256(document.sectionText),document.sectionHash);
  if(document.id==='DOC-RUNNER-18-3-1-CACHE'){
   assert.ok(Buffer.byteLength(extractOfficialSection(sourceText,document.sectionHeading))>8192);
   assert.throws(()=>prepareOfficialDocument(document,{sourceText}),/whole exact section/);continue;
  }
  const prepared=prepareOfficialDocument(document,{sourceText}),packet=prepareOfficialDocumentRetention(prepared,{scope});
  assert.equal(JSON.parse(packet.packet.content).document.sectionText,document.sectionText);
  assert.ok(Buffer.byteLength(JSON.stringify(packet.packet))<=12000);documents.push(prepared);
 }
 assert.equal(documents.length,5);const state={articles:[]};assert.equal(importOfficialDocuments(state,documents).added.length,5);
 assert.deepEqual(importOfficialDocuments(state,documents).unchanged,documents.map(d=>d.id));
});

test('retention envelopes are deterministic and require complete bytes, metadata, exact tags and nonzero facts',()=>{
 const x=fixture();assert.deepEqual(prepareOfficialDocumentRetention(x.doc,{scope}),x.plan);
 assert.equal(x.plan.packet.metadata.official_document_id,x.doc.id);assert.equal(x.plan.packet.metadata.article_id,undefined);
 assert.equal(JSON.parse(x.plan.packet.content).document.sectionText,x.doc.sectionText);
 assert.equal(verifiedOfficialDocumentScope(x.doc,{connectionId,scope}),true);
 for(const bad of [{...x.cloudDocument,original_text:'truncated'},{...x.cloudDocument,memory_unit_count:0},{...x.cloudDocument,tags:[scope]},{...x.cloudDocument,document_metadata:{...x.plan.packet.metadata,source_hash:'b'.repeat(64)}}])assert.throws(()=>verifyOfficialDocumentScope(x.doc,bad,{connectionId,scope}),/immutable source packet/);
 assert.equal(verifiedOfficialDocumentScope(x.doc,{connectionId:'other',scope}),false);
 assert.ok(!sourceScopeTags(x.doc,scope).some(tag=>tag.startsWith('lucid-source:KA-')));
});

test('only exact known component versions and compatible environments admit official documents',()=>{
 const x=fixture();assert.equal(officialDocumentApplicability(x.c,x.doc).status,'review');assert.equal(eligibleInvestigationDocuments(x.state,x.c,{connectionId,scope}).length,1);
 for(const version of ['', 'Unknown','19.3','19.3.1','latest']){const result=officialDocumentApplicability({...x.c,runnerVersion:version},x.doc);assert.equal(result.status,'incompatible');assert.match(result.reasons.join(' '),/version/);}
 assert.equal(officialDocumentApplicability({...x.c,hosting:'GitLab.com'},x.doc).status,'incompatible');
 const input=officialDocumentEvidence(x.doc);assert.equal(input.kind,'official-document');assert.equal(input.evidenceText,x.doc.sectionText);assert.equal(input.versions,'runner 19.3.0 (exact source release)');assert.equal(input.reviewBasis,undefined);
});

test('DOC recall and complete observation ancestry cannot masquerade as articles or other documents',async()=>{
 const x=fixture(),record=validateRecallEvidence({results:[x.fact]},[x.doc],scope)[0];assert.equal(record.sourceType,'official-document');assert.equal(record.sourceId,x.doc.id);assert.equal(record.articleId,undefined);
 for(const fact of [{...x.fact,metadata:{...x.fact.metadata,article_id:'KA-0001'}},{...x.fact,metadata:{...x.fact.metadata,official_document_id:'DOC-FOREIGN'}},{...x.fact,metadata:{...x.fact.metadata,source_hash:'b'.repeat(64)}},{...x.fact,tags:[scope]},{...x.fact,document_id:x.plan.docId+'foreign'}])assert.throws(()=>validateRecallEvidence({results:[fact]},[x.doc],scope),/outside the exact/);
 const observation={id:'observation',text:'Complete chains matter.',type:'observation',state:'valid',tags:x.plan.packet.tags,source_memory_ids:[x.fact.id]},result={based_on:{memories:[{id:observation.id,text:observation.text,type:observation.type}]}};
 const options={scope,readMemory:async id=>id===observation.id?observation:x.fact};
 const checked=await validateBasedOn(result,[x.doc],options);assert.equal(checked.readCount,2);assert.equal(checked.records[0].sourceFacts[0].officialDocumentId,x.doc.id);
 x.fact.metadata.official_document_id='DOC-FOREIGN';await assert.rejects(validateBasedOn(result,[x.doc],options),/official document scope/);await assert.rejects(validateBasedOn(result,[x.doc],{...options,maxReads:1}),/allowance/);
});

test('real investigation workflow recalls exact DOC scopes, supplies full section and validates DOC citations',async()=>{
 const x=fixture(),result=await x.service.investigate(x.c.id);
 assert.deepEqual(x.calls,['directives','recall','reflect','provenance','audit','provenance']);assert.deepEqual(result.selectedDocumentIds,[x.doc.id]);assert.equal(result.provenance.records[0].officialDocumentId,x.doc.id);
 assert.deepEqual(x.requests[0].options.tagGroups,investigationTagGroups([x.doc],scope));assert.deepEqual(x.requests[1].options.tagGroups,investigationTagGroups([x.doc],scope));
 const evidence=x.state.hindsightInvestigations[0].context.evidence[0];assert.equal(evidence.kind,'official-document');assert.equal(evidence.sectionText,x.doc.sectionText);assert.equal(evidence.reviewBasis,undefined);assert.equal(evidence.sourceHash,x.doc.sourceHash);assert.deepEqual(evidence.prerequisiteQuestions,[]);assert.doesNotMatch(evidence.question,/confirm exact|what exact.*version/i);assert.match(evidence.question,/failing component|effective configuration/);
 assert.deepEqual(x.state.hindsightInvestigations[0].selectedArticleIds,[]);assert.deepEqual(x.state.hindsightInvestigations[0].selectedDocumentIds,[x.doc.id]);
 assert.throws(()=>validateInvestigationOutput({...x.response.structured_output,citations:['DOC-FOREIGN']},x.state.hindsightInvestigations[0].context),/Invalid citation/);
});

test('unknown/mismatched DOC version becomes a prerequisite, while empty baseline exposes no DOC evidence or scope',async()=>{
 for(const mode of ['unknown','mismatch','baseline']){
  const x=fixture();if(mode==='unknown')x.c.runnerVersion='';if(mode==='mismatch')x.c.runnerVersion='18.0.0';
  x.response.structured_output={finding:'Cause unknown',customer:'Please confirm the exact Runner version.',engineering:'No compatible official source.',citations:[],nextQuestions:[]};x.response.based_on.memories=[];
  const result=await x.service.investigate(x.c.id,{useMemory:mode!=='baseline'});assert.ok(!x.calls.includes('recall'));
  assert.deepEqual(x.requests[0].options.tagGroups,investigationTagGroups([],scope));assert.deepEqual(result.selectedDocumentIds,[]);
  if(mode==='baseline'){assert.deepEqual(result.evidenceSelection.rejected,[]);assert.ok(!x.requests[0].query.includes('Do not disable verification'));}
  else{assert.equal(result.evidenceSelection.rejected[0].id,x.doc.id);assert.match(result.evidenceSelection.rejected[0].reasons.join(' '),/version/);}
 }
});

test('official payload mutation during discovery rejects generation and preserves the case',async()=>{
 const x=fixture(),before=structuredClone(x.c),recall=x.client.recall;
 x.client.recall=async(...args)=>{const value=await recall(...args);x.doc.sectionText+=' changed';return value;};
 await assert.rejects(x.service.investigate(x.c.id),/source scope changed/);assert.ok(!x.calls.includes('reflect'));assert.deepEqual(x.c,before);
});

test('whole DOC sections share the bounded evidence budget without truncating case failures or ordinary articles',()=>{
 const x=fixture(),article={id:'KA-0001',title:'Historical report',revision:1,fingerprint:'a'.repeat(64),fix:'A reported recovery',verification:'Reported only',limitations:'Not reproduced',match:{status:'review',reasons:[]}},ref={id:'REF-1',title:'Local reference',summary:'A local prerequisite.'},doc={...x.doc,match:{status:'review',reasons:[]}};
 const context=investigationInput(x.c,[article],[ref],{officialDocuments:[doc]});assert.deepEqual(context.evidence.map(e=>e.id),['KA-0001',doc.id,'REF-1']);assert.equal(context.evidence[1].sectionText,doc.sectionText);assert.deepEqual(context.case.attempts,x.c.attempts.map(a=>({...a,articleId:undefined})));
 assert.ok(Buffer.byteLength(JSON.stringify(context))+Buffer.byteLength(investigationInstructions)<=INVESTIGATION_MAX_BYTES);
 const other=documentInput({section:'## TLS checks\n'+ 'x'.repeat(8100)}),large={...prepareOfficialDocument(other.input,{sourceText:other.sourceText}),match:{status:'review',reasons:[]}};
 const limited=investigationInput({...x.c,description:'Case observation. '.repeat(180)},[article],[ref],{officialDocuments:[large]});assert.equal(limited.case.description,'Case observation. '.repeat(180));assert.ok(limited.evidence.some(e=>e.id===article.id));assert.ok(limited.selection.omitted.some(e=>e.id===large.id));assert.ok(!limited.evidence.some(e=>e.id===large.id));
});

test('an omitted optional source commit has a stable canonical fingerprint',()=>{
 const {input,sourceText}=documentInput();delete input.sourceCommit;
 const document=prepareOfficialDocument(input,{sourceText});assert.equal(document.sourceCommit,null);assert.doesNotThrow(()=>assertOfficialDocument(document));
 const roundTrip=JSON.parse(JSON.stringify(document));assert.equal(prepareOfficialDocumentRetention(roundTrip,{scope}).docId,prepareOfficialDocumentRetention(document,{scope}).docId);
});
