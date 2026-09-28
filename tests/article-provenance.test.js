import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/db.js';
import {approveKnowledge,requireCase,reuseArticle} from '../server/domain.js';
import {MemoryProvider} from '../server/providers.js';

const approval={title:'Reviewed DNS workaround',fix:'Use the verified resolver configuration.',cause:'',verification:'A fresh job resolved the hostname and completed.',limitations:'Only the tested environment; check version and executor.',reviewer:'Local reviewer',reviewed:true};
test('new cases preserve selected public citations through approved knowledge and Hindsight payload',async()=>{
 const store=new Store(':memory:');let payload;
 const article=store.update(s=>{
  const c=requireCase(s,'CS-1042');c.sourceId=null;c.resolution={fix:approval.fix};
  c.publicEvidence=[{id:'SRC-123',title:'Public resolver investigation',url:'https://gitlab.com/gitlab-org/gitlab-runner/-/issues/123#note_456',summary:'Reporter says the adjusted resolver worked.',status:'Source-reported candidate, not human reviewed'}];
  return approveKnowledge(s,c.id,approval);
 });
 assert.deepEqual(article.sourceIds,['SRC-123']);
 assert.equal(article.citations[0].url.endsWith('#note_456'),true);
 const provider=new MemoryProvider(store,{memoryMode:'hindsight',allowExternal:true,hindsightUrl:'https://example.invalid',bank:'test'}, {retain:async(_bank,content)=>{payload=content;return {};}});
 await provider.retain(article);
 assert.match(payload,/note_456/);assert.match(payload,/not human reviewed/);
 store.close();
});
test('same knowledge reused by another case keeps case provenance without another retention',()=>{
 const store=new Store(':memory:');
 const a=store.update(s=>{requireCase(s,'CS-1042').resolution={fix:approval.fix};return approveKnowledge(s,'CS-1042',approval);});
 store.update(s=>{requireCase(s,'CS-1043').resolution={fix:approval.fix};return approveKnowledge(s,'CS-1043',{...approval,verification:'Second independently checked outcome.'});});
 assert.deepEqual(store.read().articles[0].sourceCases,['CS-1042','CS-1043']);
 assert.equal(store.read().outbox.length,1);
 store.update(s=>reuseArticle(s,'CS-1043',{articleId:a.id,reviewed:true,evidence:'Verified again',engineer:'Reviewer'}));
 assert.equal(store.read().articles[0].sourceCases.length,2);
 store.close();
});
test('unsafe citation URLs cannot enter generalized shared knowledge',()=>{
 const store=new Store(':memory:');
 const a=store.update(s=>{const c=requireCase(s,'CS-1042');c.sourceId=null;c.resolution={fix:'verified'};c.publicEvidence=[{id:'BAD',url:'javascript:alert(1)',title:'Unsafe'},{id:'SECRET',url:'https://user:secret@example.com',title:'Credential URL'}];return approveKnowledge(s,c.id,approval);});
 assert.deepEqual(a.citations,[]);store.close();
});
