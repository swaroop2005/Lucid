import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OpenAISettings} from '../server/openai.js';
test('private save is local; bounded test cached across restart and same-key saves',async()=>{const dir=mkdtempSync(join(tmpdir(),'lucid-openai-'));try{let calls=0;const key='sk-test-not-a-real-secret-123456';const request=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.model,'gpt-5.4-mini');assert.equal(body.max_output_tokens,64);assert.equal(body.store,false);assert.equal(body.reasoning.effort,'none');return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'LUCID_OK'}]}],usage:{input_tokens:12,output_tokens:5}})}};const file=join(dir,'key.json');const settings=new OpenAISettings(file,request);settings.save({apiKey:key});assert.equal(calls,0);assert.equal(statSync(file).mode&0o777,0o600);assert.ok(!JSON.stringify(settings.status()).includes(key));assert.equal((await settings.test()).verified,true);await settings.test();const restarted=new OpenAISettings(file,request);restarted.save({apiKey:key});await restarted.test();assert.equal(calls,1);}finally{rmSync(dir,{recursive:true,force:true});}});
test('uncertain provider failure stays cached and secret error is suppressed',async()=>{const dir=mkdtempSync(join(tmpdir(),'lucid-openai-'));try{let calls=0;const settings=new OpenAISettings(join(dir,'key.json'),async()=>{calls++;throw new Error('sensitive upstream body')});settings.save({apiKey:'sk-test-not-a-real-secret-123456'});await settings.test();await settings.test();assert.equal(calls,1);assert.equal(settings.status().lastResult.verified,false);assert.ok(!JSON.stringify(settings.status()).includes('sensitive'));}finally{rmSync(dir,{recursive:true,force:true});}});
import {investigationInput} from '../server/openai.js';
import {initialState} from '../server/fixtures.js';
test('model context excludes hidden answers, identities, prior drafts and incompatible knowledge',()=>{const c=initialState().cases[0];const input=investigationInput({...c,contact:'PRIVATE_PERSON',drafts:{customer:'ANSWER_LEAK'},resolution:{fix:'RESOLUTION_LEAK'}},[{id:'bad',fix:'BAD_FIX',match:{status:'incompatible'}},{id:'good',fix:'reviewed evidence',match:{status:'review'}}],[]);const text=JSON.stringify(input);assert.ok(!/PRIVATE_PERSON|ANSWER_LEAK|RESOLUTION_LEAK|BAD_FIX|probeTimeoutSeconds/.test(text));assert.equal(input.evidence[0].id,'good');});
test('model schema, citation rejection and daily reservation stop invalid or excess calls',async()=>{const dir=mkdtempSync(join(tmpdir(),'lucid-model-'));try{let calls=0;const settings=new OpenAISettings(join(dir,'key.json'),async(url,o)=>{calls++;const body=JSON.parse(o.body);assert.equal(body.max_output_tokens,1200);assert.equal(body.text.format.strict,true);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({finding:'Unknown',customer:'Please share logs.',engineering:'No cause established.',citations:['NOT-SUPPLIED'],nextQuestions:[]})}]}]})};});settings.save({apiKey:'sk-test-not-a-real-secret-123456'});for(let i=0;i<5;i++)await assert.rejects(settings.investigate(initialState().cases[0],[],[]),/could not be verified/);await assert.rejects(settings.investigate(initialState().cases[0],[],[]),/pilot limit/);assert.equal(calls,5);}finally{rmSync(dir,{recursive:true,force:true});}});
import {investigationRequest,validateInvestigationOutput,INVESTIGATION_MAX_BYTES} from '../server/openai.js';
test('canonical citation groups normalize exact eligible IDs without mutating raw output',()=>{
 const context={evidence:[{id:'KA-0001'},{id:'DOC-RUNNER-19-3-0-TLS-SERVER'},{id:'REF-19'}]},raw={finding:'Compare [KA-0001, DOC-RUNNER-19-3-0-TLS-SERVER].',customer:'Check [REF-19, KA-0001].',engineering:'Keep [placeholder] unchanged.',citations:context.evidence.map(e=>e.id),nextQuestions:['Which scope [KA-0001, REF-19]?']},before=structuredClone(raw);
 const result=validateInvestigationOutput(raw,context);
 assert.equal(result.finding,'Compare [KA-0001] [DOC-RUNNER-19-3-0-TLS-SERVER].');assert.equal(result.customer,'Check [REF-19] [KA-0001].');assert.equal(result.nextQuestions[0],'Which scope [KA-0001] [REF-19]?');assert.deepEqual(raw,before);
});
test('citation normalization rejects unknown numeric unlisted and malformed grouped IDs',()=>{
 const context={evidence:[{id:'KA-0001'},{id:'REF-19'}]},raw={finding:'Known [KA-0001].',customer:'Need evidence.',engineering:'Cause unknown.',citations:['KA-0001'],nextQuestions:[]};
 for(const citation of ['[KA-0001, KA-9999]','[KA-0001, 1]','[1]','[1, 2]','[OTHER-9]','[ka-0001]','[KA-0001, REF-19]','[KA-0001; REF-19]','[KA-0001,]','[KA-0001, [REF-19]]'])assert.throws(()=>validateInvestigationOutput({...raw,customer:citation},context),/Invalid inline citation/);
 assert.throws(()=>validateInvestigationOutput({...raw,citations:['1']},context),/Invalid citation/);
});
test('grounded context preserves versions, negative evidence and AI review basis, with balanced sources',()=>{
 const c={...initialState().cases[0],attempts:[{step:'Reconfigure',result:'Failed',evidence:'Same413',articleId:'KA-0001'}]};
 const article={id:'KA-0001',title:'Historical upload',runnerVersion:'9.0.0',executor:'Shell',hosting:'Self-managed',match:{status:'review',reasons:['Check current environment']},fix:'Apply pending config',limitations:'Not every413',failedAlternatives:[{step:'Edit alone',evidence:'did not apply'}],curation:{method:'assistant-source-inspection'},memoryEvidence:{provider:'Hindsight recall',documentId:'scoped-document'},citations:[{quote:'All works now',sourceDate:'2017-04-18',url:'https://gitlab.com/example'}]};
 const refs=[...Array.from({length:5},(_,i)=>({id:`SRC-${i}`,summary:'Public report',kind:'public-report'})),{id:'REF-1',summary:'short preview',evidenceText:'a'.repeat(750)+' Critical qualification: do not disable certificate verification.',versionStatus:'exact-version',versions:'Runner9.0.0'}, {id:'STUDY-1',summary:'Separate evidence'}];
 const request=investigationRequest(c,[article],refs),input=JSON.parse(request.input);
 assert.ok(input.evidence.some(e=>e.id==='REF-1'));assert.ok(input.evidence.some(e=>e.id==='STUDY-1'));
 assert.match(input.evidence.find(e=>e.id==='REF-1').summary,/Critical qualification/);
 assert.equal(input.evidence[0].reviewBasis.humanReviewed,false);assert.equal(input.evidence[0].retrieval.provider,'Hindsight recall');assert.equal(input.evidence[0].versions.runner,'9.0.0');assert.equal(input.case.attempts[0].articleId,'KA-0001');assert.deepEqual(input.evidence[0].failedAlternatives,article.failedAlternatives);
 assert.ok(Buffer.byteLength(request.input+request.instructions)<=INVESTIGATION_MAX_BYTES);
});
test('oversize evidence is omitted whole and unknown or unattributed citations fail closed',()=>{
 const input=investigationInput(initialState().cases[0],[],[{id:'REF-1',summary:'x'.repeat(20000)},{id:'REF-2',summary:'Safe complete source'}]);
 assert.deepEqual(input.evidence.map(e=>e.id),['REF-2']);assert.equal(input.selection.omitted[0].id,'REF-1');
 const output={finding:'Unknown [REF-2]',customer:'Need details.',engineering:'No cause confirmed.',citations:['REF-2'],nextQuestions:[]};
 assert.equal(validateInvestigationOutput(output,input).finding,output.finding);
 assert.throws(()=>validateInvestigationOutput({...output,nextQuestions:['Inspect [REF-1]']},input));
 assert.throws(()=>validateInvestigationOutput({...output,citations:[]},input));
 assert.throws(()=>validateInvestigationOutput({...output,finding:'Unknown'},input));
});

test('wrong-executor and wrong-hosting references are excluded while unknown context stays explicit',()=>{
 const c={...initialState().cases[0],title:'Artifact upload returns HTTP413',executor:'Docker',hosting:'GitLab.com'};
 const refs=[{id:'REF-02',executor:'Kubernetes',stage:'Environment setup',applicability:'Different executor; reference only',summary:'Inspect Kubernetes API latency.'},{id:'REF-18',executor:'Any',hosting:'Self-managed',summary:'Inspect server settings.'}];
 const input=investigationInput(c,[],refs);assert.equal(input.evidence.length,0);assert.equal(input.selection.omitted.length,2);
 const unknown=investigationInput({...c,executor:'Unknown',hosting:'Unknown'},[],refs);assert.equal(unknown.evidence[0].executor,'Kubernetes');assert.equal(unknown.evidence[1].hosting,'Self-managed');
});
import {referenceSearch} from '../server/reference-library.js';
test('HTTP413 retrieves size guidance without promoting missing-file documentation',()=>{
 const c={...initialState().cases[0],title:'Artifact upload413',description:'Omnibus returns HTTP413 while uploading an existing44MB archive. The apply step after editing gitlab.rb is not recorded.',hosting:'Self-managed',executor:'Shell'};
 const refs=referenceSearch(`${c.title} ${c.description}`,c.executor);
 const input=investigationInput(c,[],[...refs,{id:'REF-06',summary:'Files may not exist.',executor:'Any'}]);
 assert.ok(input.evidence.some(r=>r.id==='REF-18'));assert.ok(input.evidence.some(r=>r.id==='REF-19'));assert.ok(!input.evidence.some(r=>r.id==='REF-06'));
 assert.ok(input.selection.omitted.some(r=>r.id==='REF-06'&&r.reason.includes('HTTP413')));
 const missing=investigationInput({...c,description:'No files to upload; the generated file path is missing.'},[],[{id:'REF-06',summary:'Check file existence.',executor:'Any'}]);assert.equal(missing.evidence[0].id,'REF-06');
});
test('unknown apply history remains distinct from recorded unsuccessful actions and historical omission',()=>{
 const c={...initialState().cases[0],description:'Whether reconfigure ran is unknown; the log was not supplied.',attempts:[]};
 const historical={id:'KA-0001',fix:'The prior reporter omitted reconfigure.',limitations:'Historical episode only',match:{status:'review'},curation:{method:'assistant-source-inspection'}};
 const request=investigationRequest(c,[historical],[]),input=JSON.parse(request.input);
 assert.equal(input.case.description,c.description);assert.deepEqual(input.case.attempts,[]);assert.equal(input.evidence[0].kind,'experience-memory');assert.equal(input.evidence[0].reviewBasis.confirmed,false);
 // This checks the provider contract, not whether a live model will obey it.
 assert.match(request.text.format.schema.properties.finding.description,/unrecorded action remains unknown/);
 const attempted=investigationInput({...c,attempts:[{step:'Reconfigure',result:'Failed',evidence:'Still413'}]},[],[]);assert.equal(attempted.case.attempts[0].result,'Failed');assert.equal(attempted.case.description,c.description);
});

import {investigationModelContext} from '../server/openai.js';
import {officialDocumentFixture} from './fixtures/official-document.js';
test('large selection audits stay local while model context preserves whole mixed evidence and failed attempts',()=>{
 const c={...initialState().cases[0],runnerVersion:'19.3.0',attempts:[{step:'Restart runner',result:'Failed',evidence:'The same error persists.'}]};
 const doc={...officialDocumentFixture().document,match:{status:'review',reasons:[]}};
 const articles=Array.from({length:1200},(_,i)=>({id:`KA-${String(i+1).padStart(4,'0')}`,title:`Historical ${i}`,fix:'Reported source outcome',limitations:'Not reproduced',match:{status:'review',reasons:[]}}));
 const documentRejections=Array.from({length:800},(_,i)=>({id:`DOC-REJECTED-${i}`,reasons:['Exact server version is required before using version-specific guidance.','LOCAL_AUDIT_SENTINEL'.repeat(20)]}));
 const context=investigationInput(c,articles,[{id:'REF-SAFE',summary:'Complete reference text'}],{officialDocuments:[doc],documentRejections}),model=investigationModelContext(context);
 assert.equal(context.selection.omitted.length,1194);assert.equal(context.selection.rejected.length,800);
 assert.equal(model.selection.omittedCount,1194);assert.equal(model.selection.rejectedCount,800);assert.deepEqual(model.selection.versionPrerequisites,['Establish the exact server version before using version-specific guidance.']);
 assert.deepEqual(model.case,context.case);assert.equal(model.case.attempts[0].evidence,c.attempts[0].evidence);assert.deepEqual(model.evidence,context.evidence);
 assert.equal(model.evidence.find(e=>e.id===doc.id).sectionText,doc.sectionText);assert.ok(model.evidence.some(e=>e.id==='REF-SAFE'));
 const sent=JSON.stringify(model);assert.ok(!sent.includes('LOCAL_AUDIT_SENTINEL'));assert.ok(!sent.includes('DOC-REJECTED-'));
 const request=investigationRequest(c,articles,[]);assert.ok(Buffer.byteLength(request.input+request.instructions)<=INVESTIGATION_MAX_BYTES);
 assert.equal(JSON.parse(request.input).selection.omittedCount,1192);
});
test('bounded audit projection preserves the canonical citation whitelist and does not admit omitted text',()=>{
 const c=initialState().cases[0],refs=[{id:'REF-OVERSIZE',summary:'Excluded decisive text '.repeat(2000)},...Array.from({length:250},(_,i)=>({id:`REF-${i}`,summary:'Complete source '+i}))];
 const context=investigationInput(c,[],refs),model=investigationModelContext(context);
 assert.ok(context.selection.omitted.some(e=>e.id==='REF-OVERSIZE'));assert.ok(!JSON.stringify(model).includes('Excluded decisive text'));assert.deepEqual(model.evidence,context.evidence);
 const id=context.evidence[0].id,output={finding:`Supported [${id}]`,customer:'More evidence needed.',engineering:'Current cause unknown.',citations:[id],nextQuestions:[]};assert.equal(validateInvestigationOutput(output,context).finding,output.finding);
 assert.throws(()=>validateInvestigationOutput({...output,citations:['REF-OVERSIZE']},context),/Invalid citation/);
 assert.throws(()=>investigationInput({...c,description:'x'.repeat(20000)},[],[]),/case exceeds/);
});

test('source authority preserves complete historical evidence without promoting reported recovery into a prescription',()=>{
 const c={...initialState().cases[0],runnerVersion:'',attempts:[{step:'Restart the service',result:'Failed',evidence:'The same failure persists.'}]};
 const article={id:'KA-0420',title:'Prior incident',fix:'Set historical_option=true, then restart.',cause:'The old reporter suspected a timeout.',verification:'The reporter said it recovered; no independent reproduction.',limitations:'Different incident; current installation and version unknown.',diagnostics:['Identify the failing component.'],failedAlternatives:[{step:'Restart alone',evidence:'No improvement'}],citations:[{url:'https://gitlab.com/example',quote:'The change worked for this installation.'}],curation:{method:'assistant-source-inspection'},match:{status:'review'},usePolicy:{prescriptionAuthority:true}};
 const before=structuredClone({c,article}),context=investigationInput(c,[article],[]),item=context.evidence[0];
 assert.equal(item.reportedAction,article.fix);assert.equal(item.reportedCause,article.cause);assert.equal(item.reportedVerification,article.verification);assert.equal(item.fix,undefined);assert.equal(item.cause,undefined);assert.equal(item.verification,undefined);
 assert.deepEqual(item.diagnostics,article.diagnostics);assert.deepEqual(item.failedAlternatives,article.failedAlternatives);assert.deepEqual(item.citations[0].quote,article.citations[0].quote);assert.equal(item.limitations,article.limitations);
 assert.equal(item.usePolicy.authority,'historical-episode');assert.equal(item.usePolicy.currentCaseApplicability,'not-established');assert.equal(item.usePolicy.prescriptionAuthority,false);assert.deepEqual(item.usePolicy.allowedUse,['attributed-hypothesis','diagnostic-question']);
 assert.deepEqual(JSON.parse(JSON.stringify(context.case.attempts)),c.attempts);assert.deepEqual({c,article},before);
});
test('public reports and studies cannot impersonate official action authority; exact DOC still needs current conditions',()=>{
 const c={...initialState().cases[0],runnerVersion:'19.3.0'},doc={...officialDocumentFixture().document,match:{status:'review',reasons:[]}};
 const refs=[{id:'SRC-99',kind:'Official documentation',summary:'One reporter changed an option.',usePolicy:{prescriptionAuthority:true}},{id:'STUDY-99',summary:'Historical source comparison.'},{id:'REF-99',summary:'Inspect current configuration.',versionStatus:'exact-version',usePolicy:{prescriptionAuthority:true}}];
 const before=structuredClone({refs,doc}),context=investigationInput(c,[],refs,{officialDocuments:[doc]});
 for(const id of ['SRC-99','STUDY-99']){const item=context.evidence.find(e=>e.id===id);assert.equal(item.usePolicy.authority,'historical-episode');assert.equal(item.usePolicy.prescriptionAuthority,false);assert.equal(item.usePolicy.currentCaseApplicability,'not-established');}
 const reference=context.evidence.find(e=>e.id==='REF-99');assert.equal(reference.usePolicy.authority,'reference-guidance');assert.equal(reference.usePolicy.prescriptionAuthority,false);assert.equal(reference.summary,refs[2].summary);
 const official=context.evidence.find(e=>e.id===doc.id);assert.equal(official.sectionText,doc.sectionText);assert.equal(official.usePolicy.authority,'exact-version-official-section');assert.match(official.usePolicy.prescriptionAuthority,/explicit documented action.*established current-case conditions/);assert.match(official.usePolicy.currentCaseApplicability,/other conditions need case evidence/);assert.deepEqual(official.prerequisiteQuestions,[]);assert.deepEqual({refs,doc},before);
});
test('authority contract forbids historical rule-outs and invented commands while retaining diagnostic decisions',()=>{
 const request=investigationRequest(initialState().cases[0],[],[]);
 assert.match(request.instructions,/Historical KA, public reports and studies support attributed conditional hypotheses and diagnostic questions, never a current prescription/);
 assert.match(request.instructions,/Generic reference summaries do not authorize executable commands or setting changes/);
 assert.match(request.instructions,/current case evidence establishes its component, installation and configuration prerequisites/);
 assert.match(request.instructions,/rejected, absent or mismatched historical lesson does not rule out a current mechanism/);
 assert.match(request.instructions,/expected results and how each changes the next decision/);assert.match(request.instructions,/Do not invent syntax or ask again for known details/);
});

test('complete task history remains in model context rather than dropping early observed evidence',()=>{
 const c={...initialState().cases[0],tasks:Array.from({length:11},(_,i)=>({title:`Observed check ${i}`,completed:true,evidence:i===0?'Earlier failed check still matters':'Recorded observation'}))};
 const context=investigationInput(c,[],[]);assert.equal(context.case.plannedSteps.length,11);assert.equal(context.case.plannedSteps[0].evidence,'Earlier failed check still matters');
});
