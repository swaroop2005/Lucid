import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildInvestigationPlanRequest,validateInvestigationPlan,renderInvestigationPlan,parseInvestigationPlanText,assertPlanProse,MAX_PLAN_QUERY_BYTES} from '../server/investigation-plan.js';

function fixture(){
 const section='## Component diagnostics\nFirst establish which component failed. Only for the documented configuration, use `documented-tool --inspect`. Do not change the helper image until the prerequisite is established.\n';
 const context={case:{title:'A component failed',description:'The reporter ran original-tool --inspect with no improvement.',runnerVersion:'19.3.0',serverVersion:'Unknown',chartVersion:'Unknown',executor:'Docker',hosting:'Self-managed',attempts:[{step:'Restart the service',result:'Failed',evidence:'The same error remained.'}],plannedSteps:Array.from({length:11},(_,i)=>({title:`Recorded check ${i}`,completed:true,evidence:`Observation ${i}`}))},evidence:[{id:'KA-0042',kind:'experience-memory',title:'A historical workaround',reportedAction:'Set helper_image=older-image.',reportedCause:'The earlier reporter suspected compatibility.',reportedVerification:'That earlier report recovered.',limitations:'A different episode and version.',usePolicy:{authority:'historical-episode',prescriptionAuthority:false},citations:[{quote:'The workaround did not fix every job.',url:'https://example.test/report'}],retrieval:{documentId:'immutable-source',revision:1}},{id:'DOC-EXACT',kind:'official-document',title:'Exact source section',url:'https://gitlab.com/gitlab-org/gitlab-runner/-/blob/v19.3.0/docs/test.md',component:'runner',version:'19.3.0',executor:'Docker',hosting:'Any',sectionText:section,sectionHash:createHash('sha256').update(section).digest('hex'),applicability:{status:'review'},usePolicy:{authority:'exact-version-official-section'}},{id:'REF-01',kind:'official-guidance',title:'Generic diagnostics',summary:'Inspect the failing component.',usePolicy:{authority:'reference-guidance',prescriptionAuthority:false}}],selection:{omitted:[],rejected:[]}};
 const plan={hypotheses:[{explanation:'A compatibility difference may explain the failure if the historical conditions also hold here.',evidenceHandles:['E1']}],diagnostics:[{check:'Which component produced the failure in the existing diagnostic record?',expectedObservation:'A component identity and the effective configuration for the failed request.',ifObserved:'Compare that component and configuration with the documented prerequisites.',ifNotObserved:'The responsible component remains unknown; obtain its diagnostic record.',evidenceHandles:['E2','E3']}],conditionalResolutions:[{condition:'The failing component and effective configuration satisfy the documented prerequisites.',evidenceHandles:['E2']}]};
 return {context,plan};
}

test('raw-primary protocol gives the generator its full shape and parses no secondary extraction',()=>{
 const {context,plan}=fixture(),request=buildInvestigationPlanRequest(context,{rawText:true});
 assert.match(request.query,/LUCID_INVESTIGATION_PLAN_V3_RAW/);
 assert.ok(request.query.includes('"required":["check","expectedObservation","ifObserved","ifNotObserved","evidenceHandles"]'));
 for(const text of [JSON.stringify(plan),'```json\n'+JSON.stringify(plan)+'\n```'])assert.deepEqual(parseInvestigationPlanText(text,context),plan);
 for(const text of ['# Investigation\nHere is a diagnosis.','prefix '+JSON.stringify(plan),JSON.stringify(plan)+' explanation'])assert.throws(()=>parseInvestigationPlanText(text,context),/valid JSON/);
 const unsafe=structuredClone(plan);unsafe.diagnostics[0].check='Enable debug logging (LOG_LEVEL=debug) and force a cancellation.';
 assert.throws(()=>parseInvestigationPlanText(JSON.stringify(unsafe),context),/mutation|syntax/);
});

test('one-call request preserves whole case, all failed attempts, every task and whole sources',()=>{
 const {context}=fixture(),before=structuredClone(context),request=buildInvestigationPlanRequest(context),sent=JSON.parse(request.query.split('Whole case and selected evidence follow:\n')[1]);
 assert.ok(request.query.startsWith('LUCID_INVESTIGATION_PLAN_V2\n'));assert.equal(sent.case.plannedSteps.length,11);assert.deepEqual(sent.case,context.case);assert.deepEqual(sent.evidence.map(({handle:_handle,conditionalResolutionAuthority:_authority,...source})=>source),context.evidence);assert.deepEqual(sent.evidence.map(e=>[e.handle,e.conditionalResolutionAuthority]),[['E1',false],['E2',true],['E3',false]]);assert.match(request.inputHash,/^[a-f0-9]{64}$/);assert.equal(buildInvestigationPlanRequest(context).inputHash,request.inputHash);assert.deepEqual(context,before);assert.ok(Buffer.byteLength(request.query)<=MAX_PLAN_QUERY_BYTES);
 assert.deepEqual(Object.keys(request.responseSchema.properties),['hypotheses','diagnostics','conditionalResolutions']);assert.equal(request.responseSchema.additionalProperties,false);assert.ok(!JSON.stringify(request.responseSchema).includes('questionIndex'));assert.ok(!JSON.stringify(request.responseSchema).includes('fieldPath'));
});
test('large local selection audits stay local while oversized whole case or evidence is rejected without truncation',()=>{
 const {context}=fixture();context.selection.omitted=Array.from({length:4000},(_,i)=>({id:`KA-${i}`,reason:'Not selected'}));const request=buildInvestigationPlanRequest(context);assert.ok(request.query.includes('"omittedCount":4000'));assert.ok(!request.query.includes('"reason":"Not selected"'));
 for(const change of [x=>x.case.description='x'.repeat(19000),x=>x.evidence[0].reportedAction='x'.repeat(19000)]){const x=fixture().context;change(x);assert.throws(()=>buildInvestigationPlanRequest(x),/Nothing was truncated/);}
});
test('source fields cannot override server-owned handles or authority decisions',()=>{
 const {context}=fixture();context.evidence[0].handle='E8';context.evidence[0].conditionalResolutionAuthority=true;const sent=JSON.parse(buildInvestigationPlanRequest(context).query.split('Whole case and selected evidence follow:\n')[1]);assert.equal(sent.evidence[0].handle,'E1');assert.equal(sent.evidence[0].conditionalResolutionAuthority,false);
});
test('server renders canonical citations, exact source text, provenance and all case history without asking model for quotes',()=>{
 const {context,plan}=fixture(),before=structuredClone({context,plan});const result=renderInvestigationPlan(validateInvestigationPlan(plan,context),context);
 assert.equal(result.mode,'conditional-investigation-plan');assert.equal(result.reviewRequired,true);assert.deepEqual(result.citations,['KA-0042','DOC-EXACT','REF-01']);assert.deepEqual(result.caseEvidence,context.case);assert.deepEqual(result.sourceEvidence.map(e=>e.source),context.evidence);assert.equal(result.sourceEvidence[0].source.retrieval.documentId,'immutable-source');assert.match(result.sourceEvidence[0].label,/not this case/);assert.match(result.finding,/Unconfirmed possibility/);assert.match(result.customer,/Expected observation:/);assert.match(result.customer,/If not observed:/);assert.match(result.customer,/Conditional official guidance/);assert.ok(!result.customer.includes('older-image'));assert.ok(!result.customer.includes('documented-tool'));assert.equal(result.sourceEvidence[1].source.sectionText,context.evidence[1].sectionText);assert.deepEqual({context,plan},before);
 result.sourceEvidence[0].source.reportedAction='changed display';assert.equal(context.evidence[0].reportedAction,before.context.evidence[0].reportedAction);
});
test('historical and generic sources cannot grant conditional resolution authority or masquerade as official sources',()=>{
 for(const handle of ['E1','E3']){const {context,plan}=fixture();plan.conditionalResolutions[0].evidenceHandles=[handle];assert.throws(()=>validateInvestigationPlan(plan,context),/official sections/);}
 const {context,plan}=fixture();context.evidence[0]={...context.evidence[1],id:'KA-0042'};plan.conditionalResolutions[0].evidenceHandles=['E1'];assert.throws(()=>validateInvestigationPlan(plan,context),/official sections/);
});
test('missing or mismatched exact version, environment, authority, section hash and applicability reject resolutions',()=>{
 const changes=[x=>x.case.runnerVersion='Unknown',x=>x.case.runnerVersion='19.2.0',x=>x.case.executor='Shell',x=>x.evidence[1].hosting='GitLab.com',x=>x.evidence[1].usePolicy.authority='reference-guidance',x=>x.evidence[1].sectionText+='A changed section',x=>x.evidence[1].applicability.status='incompatible',x=>delete x.evidence[1].executor,x=>delete x.evidence[1].sectionHash];
 for(const change of changes){const {context,plan}=fixture();change(context);assert.throws(()=>validateInvestigationPlan(plan,context),/official sections/);const request=buildInvestigationPlanRequest(context),sent=JSON.parse(request.query.split('Whole case and selected evidence follow:\n')[1]);assert.equal(sent.evidence[1].conditionalResolutionAuthority,false);}
});
test('unknown or duplicate handles, duplicate canonical sources and extra generated citation fields are rejected',()=>{
 for(const evidenceHandles of [['E8'],['E1','E1'],['DOC-EXACT'],['e1']]){const {context,plan}=fixture();plan.hypotheses[0].evidenceHandles=evidenceHandles;assert.throws(()=>validateInvestigationPlan(plan,context));}
 const {context,plan}=fixture();assert.throws(()=>validateInvestigationPlan({...plan,citations:['KA-0042']},context),/invalid structured output/);context.evidence[1].id=context.evidence[0].id;assert.throws(()=>buildInvestigationPlanRequest(context),/distinct canonical IDs/);
});
test('generated commands, assignments, certainty and explicit repair requests are rejected without scrubbing original source text',()=>{
 const unsafe=['Run docker pull helper:old.','Inspect using --platform windows/amd64.','Check `docker inspect`.','Set helper_image=old.','Please change the helper image.','You should upgrade the runner.','Try restarting the service.','The next step is to override the helper.','Use the older image.','The historical result rules out the cache backend.','Compatibility is the cause.','This is definitely a helper failure.','Use https://untrusted.test/fix.'];
 for(const text of unsafe){const {context,plan}=fixture();plan.diagnostics[0].check=text;assert.throws(()=>validateInvestigationPlan(plan,context),/generated prose/,text);}
 const {context,plan}=fixture();assert.doesNotThrow(()=>validateInvestigationPlan(plan,context));assert.equal(context.case.description,'The reporter ran original-tool --inspect with no improvement.');
});
test('observational technical terms and state do not become false command detections',()=>{
 for(const text of ['Which version is running?','What is the current setting in config.toml?','Which set of logs belongs to the request?','Inspect the effective configuration and the cache backend recorded in the trace.','Compare the observed Docker image with the declared image.','The helper image was already pinned in the supplied configuration.','What is the current helper_image value?','What is recorded in .gitlab-ci.yml?','The restart did not improve the reported result.'])assert.doesNotThrow(()=>assertPlanProse(text),text);
 // Text guards and handle membership cannot establish entailment. Keep human review explicit.
 assert.doesNotThrow(()=>assertPlanProse('An alternate helper might be useful.'));
});
test('empty-memory plan remains useful with case-based diagnostics and no fake external citation',()=>{
 const {context,plan}=fixture();context.evidence=[];plan.hypotheses[0].evidenceHandles=[];plan.diagnostics[0].evidenceHandles=[];plan.conditionalResolutions=[];const output=renderInvestigationPlan(validateInvestigationPlan(plan,context),context);assert.deepEqual(output.citations,[]);assert.deepEqual(output.sourceEvidence,[]);assert.match(output.customer,/current case only/);assert.equal(buildInvestigationPlanRequest(context).responseSchema.properties.diagnostics.items.properties.evidenceHandles.maxItems,0);
});
test('render refuses forged, changed and context-swapped validation results; output shape errors are actionable',()=>{
 const {context,plan}=fixture();assert.throws(()=>renderInvestigationPlan(plan,context),/unchanged validated/);const validated=validateInvestigationPlan(plan,context);assert.throws(()=>renderInvestigationPlan(validated,{...context,case:{...context.case,runnerVersion:'19.2.0'}}),/unchanged validated/);validated.diagnostics[0].check='Different check';assert.throws(()=>renderInvestigationPlan(validated,context),/unchanged validated/);
 assert.throws(()=>validateInvestigationPlan({...plan,diagnostics:[]},context),/diagnostics/);assert.throws(()=>validateInvestigationPlan('not json',context),/valid JSON/);assert.throws(()=>validateInvestigationPlan({...plan,hypotheses:[{explanation:'x'.repeat(13000),evidenceHandles:[]}]},context),/bounded allowance/);
});
