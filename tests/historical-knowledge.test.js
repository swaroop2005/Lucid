import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/db.js';
import {EvidenceStore} from '../server/evidence-store.js';
import {readHistoricalSource,importHistoricalKnowledge,curationExclusions} from '../server/historical-knowledge.js';
import {approveKnowledge,reuseArticle,applicability} from '../server/domain.js';
import {MemoryProvider,resolveRecall} from '../server/providers.js';
import {buildMemoryPacket} from '../server/memory-evidence.js';
const report={id:'gitlab-runner-888888',url:'https://gitlab.com/gitlab-org/gitlab-runner/-/issues/888888',title:'Runner timeout',body:'Increasing the timeout stopped the restarts in our test.',author:'Public user',createdAt:'2024-01-02T00:00:00Z',updatedAt:'2024-02-02T00:00:00Z',state:'closed',family:'Runner lifecycle',labels:[],source:'gitlab'};
function setup(){const s=new Store(':memory:'),e=new EvidenceStore(':memory:');e.upsert(report);const item={key:'timeout-source',title:'Source-reported timeout workaround',symptom:'unclassified',executor:'Unknown',hosting:'Unknown',runnerVersion:'',serverVersion:'',chartVersion:'',fix:'The source reports increasing the timeout.',cause:'',verification:'A source participant reported fewer restarts; not independently reproduced.',limitations:'Historical report only; validate configuration and versions before reuse.',diagnostics:['Inspect liveness events and actual timeout values.'],failedAlternatives:[],sourceReports:[{reportId:report.id,sourceHash:readHistoricalSource(e.db,report.id).sourceHash,reviewDepth:'full-local-context'}],citations:[{id:'SRC-'+report.id,title:report.title,url:report.url,quote:report.body,sourceDate:report.createdAt,status:'Source-reported outcome; AI source review only'}]};return {s,e,item};}
test('historical import is atomic, idempotent, local and truthfully source reviewed',async()=>{const {s,e,item}=setup(),before=s.read();const first=s.update(state=>importHistoricalKnowledge(state,[item],e.db));const state=s.read();assert.equal(first.added,1);assert.deepEqual(state.cases,before.cases);assert.deepEqual(state.outbox,before.outbox);assert.equal(state.articles[0].curation.humanReviewed,false);assert.equal(state.articles[0].sync,'local-only');const snapshot=JSON.stringify(state);s.update(x=>importHistoricalKnowledge(x,[item],e.db));assert.equal(JSON.stringify(s.read()),snapshot);const memory=new MemoryProvider(s,{memoryMode:'offline'});assert.equal(resolveRecall(s.read(),await memory.recall('timeout'))[0].id,first.articleIds[0]);assert.throws(()=>s.update(x=>importHistoricalKnowledge(x,[{...item,fix:'Changed'}],e.db)),/immutable/);assert.equal(JSON.stringify(s.read()),snapshot);s.close();e.close();});
test('source drift, invented quotation and invalid dates reject before adding any articles',()=>{const {s,e,item}=setup();for(const invalid of [{...item,key:'drift',sourceReports:[{...item.sourceReports[0],sourceHash:'a'.repeat(64)}]},{...item,key:'quote',citations:[{...item.citations[0],quote:'It fixed every version.'}]},{...item,key:'date',citations:[{...item.citations[0],sourceDate:'2025-01-01'}]}]){const state=s.read();assert.throws(()=>importHistoricalKnowledge(state,[item,invalid],e.db));assert.equal(state.articles.length,0);assert.equal(state.memories.length,0);}s.close();e.close();});
test('quality heldouts, former test sources and cross-links remain excluded',()=>{const {s,e,item}=setup(),excluded=curationExclusions(s.read());for(const id of ['39193','39589','29099'])assert.ok(excluded.has('https://gitlab.com/gitlab-org/gitlab-runner/-/issues/'+id));e.upsert({...report,body:report.body+' See https://gitlab.com/gitlab-org/gitlab-runner/-/work_items/39589#note_1'});item.sourceReports[0].sourceHash=readHistoricalSource(e.db,report.id).sourceHash;assert.throws(()=>s.update(x=>importHistoricalKnowledge(x,[item],e.db)),/Heldout/);assert.equal(s.read().articles.length,0);s.close();e.close();});
test('source-reviewed publications stay immutable through human case reuse and cannot be revised',()=>{const {s,e,item}=setup();s.update(x=>importHistoricalKnowledge(x,[item],e.db));const article=s.read().articles[0],before=JSON.stringify(article);s.update(x=>reuseArticle(x,'CS-1042',{articleId:article.id,reviewed:true,evidence:'Separately verified this operational case.',engineer:'Reviewer'}));assert.equal(JSON.stringify(s.read().articles[0]),before);assert.throws(()=>s.update(x=>approveKnowledge(x,'CS-1042',{...item,reviewed:true,reviewer:'Reviewer',targetArticleId:article.id,expectedRevision:1})),/immutable/);s.close();e.close();});
test('explicit Hindsight packet preserves AI review status and source hashes without provider calls',()=>{const {s,e,item}=setup();s.update(x=>importHistoricalKnowledge(x,[item],e.db));const state=s.read(),packet=buildMemoryPacket(state.articles[0],state,{scope:'test-local-curation'}),body=JSON.parse(packet.content);assert.equal(body.reviewBasis.humanReviewed,false);assert.equal(body.reviewBasis.confirmed,false);assert.equal(body.reviewBasis.independentlyReproduced,false);assert.equal(body.sourceReviews[0].sourceHash,item.sourceReports[0].sourceHash);assert.equal(body.citations[0].quote,report.body);assert.equal(state.outbox.length,0);s.close();e.close();});

test('curated narrative symptoms require review without bypassing executor, versions or failed attempts',()=>{const {s,e,item}=setup();item.symptom='A narrative description of the original timeout';item.executor='Kubernetes';item.runnerVersion='17.3.0';s.update(x=>importHistoricalKnowledge(x,[item],e.db));const a=s.read().articles[0],c={...s.read().cases[0],executor:'Kubernetes',runnerVersion:'17.3.0',symptom:'runner-restarts'};assert.equal(applicability(c,a).status,'review');assert.match(applicability(c,a).reasons.join(' '),/symptom.*explicit review/);assert.equal(applicability({...c,executor:'Docker'},a).status,'incompatible');assert.equal(applicability({...c,runnerVersion:'18.0.0'},a).status,'incompatible');assert.equal(applicability({...c,attempts:[{articleId:a.id,result:'Failed'}]},a).status,'incompatible');s.close();e.close();});
test('shared merge request exclusion includes legacy aliases even without heldout text in MR',()=>{const {s,e,item}=setup();e.upsert({...report,id:'gitlab-runner-39193',url:'https://gitlab.com/gitlab-org/gitlab-runner/-/work_items/39193'});const current='https://gitlab.com/gitlab-org/gitlab-runner/-/merge_requests/99999',legacy='https://gitlab.com/gitlab-org/gitlab-ci-multi-runner/merge_requests/99999';e.db.prepare('INSERT INTO evidence_links(url,kind,status,title,description) VALUES(?,?,?,?,?)').run(legacy,'merge-request','fetched','Historical fix','A fix without issue references.');e.db.prepare('INSERT INTO evidence_report_links VALUES(?,?,?)').run('gitlab-runner-39193',current,report.url);e.db.prepare('INSERT INTO evidence_report_links VALUES(?,?,?)').run(report.id,legacy,report.url);item.sourceReports[0].sourceHash=readHistoricalSource(e.db,report.id).sourceHash;assert.throws(()=>s.update(x=>importHistoricalKnowledge(x,[item],e.db)),/Heldout/);assert.equal(s.read().articles.length,0);s.close();e.close();});

import {publicSnapshot} from '../server/domain.js';
function relatedSource(e,item,number='888889',body='The same diagnostic check helped in this separate report.'){
 const related={...report,id:'gitlab-runner-'+number,url:'https://gitlab.com/gitlab-org/gitlab-runner/-/issues/'+number,body};e.upsert(related);
 return {articleKey:item.key,reportId:related.id,sourceHash:readHistoricalSource(e.db,related.id).sourceHash,reviewDepth:'full-local-context',rationale:'The source reports a related check; its exact cause remains uncertain.'};
}
test('separate reviewed associations link both directions without changing publication, Cloud identity or local memory',()=>{
 const {s,e,item}=setup();s.update(x=>importHistoricalKnowledge(x,[item],e.db));
 s.update(x=>{x.articles[0].cloudRetention={status:'succeeded',docId:'frozen-cloud-document',revision:1};});
 const before=s.read(),packetBefore=buildMemoryPacket(before.articles[0],before,{scope:'association-test'}),association=relatedSource(e,item);
 const imported=s.update(x=>importHistoricalKnowledge(x,{associations:[association]},e.db)),after=s.read();
 assert.equal(imported.associationsAdded,1);assert.equal(imported.added,0);assert.deepEqual(after.articles,before.articles);assert.deepEqual(after.memories,before.memories);assert.deepEqual(after.outbox,before.outbox);assert.deepEqual(after.cases,before.cases);
 assert.deepEqual(buildMemoryPacket(after.articles[0],after,{scope:'association-test'}),packetBefore);
 const link=after.historicalKnowledgeAssociations[0];assert.equal(link.humanReviewed,false);assert.equal(link.confirmed,false);assert.equal(link.independentlyReproduced,false);assert.equal(link.articleFingerprint,before.articles[0].fingerprint);
 const snapshot=publicSnapshot(after,{});assert.equal(snapshot.historicalKnowledgeAssociations,undefined);assert.deepEqual(snapshot.articles[0].historicalReportIds,[report.id]);assert.equal(snapshot.articles[0].associatedHistoricalReports[0].reportId,association.reportId);
 const frozen=JSON.stringify(after);s.update(x=>importHistoricalKnowledge(x,{articles:[item],associations:[association]},e.db));assert.equal(JSON.stringify(s.read()),frozen);
 assert.throws(()=>s.update(x=>importHistoricalKnowledge(x,{associations:[{...association,rationale:'Changed review'}]},e.db)),/immutable/);assert.equal(JSON.stringify(s.read()),frozen);
 // Snapshot derivation cannot mutate persistence or expose links for a different revision.
 snapshot.articles[0].associatedHistoricalReports.push({reportId:'not-persisted'});assert.equal(s.read().historicalKnowledgeAssociations.length,1);
 const stale=structuredClone(after);stale.articles[0].revision++;assert.deepEqual(publicSnapshot(stale,{}).articles[0].associatedHistoricalReports,[]);s.close();e.close();
});
test('new articles and association envelopes are atomic and validate source hash, full review and target',()=>{
 const {s,e,item}=setup(),association=relatedSource(e,item);
 for(const invalid of [{...association,sourceHash:'0'.repeat(64)},{...association,reviewDepth:'title-only'},{...association,articleKey:'missing-key'}]){
  const state=s.read(),before=JSON.stringify(state);assert.throws(()=>importHistoricalKnowledge(state,{articles:[item],associations:[invalid]},e.db));assert.equal(JSON.stringify(state),before);
 }
 const result=s.update(x=>importHistoricalKnowledge(x,{articles:[item],associations:[association]},e.db));assert.equal(result.added,1);assert.equal(result.associationsAdded,1);assert.equal(s.read().historicalKnowledgeAssociations[0].articleId,result.articleIds[0]);
 const state=s.read(),before=JSON.stringify(state);assert.throws(()=>importHistoricalKnowledge(state,{associations:[association,association]},e.db),/Duplicate/);assert.equal(JSON.stringify(state),before);s.close();e.close();
});
test('associations enforce heldout, former test, cross-link and shared fixing-MR exclusions',()=>{
 const {s,e,item}=setup();s.update(x=>importHistoricalKnowledge(x,[item],e.db));
 const denied=[relatedSource(e,item,'39193'),relatedSource(e,item,'39589'),relatedSource(e,item,'29099'),relatedSource(e,item,'888890','See https://gitlab.com/gitlab-org/gitlab-runner/-/work_items/39193#note_1')];
 const mr='https://gitlab.com/gitlab-org/gitlab-runner/-/merge_requests/77777',shared=relatedSource(e,item,'888891');
 e.db.prepare('INSERT INTO evidence_links(url,kind,status,title,description) VALUES(?,?,?,?,?)').run(mr,'merge-request','fetched','Shared fixing MR','No explicit heldout issue text.');
 for(const id of ['gitlab-runner-39193',shared.reportId])e.db.prepare('INSERT INTO evidence_report_links VALUES(?,?,?)').run(id,mr,report.url);
 shared.sourceHash=readHistoricalSource(e.db,shared.reportId).sourceHash;denied.push(shared);
 // Refresh heldout hash after adding its MR, so exclusion rather than drift is checked.
 denied[0].sourceHash=readHistoricalSource(e.db,denied[0].reportId).sourceHash;
 for(const association of denied){const state=s.read(),before=JSON.stringify(state);assert.throws(()=>importHistoricalKnowledge(state,{associations:[association]},e.db),/Heldout/);assert.equal(JSON.stringify(state),before);}
 s.close();e.close();
});

test('new frozen evaluation episodes and fixing changes cannot enter historical knowledge',()=>{
 const {s,e,item}=setup(),excluded=curationExclusions(s.read(),e.db);
 for(const suffix of ['issues/39427','issues/38370','issues/38901','issues/38804','issues/38721','issues/39281','issues/38299','merge_requests/6713','merge_requests/5230'])assert.ok(excluded.has('https://gitlab.com/gitlab-org/gitlab-runner/-/'+suffix));
 assert.ok(excluded.has('https://gitlab.com/gitlab-com/gl-infra/production-engineering/-/issues/28163'));
 const heldout={...report,id:'gitlab-runner-39427',url:'https://gitlab.com/gitlab-org/gitlab-runner/-/issues/39427'};e.upsert(heldout);
 const candidate={...item,sourceReports:[{reportId:heldout.id,sourceHash:readHistoricalSource(e.db,heldout.id).sourceHash,reviewDepth:'full-local-context'}],citations:[{...item.citations[0],url:heldout.url}]};
 assert.throws(()=>s.update(state=>importHistoricalKnowledge(state,[candidate],e.db)),/Heldout/);assert.equal(s.read().articles.length,0);s.close();e.close();
});
