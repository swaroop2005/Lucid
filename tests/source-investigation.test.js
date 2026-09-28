import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/db.js';
import {EvidenceStore} from '../server/evidence-store.js';
import {openSourceInvestigation} from '../server/source-investigation.js';
const report={id:'gitlab-runner-999999',url:'https://gitlab.com/gitlab-org/gitlab-runner/-/issues/999999',title:'Public issue for local regression fixture',body:'Kubernetes runner reports an error. Public source claims remain unverified.',createdAt:'2025-01-01',updatedAt:'2025-01-02',state:'closed',family:'Kubernetes execution',labels:['type::bug'],source:'Local test fixture'};
test('opening a source investigation is idempotent, anonymous and does not confirm or retain anything',()=>{
 const s=new Store(':memory:'),e=new EvidenceStore(':memory:');e.upsert(report);
 const first=s.update(state=>openSourceInvestigation(state,e.get(report.id),e.selectedReference(report.id)));
 assert.equal(first.reconstructed,true);assert.equal(first.executor,'Unknown');assert.equal(first.resolution,null);assert.equal(first.status,'Open');assert.equal(first.publicEvidence.length,1);
 s.update(state=>state.cases.find(c=>c.id===first.id).description='User-added context');
 const second=s.update(state=>openSourceInvestigation(state,e.get(report.id),e.selectedReference(report.id)));
 assert.equal(second.id,first.id);assert.equal(second.description,'User-added context');assert.equal(s.read().articles.length,0);assert.equal(s.read().outbox.length,0);
 assert.equal(s.read().companies.find(c=>c.id===first.companyId).kind,'public-source');e.close();s.close();
});
test('reserved source cannot be turned into a working case via the import path',()=>{
 const s=new Store(':memory:'),e=new EvidenceStore(':memory:');e.upsert(report);e.reserveSources([report.url]);
 assert.throws(()=>s.update(state=>openSourceInvestigation(state,e.get(report.id),e.selectedReference(report.id))),/reserved/);
 assert.equal(s.read().cases.length,9);e.close();s.close();
});
