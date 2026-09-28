import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuditRequest,validateAuditOutput,renderAuditDiagnostics,assertDiagnosticProse,MAX_AUDIT_QUERY_BYTES} from '../server/hindsight-audit.js';
function fixture(){
 const context={case:{title:'A reported failure',description:'The operator already ran diagnostic-tool --inspect; the failure persists.',runnerVersion:'19.3.0',attempts:[{step:'Restart',result:'Failed',evidence:'No improvement.'}],plannedSteps:Array.from({length:11},(_,i)=>({title:'Recorded check '+i,completed:true,evidence:'Observed '+i}))},evidence:[{id:'KA-0042',kind:'experience-memory',reportedAction:'Override helper_image=old-image.',reportedCause:'The prior reporter suspected a compatibility issue.',reportedVerification:'The prior reporter recovered.',limitations:'A different historical incident.',citations:[{quote:'This worked on the older setup.'}]},{id:'DOC-EXACT',kind:'official-document',sectionText:'For the documented configuration, use the specified helper image. Confirm the component and effective configuration first.',component:'runner',version:'19.3.0'},{id:'REF-01',kind:'official-guidance',summary:'Identify the component and inspect the diagnostic record.'}],selection:{omitted:[],rejected:[]}};
 const candidate={finding:'The old helper is the cause.',customer:'Override the helper_image setting.',engineering:'Run invented-tool --fix.',citations:['KA-0042'],nextQuestions:['Did you restart?']};
 const audit={assessment:'candidate-withheld-for-review',claimAudit:[{draftField:'customer',questionIndex:null,draftQuote:candidate.customer,claimType:'prescription',verdict:'unsupported',evidence:[{sourceId:'KA-0042',fieldPath:'reportedAction',quote:'Override helper_image=old-image.'}],currentConditions:[],reason:'The source belongs to a different episode.'}],reportedCaseQuotes:[{casePath:'case.attempts[0].evidence',quote:'No improvement.'}],hypotheses:[{text:'If the current episode shares the historical condition, compatibility may merit investigation.',evidence:[{sourceId:'KA-0042',fieldPath:'limitations',quote:'A different historical incident.'}],currentConditions:[]}],questions:[{question:'Which component produced the recorded response?',expectedObservation:'A component name and diagnostic record for the same request.',ifObserved:'This would help distinguish component-specific explanations.',ifNotObserved:'The responsible component would remain unknown.',evidence:[{sourceId:'REF-01',fieldPath:'summary',quote:context.evidence[2].summary}],knownContext:[{casePath:'case.runnerVersion',quote:'19.3.0'}]}],limitations:['The current cause remains unconfirmed.']};
 return {context,candidate,audit};
}
test('audit request freezes whole case, every task, evidence and raw candidate without mutation',()=>{
 const x=fixture(),before=structuredClone(x),request=buildAuditRequest(x.context,x.candidate),sent=JSON.parse(request.query.split('Frozen audit data follow:\n')[1]);
 assert.ok(request.query.startsWith('LUCID_EVIDENCE_AUDIT_V1\n'));assert.deepEqual(sent.case,x.context.case);assert.equal(sent.case.plannedSteps.length,11);assert.deepEqual(sent.evidence,x.context.evidence);assert.deepEqual(sent.candidate,x.candidate);assert.match(request.inputHash,/^[a-f0-9]{64}$/);assert.equal(request.responseSchema.additionalProperties,false);assert.deepEqual(x,before);assert.ok(Buffer.byteLength(request.query)<=MAX_AUDIT_QUERY_BYTES);
 assert.throws(()=>buildAuditRequest({...x.context,case:{...x.context.case,description:'x'.repeat(48000)}},x.candidate),/Nothing was truncated/);
});
test('diagnostic output withholds the entire candidate and exposes only exact reported quotes, conditional hypotheses and questions',()=>{
 const x=fixture(),before=structuredClone(x),validated=validateAuditOutput(x.audit,x.context,x.candidate),output=renderAuditDiagnostics(validated,x.context);
 assert.equal(output.mode,'diagnostic-questions');assert.equal(output.reviewRequired,true);assert.equal(output.auditReview.status,'withheld-for-review');assert.equal(output.auditReview.unsupportedCount,1);assert.equal(output.auditReview.claimCount,1);assert.match(output.finding,/Reported case quotation.*No improvement/);assert.match(output.finding,/Conditional possibility, unconfirmed: If/);assert.match(output.customer,/Expected observation:/);assert.match(output.customer,/If not observed:/);assert.deepEqual(output.citations,['KA-0042','REF-01']);
 assert.ok(!JSON.stringify(output).includes(x.candidate.customer));assert.ok(!JSON.stringify(output).includes(x.candidate.engineering));assert.ok(!JSON.stringify(output.auditReview).includes('draftQuote'));assert.deepEqual(x,before);
});
test('even supported prescriptions with exact official and case anchors are withheld, never copied into diagnostics',()=>{
 for(const draftField of ['customer','engineering']){
  const x=fixture();x.audit.claimAudit=[{...x.audit.claimAudit[0],draftField,draftQuote:x.candidate[draftField],verdict:'supported',evidence:[{sourceId:'DOC-EXACT',fieldPath:'sectionText',quote:x.context.evidence[1].sectionText}],currentConditions:[{casePath:'case.runnerVersion',quote:'19.3.0'}]}];
  const output=renderAuditDiagnostics(validateAuditOutput(x.audit,x.context,x.candidate),x.context);assert.equal(output.auditReview.status,'withheld-for-review');assert.equal(output.auditReview.unsupportedCount,0);assert.ok(!JSON.stringify(output).includes(x.candidate[draftField]));
 }
 const x=fixture();x.audit.claimAudit[0].verdict='supported';assert.throws(()=>validateAuditOutput(x.audit,x.context,x.candidate),/lacks exact official-section/);
});
test('altered or foreign source, case and draft anchors reject the entire audit',()=>{
 const changes=[x=>x.audit.claimAudit[0].draftQuote='Invented draft span',x=>x.audit.claimAudit[0].draftField='finding',x=>x.audit.claimAudit[0].questionIndex=0,x=>x.audit.claimAudit[0].evidence[0].sourceId='KA-9999',x=>x.audit.claimAudit[0].evidence[0].fieldPath='sectionText',x=>x.audit.claimAudit[0].evidence[0].quote='Do not override helper_image=old-image.',x=>x.audit.reportedCaseQuotes[0].casePath='case.attempts[1].evidence',x=>x.audit.reportedCaseQuotes[0].casePath='case.__proto__.description',x=>x.audit.reportedCaseQuotes[0].quote='Improvement.',x=>x.audit.hypotheses[0].evidence[0].fieldPath='retrieval.provider'];
 for(const change of changes){const x=fixture();change(x);assert.throws(()=>validateAuditOutput(x.audit,x.context,x.candidate),/Audit/);}
});
test('draft question spans have exact field/index membership; malformed shape and oversized output fail closed',()=>{
 const x=fixture();x.audit.claimAudit=[{...x.audit.claimAudit[0],draftField:'nextQuestions',questionIndex:0,draftQuote:'Did you restart?',claimType:'hypothesis'}];assert.doesNotThrow(()=>validateAuditOutput(x.audit,x.context,x.candidate));x.audit.claimAudit[0].questionIndex=1;assert.throws(()=>validateAuditOutput(x.audit,x.context,x.candidate),/index/);
 for(const raw of [{...fixture().audit,assessment:'approved'},{...fixture().audit,questions:[]},{...fixture().audit,extra:'not allowed'},'invalid-json',{...fixture().audit,limitations:['x'.repeat(25000)]}])assert.throws(()=>validateAuditOutput(raw,fixture().context,fixture().candidate));
});
test('command/change guard rejects executable markup, assignments and question-shaped prescriptions without scrubbing raw quotes',()=>{
 const unsafe=['Could you run docker pull helper:old?','What happens after you pin the helper image?','Could you try overriding the helper?','Which result follows `invented-tool --fix`?','Could you set helper_image=old?','Please reconfigure the service.','Does this rule out the backend?','Could you use --platform windows/amd64?','Try sudo service restart.','What does [KA-0042] suggest?'];
 for(const text of unsafe){const x=fixture();x.audit.questions[0].question=text;assert.throws(()=>validateAuditOutput(x.audit,x.context,x.candidate),/diagnostic prose/);}
 const x=fixture();x.audit.reportedCaseQuotes=[{casePath:'case.description',quote:x.context.case.description}];const output=renderAuditDiagnostics(validateAuditOutput(x.audit,x.context,x.candidate),x.context);assert.ok(output.finding.includes('diagnostic-tool --inspect'));assert.ok(output.finding.includes('Reported case quotation'));assert.ok(!output.customer.includes('diagnostic-tool --inspect'));
 assert.doesNotThrow(()=>assertDiagnosticProse('Which Docker image and effective configuration are recorded?'));
});
test('guard is explicitly narrow: exact anchors do not prove inference and a paraphrase is not claimed semantically safe',()=>{
 // This is deliberately not a guarantee test. The UI still withholds all candidate prescriptions.
 assert.doesNotThrow(()=>assertDiagnosticProse('Would an alternate helper be useful?'));
 const x=fixture();x.audit.hypotheses[0].text='Compatibility is definitely the cause.';assert.throws(()=>validateAuditOutput(x.audit,x.context,x.candidate),/conditional wording/);
});
test('empty-source baseline can ask for current observations without fabricated evidence',()=>{
 const x=fixture();x.context.evidence=[];x.audit.claimAudit=[];x.audit.hypotheses=[];x.audit.questions[0].evidence=[];const output=renderAuditDiagnostics(validateAuditOutput(x.audit,x.context,x.candidate),x.context);assert.deepEqual(output.citations,[]);assert.equal(output.nextQuestions.length,1);assert.doesNotThrow(()=>buildAuditRequest(x.context,x.candidate));
});
test('renderer refuses forged or mutated audits and changed context; no oversized partial render is returned',()=>{
 const x=fixture();assert.throws(()=>renderAuditDiagnostics(x.audit,x.context),/unchanged validated/);let validated=validateAuditOutput(x.audit,x.context,x.candidate);validated.questions[0].question='Run the command?';assert.throws(()=>renderAuditDiagnostics(validated,x.context),/unchanged validated/);
 validated=validateAuditOutput(x.audit,x.context,x.candidate);assert.throws(()=>renderAuditDiagnostics(validated,{...x.context,case:{description:'different'}}),/unchanged validated/);
 const y=fixture();y.audit.questions[0].question='Which '+ 'observation '.repeat(40)+'?';const long=validateAuditOutput(y.audit,y.context,y.candidate);assert.throws(()=>renderAuditDiagnostics(long,y.context),/display allowance/);
});

test('rendered reported-case quotes cannot strip a negation from the exact source field',()=>{const x=fixture();x.audit.reportedCaseQuotes[0].quote='improvement.';assert.throws(()=>validateAuditOutput(x.audit,x.context,x.candidate),/complete frozen field/);});

test('observational state and nouns remain useful while explicit mutation requests are withheld',()=>{
 for(const text of ['Which version is running?','What is the current setting?','Which set of logs belongs to this request?','What value is already set in the effective configuration?','Which restart event is recorded?','Was the image already pinned in the submitted configuration?'])assert.doesNotThrow(()=>assertDiagnosticProse(text),text);
 for(const text of ['Could you set the value to 50?','Please change the setting.','Would setting the limit help?','Have you tried running the command?','Can we pin the image?','The next step is to override the helper.','Run the diagnostic script.'])assert.throws(()=>assertDiagnosticProse(text),/diagnostic prose/,text);
});
test('legacy historical field paths remain exact raw anchors without prescriptive authority',()=>{
 const x=fixture();x.context.evidence[0]={id:'KA-0042',kind:'experience-memory',fix:'Old raw fix text',cause:'Old raw cause text',verification:'Old raw verification text',limitations:'A different historical incident.'};x.audit.claimAudit[0].evidence=[{sourceId:'KA-0042',fieldPath:'fix',quote:'Old raw fix text'},{sourceId:'KA-0042',fieldPath:'cause',quote:'Old raw cause text'},{sourceId:'KA-0042',fieldPath:'verification',quote:'Old raw verification text'}];
 const before=structuredClone(x.context);assert.doesNotThrow(()=>validateAuditOutput(x.audit,x.context,x.candidate));assert.deepEqual(x.context,before);x.audit.claimAudit[0].verdict='supported';assert.throws(()=>validateAuditOutput(x.audit,x.context,x.candidate),/lacks exact official-section/);
});
