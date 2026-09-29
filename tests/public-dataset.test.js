import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readDataset,fetchReport,fetchBatch} from '../scripts/fetch-dataset.js';
import {EvidenceStore} from '../server/evidence-store.js';

const rows=readDataset('data/public-dataset/reports.jsonl','data/public-dataset/manifest.json');
const response=(row,overrides={})=>({ok:true,status:200,json:async()=>({iid:row.issueIid,confidential:false,web_url:row.url,title:'Synthetic upload issue',description:'Contact synthetic@example.com; password=abcdefghi; example public report.',created_at:row.createdAt,updated_at:row.updatedAt,state:'opened',labels:['bug'],...overrides})});
test('published index matches count, aggregates and strict metadata schema',()=>{
 assert.equal(rows.length,8348);
 const meta=JSON.parse(readFileSync('data/public-dataset/manifest.json'));
 for(const [key,counts] of [['state',meta.states],['family',meta.families]]){
  const actual={};for(const row of rows)actual[row[key]]=(actual[row[key]]||0)+1;
  assert.deepEqual(actual,counts);
 }
 const preview=spawnSync(process.execPath,['scripts/fetch-dataset.js'],{encoding:'utf8'});
 assert.equal(preview.status,0);assert.match(preview.stdout,/zero network requests/);
});
test('reconstruction imports sanitized public text, skips existing and unavailable records, and populates local search',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lucid-dataset-')),store=new EvidenceStore(join(dir,'evidence.sqlite'));let calls=0;
 try{
  const batch=rows.slice(0,3),fetcher=async(url,opts)=>{calls++;assert.match(url,/^https:\/\/gitlab.com\/api\/v4\/projects\/gitlab-org%2Fgitlab-runner\/issues\/\d+$/);assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');return calls===2?{ok:false,status:404}:response(batch[0]);};
  const pre=await fetchReport(batch[2],{fetcher:async()=>response(batch[2])});store.upsert(pre.report);
  const got=await fetchBatch(batch,store,{fetcher,wait:async()=>{}});
  assert.deepEqual(got,{processed:3,imported:1,existing:1,unavailable:1,notPublic:0,nextOffset:3});assert.equal(calls,2);
  const saved=store.get(batch[0].id);assert.doesNotMatch(saved.body,/synthetic@example|abcdefghi/);assert.equal(saved.author,'Public user');
  assert.equal(store.search({q:'upload'}).total,2);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('private or identity-mismatched responses are never imported; rate limits stop without retry',async()=>{
 const row=rows[0];
 assert.equal((await fetchReport(row,{fetcher:async()=>response(row,{confidential:true})})).status,'not-public');
 await assert.rejects(()=>fetchReport(row,{fetcher:async()=>response(row,{iid:row.issueIid+1})}),/identity/);
 await assert.rejects(()=>fetchReport({...row,url:'https://example.com/private'},{fetcher:async()=>{throw Error('must not call');}}),/Invalid source/);
 let calls=0,writes=0;
 await assert.rejects(()=>fetchBatch(rows,{get:()=>null,upsert:()=>{writes++;}},{fetcher:async()=>{calls++;return {ok:false,status:429};},wait:async()=>{}}),/Resume from --offset 0/);
 assert.equal(calls,1);assert.equal(writes,0);
});
