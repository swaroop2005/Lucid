import test from 'node:test';import assert from 'node:assert/strict';
import {referenceSearch,rankDocuments,references,referenceExclusion} from '../server/reference-library.js';
test('free-form report retrieves source-backed TLS guidance without fixture IDs',()=>{const r=referenceSearch('New worker connection fails x509 unknown authority certificate','Docker');assert.equal(r[0].id,'REF-08');assert.match(r[0].url,/docs.gitlab.com/);});
test('unrelated report does not manufacture reference evidence',()=>{assert.deepEqual(referenceSearch('Payroll reimbursement approval'),[]);});
test('known executor mismatch stays visible in reference result',()=>{const r=referenceSearch('pod scheduling pending','Shell');assert.match(r[0].applicability,/Different executor/);});
test('lexical ranking uses document content rather than IDs',()=>{const docs=[{id:'anything',text:'certificate trust authority'},{id:'other',text:'cache ownership'}];assert.equal(rankDocuments('trust certificate',docs,d=>d.text)[0].id,'anything');assert.equal(new Set(references.map(r=>r.id)).size,references.length);});

test('ordinary words in the live-pilot report do not manufacture technical reference matches',()=>{assert.deepEqual(referenceSearch('Intermittent runner restarts are back Another team is seeing unexpected runner-pod restarts. Is there relevant experience from an earlier case? Runner health','Kubernetes'),[]);});

test('HTTP413 rejects missing-file guidance even next to words, while explicit missing-file evidence remains eligible',()=>{const ref=references.find(r=>r.id==='REF-06');assert.match(referenceExclusion({title:'SaaS artifact413',description:'Upload receives413',executor:'Shell'},ref),/does not explain/);assert.equal(referenceExclusion({description:'Build4137 reports no matching files',executor:'Shell'},ref),null);});
