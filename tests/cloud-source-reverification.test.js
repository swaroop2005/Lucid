import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudSourceReverification} from '../server/cloud-source-reverification.js';
import {buildMemoryPacket} from '../server/memory-evidence.js';
import {MemoryProvider} from '../server/providers.js';
import {verifiedArticleScope} from '../server/hindsight-scope.js';
import {officialDocumentFixture} from './fixtures/official-document.js';
import {prepareOfficialDocumentRetention,verifiedOfficialDocumentScope} from '../server/hindsight-documents.js';
function fixture(){
 const source=officialDocumentFixture().document;delete source.cloudScope;delete source.cloudRetention;let state={workspaceId:'recover-proof',cases:[],companies:[],articles:[{id:'KA-0001',revision:1,fingerprint:'a'.repeat(64),title:'Reviewed outcome',fix:'An observed earlier correction',cause:'Unknown',verification:'Source-reported recovery',limitations:'Only the original episode',executor:'Docker',hosting:'Self-managed',updatedAt:'2026-09-29T00:00:00Z',sourceCases:[],citations:[]}],officialDocuments:[source]};
 const store={read:()=>structuredClone(state),update:fn=>{const next=structuredClone(state),out=fn(next);state=next;return out;}},docs=new Map(),calls=[],control={connection:'new-connection',hook:null};const provider=new MemoryProvider(store,{memoryMode:'hindsight',allowExternal:true,workspaceScope:'lucid-workspace-recover-proof',bank:'fake-bank',hindsightUrl:'https://example.invalid'},{getDocument:async(_bank,id)=>{calls.push(id);await control.hook?.(id);return structuredClone(docs.get(id)||null);}});
 for(const source of [...state.articles,...state.officialDocuments]){const p=source.kind==='official-document'?prepareOfficialDocumentRetention(source,{scope:provider.scope()}):provider.prepareRetention(source);docs.set(p.docId,{id:p.docId,bank_id:'fake-bank',original_text:p.packet.content,tags:p.packet.tags,document_metadata:p.packet.metadata,memory_unit_count:2});}
 const service=()=>new CloudSourceReverification(store,()=>provider,{connectionId:()=>control.connection,authorize:async request=>{assert.equal(request.kind,'workspace-source-read');return {};}});return {store,docs,calls,control,provider,service};
}
test('fresh originals independently restore KA and DOC eligibility on a new credential connection',async()=>{
 const x=fixture(),before=x.store.read(),ids=[before.articles[0].id,before.officialDocuments[0].id],result=await x.service().verify(ids);assert.equal(result.verified,2);assert.equal(x.calls.length,2);const state=x.store.read();assert.equal(verifiedArticleScope(state.articles[0],{connectionId:'new-connection',scope:x.provider.scope()}),true);assert.equal(verifiedOfficialDocumentScope(state.officialDocuments[0],{connectionId:'new-connection',scope:x.provider.scope()}),true);assert.equal(state.articles[0].fix,before.articles[0].fix);assert.equal(state.officialDocuments[0].sectionText,before.officialDocuments[0].sectionText);assert.equal(state.officialDocuments[0].sync,undefined);
});
test('changed content, tags, source metadata or empty facts invalidate cached proofs without retention',async()=>{
 for(const mutate of [d=>d.original_text+='changed',d=>d.tags.push('foreign'),d=>d.memory_unit_count=0,d=>d.document_metadata.article_id='KA-9999',d=>d.bank_id='foreign']){const x=fixture();await x.service().verify(['KA-0001']);const d=[...x.docs.values()].find(d=>d.document_metadata.article_id);mutate(d);assert.equal((await x.service().verify(['KA-0001'])).verified,0);assert.equal(x.store.read().articles[0].cloudScope.verified,false);assert.equal(x.store.read().articles[0].cloudRetention.status,'unverified');}
});
test('missing source, excessive scope and before/after connection or body drift fail closed',async()=>{
 const x=fixture();await assert.rejects(x.service().verify(['KA-0001','KA-0001']),/distinct/);await assert.rejects(x.service().verify(['KA-9999']),/source or provider/);assert.equal(x.calls.length,0);x.control.hook=async()=>{x.control.connection='changed';};await assert.rejects(x.service().verify(['KA-0001']),/changed/);assert.equal(x.store.read().articles[0].cloudScope,undefined);
 const y=fixture();y.control.hook=async()=>y.store.update(s=>s.articles[0].fix='Unreviewed edit');await assert.rejects(y.service().verify(['KA-0001']),/changed/);assert.equal(y.store.read().articles[0].cloudScope,undefined);
});

function legacyFixture(){
 const x=fixture(),state=x.store.read(),source=state.articles[0],modern=x.provider.prepareRetention(source),packet=buildMemoryPacket(source,state,{scope:x.provider.scope()});
 const docId=`${x.provider.scope()}-${source.id}-r${source.revision}-${source.fingerprint.slice(0,12)}-p${packet.metadata.packet_hash.slice(0,12)}`;
 assert.notEqual(docId,modern.docId);x.docs.delete(modern.docId);x.docs.set(docId,{id:docId,bank_id:'fake-bank',original_text:packet.content,tags:modern.packet.tags,document_metadata:packet.metadata,memory_unit_count:2});
 x.control.hook=async id=>{if(id===modern.docId)throw Object.assign(new Error('Not found'),{status:404});};return {...x,modern,packet,docId};
}
test('only a modern 404 permits a deterministic legacy packet read with current exact revision tags',async()=>{
 const x=legacyFixture(),result=await x.service().verify(['KA-0001']);assert.equal(result.verified,1);assert.deepEqual(x.calls,[x.modern.docId,x.docId]);assert.equal(result.records[0].packetPolicyVersion,1);assert.equal(result.records[0].scopePolicyVersion,2);
 const article=x.store.read().articles[0];assert.equal(article.cloudRetention.docId,x.docId);assert.equal(article.cloudRetention.packetHash,x.packet.metadata.packet_hash);assert.equal(verifiedArticleScope(article,{connectionId:'new-connection',scope:x.provider.scope()}),true);
});
test('legacy fallback never accepts broad tags, altered originals, changed metadata, or zero facts',async()=>{
 for(const mutate of [d=>d.tags=d.tags.slice(0,3),d=>d.original_text+='changed',d=>d.document_metadata.packet_hash='bad',d=>d.memory_unit_count=0]){const x=legacyFixture();mutate(x.docs.get(x.docId));assert.equal((await x.service().verify(['KA-0001'])).verified,0);assert.equal(x.calls.length,2);assert.equal(x.store.read().articles[0].cloudScope,undefined);}
});
test('modern mismatch, non-404 errors, and official documents never invoke legacy fallback',async()=>{
 const mismatch=fixture();[...mismatch.docs.values()].find(d=>d.document_metadata.article_id).original_text+='bad';assert.equal((await mismatch.service().verify(['KA-0001'])).verified,0);assert.equal(mismatch.calls.length,1);
 const absent=fixture();absent.docs.clear();assert.equal((await absent.service().verify(['KA-0001'])).verified,0);assert.equal(absent.calls.length,2);
 const failed=legacyFixture();failed.control.hook=async()=>{throw Object.assign(new Error('Unavailable'),{status:503});};await assert.rejects(failed.service().verify(['KA-0001']),/could not be verified/);assert.equal(failed.calls.length,1);
 const official=fixture(),id=official.store.read().officialDocuments[0].id;official.control.hook=async()=>{throw Object.assign(new Error('Not found'),{status:404});};assert.equal((await official.service().verify([id])).verified,0);assert.equal(official.calls.length,1);
});

test('a bookkeeping 404 after a successful modern read is not a provider-document 404',async()=>{
 const x=fixture(),service=new CloudSourceReverification(x.store,()=>x.provider,{connectionId:()=>x.control.connection,authorize:async()=>({complete:async()=>{throw Object.assign(new Error('Bookkeeping missing'),{status:404});}})});
 await assert.rejects(service.verify(['KA-0001']),/accounting could not be completed/);assert.equal(x.calls.length,1);assert.equal(x.store.read().articles[0].cloudScope,undefined);
});

test('SDK null maps its HTTP404 and verifies the same exact legacy document',async()=>{const x=legacyFixture();x.control.hook=null;assert.equal((await x.service().verify(['KA-0001'])).verified,1);assert.deepEqual(x.calls,[x.modern.docId,x.docId]);});
