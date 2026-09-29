import test from 'node:test';
import assert from 'node:assert/strict';
import {publicSnapshot} from '../server/domain.js';
import {initialState} from '../server/fixtures.js';

test('saved investigation projection exposes only case display fields and selected existing lessons',()=>{
 const state=initialState(),c=state.cases[0];state.articles=[{id:'KA-0217',revision:1}];
 c.analysis={modelResult:{investigationId:'PRIVATE_BASELINE_ID'},finding:'Keep saved answer'};
 state.hindsightInvestigations=[
  {id:'PRIVATE_BASELINE_ID',caseId:c.id,at:'2026-09-29T00:00:00Z',useMemory:false,status:'succeeded',result:{private:'PRIVATE_RESULT'},selectedArticleIds:['KA-0217']},
  {id:'PRIVATE_FAILED_ID',caseId:c.id,at:'2026-09-29T00:01:00Z',useMemory:true,status:'unverified',selectedArticleIds:['KA-0217','KA-0217','KA-9999','PRIVATE_SOURCE'],candidate:{fix:'PRIVATE_ADVICE'},failure:{message:'PRIVATE_ERROR'},phases:[{request:'PRIVATE_REQUEST',response:'PRIVATE_RESPONSE'}],connectionId:'PRIVATE_CONNECTION'},
  {caseId:'different-case',at:'2026-09-29T00:02:00Z',status:'unverified'},
 ];
 const before=structuredClone(state),snapshot=publicSnapshot(state,{}),runs=snapshot.cases[0].savedInvestigations;
 assert.deepEqual(runs,[{at:'2026-09-29T00:01:00.000Z',useMemory:true,status:'withheld',articleIds:['KA-0217']},{at:'2026-09-29T00:00:00.000Z',useMemory:false,status:'delivered',articleIds:[]}]);
 assert.equal(snapshot.hindsightInvestigations,undefined);assert.ok(!JSON.stringify(runs).includes('PRIVATE_'));assert.deepEqual(state,before);assert.equal(snapshot.cases[0].analysis.finding,'Keep saved answer');
});
test('history does not claim delivery for a successful engine result absent from current case',()=>{
 const state=initialState(),c=state.cases[0];state.hindsightInvestigations=[{caseId:c.id,status:'succeeded',result:{secret:'never display'},at:'not a date',useMemory:'true'},{caseId:c.id,status:'dispatched',at:'2026-09-29',useMemory:true}];
 const runs=publicSnapshot(state,{}).cases[0].savedInvestigations;
 assert.equal(runs[0].status,'pending');assert.deepEqual(runs[1],{at:null,useMemory:null,status:'recorded',articleIds:[]});
});
