import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {seedCorpus} from './corpus.js';
import { initialState } from './fixtures.js';
export class Store {
 constructor(path) {
  if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
  this.db=new DatabaseSync(path);
  this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);');
  this.db.prepare('INSERT OR IGNORE INTO workspace VALUES(1,?)').run(JSON.stringify(initialState()));
  this.update(s=>{if(!s.migrations?.includes('anonymous-public-users-v1')){for(const org of s.companies){if(/^Company [A-I]$/.test(org.name)&&s.cases.filter(c=>c.companyId===org.id).every(c=>c.reconstructed)){org.name='Anonymous public user '+org.name.slice(-1);org.note='Public source report. No company affiliation established.';}}s.migrations=[...(s.migrations||[]),'anonymous-public-users-v1'];}});
  this.update(s=>{if(!s.migrations?.includes('public-source-identities-v2')){for(const org of s.companies){if((/^org-[a-i]$/.test(org.id)&&/^Anonymous public/.test(org.name))||org.id==='research-replay'){org.kind='public-source';org.note='Public source reports. Company affiliation is not established.';}}s.migrations=[...(s.migrations||[]),'public-source-identities-v2'];}});
  this.update(s=>{if(!s.migrations?.includes('research-corpus-v2')){seedCorpus(s);s.migrations=[...(s.migrations||[]),'research-corpus-v2'];}});
  this.update(s=>{if(!s.migrations?.includes('historical-cases-v3')){const seed=initialState();for(const c of seed.cases.filter(c=>c.id.startsWith('CS-20'))){if(!s.cases.some(x=>x.id===c.id||x.sourceId===c.sourceId))s.cases.push(c);}for(const org of seed.companies){if(s.cases.some(c=>c.companyId===org.id)&&!s.companies.some(x=>x.id===org.id))s.companies.push(org);}s.migrations=[...(s.migrations||[]),'historical-cases-v3'];}});
 }
 read(){return JSON.parse(this.db.prepare('SELECT body FROM workspace WHERE id=1').get().body);}
 update(fn){this.db.exec('BEGIN IMMEDIATE');try{const state=this.read();const result=fn(state);this.db.prepare('UPDATE workspace SET body=? WHERE id=1').run(JSON.stringify(state));this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 close(){this.db.close();}
}
