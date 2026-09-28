import test from 'node:test';
import assert from 'node:assert/strict';
import {requestFor,eligibleEvidence,validateOutput,armOrder} from '../scripts/lib/quality-eval-core.js';
const input={case:{title:'Cannot fetch source',description:'TLS handshake failed',executor:'Docker',hosting:'Self-managed',runnerVersion:'18.4.0',serverVersion:'',chartVersion:'',attempts:[]},references:[]};
const article={id:'KA-0001',revision:1,fingerprint:'abc',symptom:'unclassified',executor:'Docker',hosting:'Self-managed',runnerVersion:'18.4.0',fix:'Inspect trust chain',limitations:'Source-reported only'};
test('paired requests differ only in memoryEvidence; hidden record fields cannot reach provider',()=>{
 const poisoned={...input,hiddenOutcome:'SENTINEL_PRIVATE_OUTCOME',sourceId:'secret-issue'},base=requestFor(poisoned),memory=requestFor(poisoned,[{id:'KA-0001',fix:'Inspect chain'}]);
 const parsed=JSON.parse(memory.input);parsed.memoryEvidence=[];assert.deepEqual({...memory,input:JSON.stringify(parsed)},base);assert.ok(!JSON.stringify(base).includes('SENTINEL'));assert.ok(!JSON.stringify(base).includes('secret-issue'));assert.deepEqual(armOrder('Q01'),armOrder('Q01'));
});
test('recall requires exact current revision and rejects incompatible known environment',()=>{
 const state={articles:[article]},record={articleId:article.id,revision:1,hash:'abc'};
 assert.equal(eligibleEvidence(state,[record],input).eligible.length,1);
 assert.equal(eligibleEvidence(state,[{...record,hash:'stale'}],input).eligible.length,0);
 assert.equal(eligibleEvidence(state,[{...record,revision:2}],input).eligible.length,0);
 const result=eligibleEvidence(state,[record],{...input,case:{...input.case,runnerVersion:'18.3.0'}});assert.equal(result.eligible.length,0);assert.match(result.rejected[0].reasons.join(' '),/version differs/);
});
test('unknown or unlisted inline citations fail; output and request are bounded',()=>{
 const raw={finding:'Investigate certificate chain',diagnosticSteps:[],conditionalActions:[],missingFacts:[],shouldAbstain:true,abstentionReason:'Cause unknown',citations:[]};
 assert.deepEqual(validateOutput(raw,requestFor(input)),raw);
 for(const id of ['L01','KA-0001','REF-42'])assert.throws(()=>validateOutput({...raw,finding:`Use [${id}]`},requestFor(input)),/inline citation/);
 assert.throws(()=>validateOutput({...raw,citations:['L01']},requestFor(input)),/Unavailable citation/);
 assert.throws(()=>requestFor({...input,case:{description:'x'.repeat(17000)}}),/16000-byte/);
});
