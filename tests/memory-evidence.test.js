import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMemoryPacket,MEMORY_PACKET_MAX_BYTES} from '../server/memory-evidence.js';

function fixture(){
 const article={id:'KA-0001',revision:1,fingerprint:'a'.repeat(64),title:'Check the actual probe before changing its threshold',symptom:'runner-restarts',executor:'Kubernetes',hosting:'Self-managed',runnerVersion:'',serverVersion:'',chartVersion:'',cause:'',fix:'Change the timeout only after verifying a timed-out probe.',verification:'The reviewed historical report describes stopped restarts.',limitations:'Workaround only; not a universal fix.',updatedAt:'2026-09-27T15:00:00.000Z',reviewer:'Morgan Reviewer',sourceCases:['CS-1'],citations:[{id:'SRC-1',title:'Public investigation',url:'https://gitlab.com/gitlab-org/gitlab-runner/-/issues/1#note_2',status:'Source-reported success; not human reviewed',quote:'I changed the timeout and it works now. I do not know why.',sourceDate:'2023-12-21T10:00:00Z',contradictions:[{quote:'The timeout change did not fix my restarts.',url:'https://gitlab.com/gitlab-org/gitlab-runner/-/issues/1#note_3',sourceDate:'2024-01-10'}]}]};
 return {article,state:{articles:[article],companies:[{id:'org-private',name:'Acme Internal'}],cases:[{id:'CS-1',sourceId:'SRC-1',sourceDate:'2023-12-21',occurredAt:'',reconstructed:true,companyId:'org-private',contact:'Alice Private',owner:'Bob Private',host:'ci.private.test',description:'PRIVATE FULL REPORT SHOULD NEVER ENTER MEMORY',attempts:[{id:'a-1',step:'Restart the runner',result:'Failed',evidence:'Restarts continued; do not retry without new evidence.',at:'2026-09-26T14:00:00Z'}]}],replayOutcomes:{'CS-1':{fix:'HIDDEN ANSWER MUST STAY HIDDEN'}},corpus:[{report:'FULL THREAD MUST STAY HIDDEN'}],settings:{key:'PRIVATE SETTINGS MUST STAY HIDDEN'}}};
}
const build=f=>buildMemoryPacket(f.article,f.state,{scope:'workspace-test-123'});
test('packet preserves decisive negation, contradictions and historical dates separately from review time',()=>{
 const f=fixture(),p=build(f),body=JSON.parse(p.content);
 assert.equal(body.citations[0].quote,f.article.citations[0].quote);
 assert.match(body.citations[0].contradictions[0].quote,/did not fix/);
 assert.equal(body.citations[0].sourceDate,'2023-12-21T10:00:00Z');assert.equal(body.sourceEvents[0].sourceDate,'2023-12-21');
 assert.equal(p.timestamp,'2026-09-27T15:00:00.000Z');assert.equal(body.article.reviewedAt,p.timestamp);
 assert.equal(body.article.versions.runner,'Unknown');assert.match(body.article.cause,/Unknown/);
 assert.deepEqual(p.tags,['workspace-test-123','product:gitlab-runner','executor:kubernetes']);
 assert.match(body.failedOrInconclusiveAttempts[0].evidence,/do not retry/);
 assert.equal(body.failedOrInconclusiveAttempts[0].sourceEventDate,'2023-12-21');
 assert.equal(p.metadata.hash,f.article.fingerprint);assert.match(p.metadata.packet_hash,/^[a-f0-9]{64}$/);
 assert.ok(Buffer.byteLength(JSON.stringify(p))<=MEMORY_PACKET_MAX_BYTES);
});
test('private identities, credentials, complete reports and hidden outcomes never enter selected packet fields',()=>{
 const f=fixture();f.state.cases[0].attempts[0].evidence='Alice Private at Acme Internal and Bob Private contacted alice@private.test from 10.0.0.1 at ci.private.test; password=pretend-secret-value did not fix the issue.';
 f.article.citations[0].quote='Alice Private changed the timeout and it works now; password=pretend-secret-value.';
 const p=build(f),text=JSON.stringify(p);
 for(const sensitive of ['Alice Private','Bob Private','Morgan Reviewer','Acme Internal','alice@private.test','10.0.0.1','ci.private.test','pretend-secret-value','HIDDEN ANSWER','FULL THREAD','PRIVATE FULL REPORT','PRIVATE SETTINGS'])assert.ok(!text.includes(sensitive),sensitive);
 assert.match(JSON.parse(p.content).citations[0].quoteFidelity,/privacy-redacted/);
 assert.match(text,/did not fix/);
});
test('canonical hash is stable across object/array ordering and unrelated workspace changes',()=>{
 const f=fixture();f.article.citations.push({...f.article.citations[0],id:'SRC-2',url:'https://gitlab.com/gitlab-org/gitlab-runner/-/issues/2'});
 const p=build(f);f.article.citations.reverse();f.state.events=[{text:'unrelated'}];f.state.cases.push({id:'CS-99',description:'unrelated',attempts:[{result:'Failed',evidence:'UNRELATED FAILURE'}]});
 assert.deepEqual(build(f),p);assert.ok(!p.content.includes('UNRELATED FAILURE'));
 f.state.cases[0].attempts[0].evidence='The failure changed and requires another review.';assert.notEqual(build(f).metadata.packet_hash,p.metadata.packet_hash);
});
test('builder reads canonical approved fields and rejects stale or unapproved article identities',()=>{
 const f=fixture(),p=buildMemoryPacket({...f.article,fix:'UNREVIEWED CALLER FIX'},f.state,{scope:'workspace-test-123'});
 assert.ok(!p.content.includes('UNREVIEWED CALLER FIX'));
 assert.throws(()=>buildMemoryPacket({...f.article,revision:2},f.state,{scope:'workspace-test-123'}),/current approved/);
 assert.throws(()=>buildMemoryPacket(f.article,{...f.state,articles:[]},{scope:'workspace-test-123'}),/current approved/);
});
test('legacy source summary is not labeled as a quotation and missing source date stays unknown',()=>{
 const f=fixture();f.article.citations=[{id:'SRC-legacy',url:'https://docs.gitlab.com/runner/',excerpt:'Summary of current guidance.'}];f.state.cases[0].sourceDate='';
 const body=JSON.parse(build(f).content);assert.equal(body.citations[0].quote,null);assert.match(body.citations[0].quoteFidelity,/not a quotation/);assert.equal(body.citations[0].summary,'Summary of current guidance.');assert.equal(body.citations[0].sourceDate,null);assert.equal(body.sourceEvents[0].sourceDate,null);
});
test('only failed and inconclusive attempts from linked source cases are included',()=>{
 const f=fixture();f.state.cases[0].attempts.push({step:'Unverified positive',result:'Succeeded',evidence:'POSITIVE ATTEMPT NOT ARTICLE VERIFICATION'});f.state.cases[0].attempts.push({step:'Measure another restart',result:'Inconclusive',evidence:'No stable conclusion.'});
 const p=build(f),body=JSON.parse(p.content);assert.equal(body.failedOrInconclusiveAttempts.length,2);assert.ok(!p.content.includes('POSITIVE ATTEMPT'));assert.ok(body.failedOrInconclusiveAttempts.some(a=>a.result==='Inconclusive'));
});
test('oversize UTF-8 evidence is rejected instead of slicing away final negation',()=>{
 const f=fixture();f.article.citations[0].quote='界'.repeat(4100)+' This did not fix the issue.';
 assert.throws(()=>build(f),/12000 UTF-8.*not truncated/);assert.ok(f.article.citations[0].quote.endsWith('did not fix the issue.'));
});
test('credential/private citations, malformed dates and missing scopes fail before any retain call',()=>{
 for(const url of ['http://gitlab.com/issue/1','https://user:password@example.com/1','https://10.0.0.1/1','https://ci.private.test/1','https://gitlab.com/issue?access_token=secret']){const f=fixture();f.article.citations[0].url=url;assert.throws(()=>build(f),/source URL|HTTPS/);}
 const f=fixture();f.article.citations[0].sourceDate='yesterday';assert.throws(()=>build(f),/ISO/);assert.throws(()=>buildMemoryPacket(f.article,f.state,{}),/scope/);
});

test('blank cause/versions remain unknown and invalid calendar dates are not promoted to source dates',()=>{const f=fixture();f.article.cause='   ';f.article.runnerVersion=' ';const body=JSON.parse(build(f).content);assert.match(body.article.cause,/Unknown/);assert.equal(body.article.versions.runner,'Unknown');f.article.citations[0].sourceDate='2023-02-30';assert.throws(()=>build(f),/calendar day/);});
