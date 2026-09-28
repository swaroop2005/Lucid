import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {references} from '../server/reference-library.js';
import {versionedReference} from '../server/versioned-docs.js';
// Synthetic parser fixture, not copied official guidance or a bundled verified document.
const ref=references.find(r=>r.id==='REF-02'),anchor=new URL(ref.url).hash.slice(1);
const content=`# Synthetic document\n## ${anchor.replaceAll('-',' ')}\nSynthetic historical parser evidence.\n`;
const records=[{version:'17.3.1',path:new URL(ref.url).pathname,status:'available',sourceUrl:'https://gitlab.com/gitlab-org/gitlab-runner/-/raw/v17.3.1/docs/example.md',file:'synthetic.md',sha256:createHash('sha256').update(content).digest('hex'),fetchedAt:'2025-01-01'}];
const lookup=(r=ref,context={runnerVersion:'17.3.1'},rows=records)=>versionedReference(r,context,rows,()=>content);
test('exact version and intact cached text resolve the requested section',()=>{const r=lookup();assert.equal(r.versionStatus,'exact-version');assert.equal(r.versionEvidence.version,'17.3.1');assert.equal(r.currentUrl,ref.url);assert.match(r.summary,/Synthetic/);});
test('unknown or unavailable versions cannot inherit a match',()=>{assert.equal(lookup(ref,{}).versionStatus,'version-unknown');assert.equal(lookup(ref,{runnerVersion:'999.0.0'}).versionStatus,'version-unavailable');});
test('missing historical section never relabels current guidance',()=>{const r=lookup({...ref,url:ref.url.split('#')[0]+'#missing-heading'});assert.equal(r.versionStatus,'section-unavailable');assert.equal(r.summary,ref.summary);});
test('server documentation is not selected using a Runner version',()=>{assert.equal(lookup(references.find(r=>r.id==='REF-11')).versionStatus,'current-reference');});
test('modified cached content fails the hash check',()=>{const r=lookup(ref,{runnerVersion:'17.3.1'},records.map(r=>({...r,sha256:'wrong'})));assert.equal(r.versionStatus,'integrity-failed');assert.equal(r.versionEvidence,undefined);});
