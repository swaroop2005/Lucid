import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hash} from '../server/domain.js';
import {createCheckpointBudget} from '../server/cloud-checkpoint-budget.js';
test('checkpoint preflight requires matching existing authority and the full remaining category allocation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'checkpoint-cap-')),ledgerPath=join(dir,'ledger.json'),secret={baseUrl:'https://example.invalid',bank:'test-bank',apiKey:'test-only'},connectionId=hash([secret.baseUrl,secret.bank,hash(secret.apiKey)]),workspaceId='test-workspace',budget=createCheckpointBudget({ledgerPath,settings:{read:()=>secret},store:{read:()=>({workspaceId})}});
 try{
 assert.equal(budget.status().authorized,false);const ledger={provider:'Hindsight Cloud',capUSD:50,unallocatedSafetyUSD:1,categoryCaps:{ingestion:27.35},workspaceId,connectionId,calls:[{reservedUSD:23.01,category:'ingestion'},{reservedUSD:13.15,category:'evaluation'}]},save=()=>writeFileSync(ledgerPath,JSON.stringify(ledger));save();
 assert.deepEqual(budget.status(),{authorized:true,reservedUSD:36.16,remainingUSD:12.84,ingestionRemainingUSD:4.34,note:'Conservative reservations, not measured provider charges. The protected reserve is excluded from available credit.'});const request={workspaceId,connectionId,bank:secret.bank,forecast:{totalReservationUSD:.8}};assert.equal(budget.canSpend(request),true);assert.equal(budget.canSpend({...request,forecast:{totalReservationUSD:4.35}}),false);assert.equal(budget.canSpend({...request,connectionId:'other'}),false);ledger.stopped={reason:'test'};save();assert.equal(budget.canSpend(request),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});


test('unrelated or stopped credit authority never exposes its reservation amounts in status',()=>{
 const dir=mkdtempSync(join(tmpdir(),'checkpoint-private-')),ledgerPath=join(dir,'ledger.json'),originalSecret={baseUrl:'https://example.invalid',bank:'fixture-bank',apiKey:'fixture-secret'},connectionId=hash([originalSecret.baseUrl,originalSecret.bank,hash(originalSecret.apiKey)]),workspaceId='fixture-workspace';
 let secret=originalSecret,activeWorkspace=workspaceId;
 const budget=createCheckpointBudget({ledgerPath,settings:{read:()=>secret},store:{read:()=>({workspaceId:activeWorkspace})}}),authority={provider:'Hindsight Cloud',capUSD:50,unallocatedSafetyUSD:5,categoryCaps:{ingestion:20},workspaceId,connectionId,calls:[{reservedUSD:3.25,category:'ingestion'}]},save=value=>writeFileSync(ledgerPath,JSON.stringify(value));
 try{
  save(authority);assert.equal(budget.status().reservedUSD,3.25);
  const denied={authorized:false,reservedUSD:0,remainingUSD:0,ingestionRemainingUSD:0,note:'No matching existing credit authorization is available. No paid checkpoint can start.'};
  for(const change of ['disconnected','key','bank','workspace','stopped']){
   secret=originalSecret;activeWorkspace=workspaceId;save(authority);
   if(change==='disconnected')secret=null;
   if(change==='key')secret={...originalSecret,apiKey:'different-fixture-key'};
   if(change==='bank')secret={...originalSecret,bank:'different-bank'};
   if(change==='workspace')activeWorkspace='different-workspace';
   if(change==='stopped')save({...authority,stopped:{reason:'fixture'}});
   assert.deepEqual(budget.status(),denied,change);
   assert.equal(budget.canSpend({workspaceId,connectionId,bank:originalSecret.bank,forecast:{totalReservationUSD:.2}}),false,change);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
