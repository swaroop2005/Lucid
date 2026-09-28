import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HindsightCreditBudget} from '../scripts/lib/hindsight-credit-budget.js';
test('Hindsight reservations preserve evaluation capacity and uncertain calls across restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hindsight-budget-'));try{
  const file=join(dir,'ledger.json'),budget=new HindsightCreditBudget(file);budget.initialize();
  await assert.rejects(budget.run({id:'retain-1',category:'ingestion',operation:'retain',reservedUSD:19},async()=>{throw new Error('Unknown outcome');}));
  const restarted=new HindsightCreditBudget(file);assert.equal(restarted.initialize().calls[0].status,'unverified');
  assert.throws(()=>restarted.reserve({id:'retain-1',category:'ingestion',reservedUSD:1}),/already reserved/);
  assert.throws(()=>restarted.reserve({id:'retain-2',category:'ingestion',reservedUSD:2}),/protected category/);
  restarted.reserve({id:'eval-1',category:'evaluation',reservedUSD:20});assert.equal(restarted.summary().reservedUSD,39);
  assert.throws(()=>restarted.reserve({id:'openai',category:'OpenAI',reservedUSD:.1}),/Invalid budget/);
  restarted.reserve({id:'metadata-1',category:'metadata',reservedUSD:0});assert.equal(restarted.summary().byCategory.metadata.operations,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
