import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifySupportData,installDocs} from '../scripts/support-data.js';
import {versionedReference} from '../server/versioned-docs.js';

test('public support data has consistent source identities, coverage and hashes',()=>{
 const bundle=verifySupportData();
 assert.equal(bundle.reports,8348);assert.equal(bundle.discussionNotes,58495);
 assert.equal(bundle.documentationPages,68);assert.equal(bundle.documentationVersions,10);
 for(const page of bundle.pages)assert.doesNotMatch(page.bytes.toString(),/-----BEGIN .*PRIVATE KEY-----/);
});
test('restored documentation works in version-aware retrieval and preserves conflicting local files',()=>{
 const bundle=verifySupportData(),dir=mkdtempSync(join(tmpdir(),'lucid-docs-'));
 try{
  assert.equal(installDocs(bundle,dir),68);assert.equal(installDocs(bundle,dir),68);
  const records=JSON.parse(readFileSync(join(dir,'versioned-docs.json'))),record=records.find(r=>r.status==='available'&&r.path==='/runner/executors/docker/');
  const ref=versionedReference({id:'fixture-ref',url:'https://docs.gitlab.com'+record.path,title:'Docker executor'}, {runnerVersion:record.version},records,file=>readFileSync(join(dir,'versioned-docs',file),'utf8'));
  assert.equal(ref.versionStatus,'exact-version');assert.ok(ref.evidenceText.length>50);
  const file=join(dir,'versioned-docs',bundle.pages[0].file);writeFileSync(file,'local customization');
  assert.throws(()=>installDocs(bundle,dir),/no files overwritten/);assert.equal(readFileSync(file,'utf8'),'local customization');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
