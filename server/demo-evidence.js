import {readFileSync,existsSync} from 'node:fs';
// This seed contains public evidence only. Operational cases, users, provider settings and memory are never touched.
export function seedDemoEvidence(evidence, snapshot){
 if(evidence.db.prepare('SELECT count(*) n FROM reports').get().n)return {seeded:false,reason:'Existing evidence preserved'};
 if(!snapshot&&!existsSync(new URL('../data/demo-evidence.json',import.meta.url)))return {seeded:false,reason:'Optional private evidence snapshot is not installed'};
 const data=snapshot||JSON.parse(readFileSync(new URL('../data/demo-evidence.json',import.meta.url),'utf8'));
 if(data.formatVersion!==1||!Array.isArray(data.records)||data.manifest?.reports!==data.records.length)throw new Error('Invalid public demo snapshot manifest');
 const noteTotal=data.records.reduce((n,r)=>n+(r.notes?.length||0),0);if(noteTotal!==data.manifest.notes)throw new Error('Public demo note counts do not reconcile');
 for(const row of data.records){if(row.job?.status!=='completed'||!row.report?.id||!/^https:\/\/gitlab\.com\/gitlab-org\/gitlab-runner\/-\/(?:issues|work_items)\/\d+$/.test(row.report.url)||row.notes.some(n=>n.truncated)||row.job.extraction?.humanReviewed!==false||row.job.extraction?.outcome?.confirmed!==false)throw new Error('Public starter must contain complete, unreviewed, source-linked threads');}
 const db=evidence.db;db.exec('BEGIN IMMEDIATE');try{
  if(db.prepare('SELECT count(*) n FROM reports').get().n){db.exec('ROLLBACK');return {seeded:false,reason:'Existing evidence preserved'};}
  for(const row of data.records){const r=row.report;
   db.prepare('INSERT INTO reports(id,url,title,body,author,created_at,updated_at,state,family,labels,source,review_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(r.id,r.url,r.title,r.body,'Public user',r.created_at,r.updated_at,r.state,r.family,r.labels,r.source,'indexed');
   db.prepare('INSERT INTO report_search(id,title,body,family) VALUES(?,?,?,?)').run(r.id,r.title,r.body,r.family);
   db.prepare('INSERT INTO enrichment_jobs(report_id,status,pages,updated_at,completed_at,extraction) VALUES(?,?,?,?,?,?)').run(r.id,'completed',row.job.pages,row.job.updated_at,row.job.completed_at,JSON.stringify(row.job.extraction));
   for(const n of row.notes){db.prepare('INSERT INTO evidence_notes(id,report_id,discussion_id,body,url,created_at,updated_at,system,truncated,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(n.id,r.id,n.discussion_id,n.body,n.url,n.created_at,n.updated_at,n.system,0,n.fetched_at);if(!n.system)db.prepare('INSERT INTO note_search(id,report_id,body) VALUES(?,?,?)').run(n.id,r.id,n.body);}
   for(const l of row.links||[]){db.prepare('INSERT OR IGNORE INTO evidence_links(url,kind,status,title,state,merged_at,description,fetched_at,error) VALUES(?,?,?,?,?,?,?,?,?)').run(l.url,l.kind,l.status,l.title,l.state,l.merged_at,l.description,l.fetched_at,l.error);db.prepare('INSERT OR IGNORE INTO evidence_report_links(report_id,url,source_url) VALUES(?,?,?)').run(r.id,l.url,l.source_url);}
   for(const p of row.receipts||[])db.prepare('INSERT INTO enrichment_pages VALUES(?,?,?,?,?,?)').run(r.id,p.request_cursor,p.next_cursor,p.returned_notes,p.ids_sha256,p.fetched_at);
  }
  db.exec('COMMIT');return {seeded:true,...data.manifest,source:'public-demo-snapshot',generatedAt:data.generatedAt};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
