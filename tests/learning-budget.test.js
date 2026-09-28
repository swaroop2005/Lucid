import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/db.js';
import {hash,approveKnowledge} from '../server/domain.js';
import {LearningCloseout} from '../server/learning-closeout.js';
import {createInvestigationAuthorizer} from '../server/hindsight-budget.js';
import {HindsightCreditBudget} from '../scripts/lib/hindsight-credit-budget.js';

test('reviewed learning uses real SQLite and locked credit authority, never repeats a write',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'learning-credit-')),store=new Store(':memory:');
 try{
  const secret={baseUrl:'https://example.test',bank:'test-bank',apiKey:'fake-local-test'},connectionId=hash([secret.baseUrl,secret.bank,hash(secret.apiKey)]),settings={read:()=>secret};
  const article=store.update(s=>{s.workspaceId='learning-budget';const c=s.cases[0];c.resolution={fix:'Verified configuration correction',cause:'Confirmed mismatch',evidence:'Affected operation now succeeds',engineer:'Reviewer',confirmed:true};return approveKnowledge(s,c.id,{reviewed:true,reviewer:'Reviewer',title:'Reviewed fix',fix:c.resolution.fix,cause:c.resolution.cause,verification:c.resolution.evidence,limitations:'Only reviewed environment'});});
  const ledgerPath=join(dir,'ledger.json'),ledger=new HindsightCreditBudget(ledgerPath);ledger.initialize();ledger.update(l=>Object.assign(l,{connectionId,workspaceId:store.read().workspaceId}));
  const authorize=createInvestigationAuthorizer({ledgerPath,store,settings});let document,retains=0;
  const client={listMentalModels:async()=>({items:[],total:0}),getDocument:async()=>document};
  const provider={c:{memoryMode:'hindsight',allowExternal:true,bank:secret.bank},scope:()=>`lucid-workspace-${store.read().workspaceId}`,getClient:()=>client,operation:async()=>({status:'completed'}),retain:async(a,{plan,operationId})=>{retains++;assert.equal(ledger.read().calls.at(-1).operation,'learning-retain');assert.equal(ledger.read().calls.at(-1).status,'dispatched');document={id:plan.docId,original_text:plan.packet.content,tags:plan.packet.tags,document_metadata:plan.packet.metadata,memory_unit_count:1};return {provider:'hindsight',docId:plan.docId,result:{operation_id:operationId}};}};
  const service=new LearningCloseout(store,()=>provider,{connectionId:()=>connectionId,authorize});const queued=service.enqueue(article.id,{caseId:store.read().cases[0].id,expectedRevision:1});
  const result=await service.run(queued.key);assert.equal(result.status,'succeeded');assert.equal(retains,1);assert.equal(ledger.summary().reservedUSD,.2);assert.equal(ledger.summary().byCategory.ingestion.reservedUSD,.2);assert.equal(ledger.summary().byCategory.evaluation.reservedUSD,0);
  await service.run(queued.key);assert.equal(retains,1);
  assert.throws(()=>ledger.reserve({id:'different-id',category:'ingestion',operation:'learning-retain',reservedUSD:.15,limits:{closeoutId:queued.key}}),/already reserved/);
  const request={...store.read().learningCloseouts[queued.key].plan,operation:'retain'};await assert.rejects(authorize({id:'forged',kind:'learning-retain',connectionId,closeoutId:queued.key,request}),/frozen packet/);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
