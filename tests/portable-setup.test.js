import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Store} from '../server/db.js';
import {hash} from '../server/domain.js';
const run=(script,args=[],env={})=>spawnSync(process.execPath,[resolve('scripts',script),...args],{encoding:'utf8',env:{...process.env,...env}});
test('private handoff preserves immutable library objects without cases, credentials or credit authority',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lucid-handoff-'));try{
  const source=join(dir,'source.sqlite'),target=join(dir,'target.sqlite'),file=join(dir,'private-library.json'),article={id:'KA-0001',revision:1,fingerprint:'a'.repeat(64),fix:'Synthetic historical evidence',cloudScope:{connectionId:'synthetic-connection'}};
  const s=new Store(source);s.update(x=>{x.workspaceId='synthetic-workspace';x.articles=[article];x.cases[0].description='PRIVATE_CASE_SENTINEL';x.outbox=[{body:'PRIVATE_OUTBOX_SENTINEL'}];x.hindsightInvestigations=[{response:'PRIVATE_TRACE_SENTINEL'}];});s.close();
  assert.equal(run('private-library.js',['export','--workspace',source,'--file',file,'--acknowledge-private-data']).status,0);
  const raw=readFileSync(file,'utf8');assert.ok(!raw.includes('PRIVATE_'));assert.equal(statSync(file).mode&0o777,0o600);
  assert.notEqual(run('private-library.js',['export','--workspace',source,'--file',file,'--acknowledge-private-data']).status,0);
  assert.equal(run('private-library.js',['import','--workspace',target,'--file',file,'--acknowledge-private-data']).status,0);
  const t=new Store(target);try{const state=t.read();assert.deepEqual(state.articles,[article]);assert.equal(state.workspaceId,'synthetic-workspace');assert.equal(state.cases.length,9);assert.equal(state.outbox.length,0);}finally{t.close();}
  assert.notEqual(run('private-library.js',['import','--workspace',target,'--file',file,'--acknowledge-private-data']).status,0);
  const changed=JSON.parse(raw);changed.payload.articles[0].fix='Changed';writeFileSync(file,JSON.stringify(changed));assert.notEqual(run('private-library.js',['import','--workspace',join(dir,'bad.sqlite'),'--file',file,'--acknowledge-private-data']).status,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('portable authorization is explicit, workspace-bound, local and never resets an existing ledger',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lucid-authority-'));try{
  const env={DATA_FILE:join(dir,'workspace.sqlite'),SETTINGS_FILE:join(dir,'credentials.json'),HINDSIGHT_CREDIT_LEDGER:join(dir,'ledger.json'),HINDSIGHT_BASE_URL:'https://api.hindsight.vectorize.io',HINDSIGHT_BANK:'synthetic-bank',HINDSIGHT_API_KEY:'synthetic-test-key'};
  const s=new Store(env.DATA_FILE);s.update(x=>{x.workspaceId='synthetic-workspace';});s.close();
  assert.equal(run('configure-cloud.js',[],env).status,0);assert.equal(statSync(env.SETTINGS_FILE).mode&0o777,0o600);
  assert.notEqual(run('authorize-cloud.js',['--cap-usd','10'],env).status,0);
  assert.equal(run('authorize-cloud.js',['--cap-usd','10','--acknowledge-paid-usage'],env).status,0);
  const ledger=JSON.parse(readFileSync(env.HINDSIGHT_CREDIT_LEDGER));assert.equal(ledger.capUSD,10);assert.equal(ledger.workspaceId,'synthetic-workspace');assert.equal(ledger.connectionId,hash([env.HINDSIGHT_BASE_URL,env.HINDSIGHT_BANK,hash(env.HINDSIGHT_API_KEY)]));assert.deepEqual(ledger.calls,[]);
  assert.notEqual(run('authorize-cloud.js',['--cap-usd','20','--acknowledge-paid-usage'],env).status,0);assert.equal(JSON.parse(readFileSync(env.HINDSIGHT_CREDIT_LEDGER)).capUSD,10);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
