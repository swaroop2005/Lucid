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
