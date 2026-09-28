// Run: node scripts/enrich-public-reports.js [--limit=N] [--retry-failed] [--reextract]
// Public data only. No credentials, AI/model calls, memory writes, or operational case changes.
import {resolve,dirname} from 'node:path';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {EvidenceStore} from '../server/evidence-store.js';
import {PublicGitlabClient,enrichReport,collectLinkedEvidence} from '../server/enrichment-collector.js';
import {seedEnrichment,enrichmentStats,reextract,finishEnrichment,normalizeLinkKinds} from '../server/enrichment-store.js';
const dbPath=resolve(process.env.EVIDENCE_FILE||'.data/evidence.sqlite'),lockPath=dbPath+'.enrichment.lock';
let ownLock=false,store,runId;let stopped=false,processed=0,failures=0;
const args=process.argv.slice(2),limitArg=args.find(x=>x.startsWith('--limit='));const limit=limitArg?Math.max(0,Number(limitArg.split('=')[1])||0):Infinity;
const concurrency=Math.min(6,Math.max(1,Number(process.env.ENRICH_CONCURRENCY)||4));
function alive(pid){try{process.kill(Number(pid),0);return true;}catch{return false;}}
try{
 mkdirSync(dirname(dbPath),{recursive:true});
 try{writeFileSync(lockPath,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});ownLock=true;}catch(error){if(error.code!=='EEXIST')throw error;const previous=JSON.parse(readFileSync(lockPath,'utf8'));if(alive(previous.pid))throw new Error(`Enrichment collector already active (pid ${previous.pid})`,{cause:error});unlinkSync(lockPath);writeFileSync(lockPath,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});ownLock=true;}
 store=new EvidenceStore(dbPath);const db=store.db;seedEnrichment(db);
 db.prepare("UPDATE enrichment_runs SET status='interrupted',finished_at=? WHERE status='running'").run(new Date().toISOString());
 db.prepare("UPDATE enrichment_jobs SET status='pending',error='Previous collector interrupted; resuming saved cursor' WHERE status='collecting'").run();
 if(args.includes('--repair-truncated')){db.prepare("UPDATE enrichment_jobs SET status='pending',cursor=NULL,completed_at=NULL WHERE report_id IN (SELECT report_id FROM evidence_notes WHERE truncated=1)").run();}
 if(args.includes('--retry-failed'))db.prepare("UPDATE enrichment_jobs SET status='pending',retry_at=NULL WHERE status='failed'").run();
 const {seedCorpus}=await import('../server/corpus.js');const reservedState={corpus:[]};seedCorpus(reservedState);const reserved=reservedState.corpus.filter(r=>r.partition==='holdout').map(r=>r.source.url);
 if(args.includes('--reextract'))reextract(db,reserved);
 runId=Number(db.prepare("INSERT INTO enrichment_runs(started_at,status,pid,heartbeat_at) VALUES(?,'running',?,?)").run(new Date().toISOString(),process.pid,new Date().toISOString()).lastInsertRowid);
 const beat=()=>db.prepare('UPDATE enrichment_runs SET heartbeat_at=?,processed=? WHERE id=?').run(new Date().toISOString(),processed,runId);
 const client=new PublicGitlabClient({minInterval:Math.max(200,Number(process.env.ENRICH_INTERVAL_MS)||250),onRequest:beat});
 process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
 console.log(JSON.stringify({event:'started',runId,pid:process.pid,concurrency,limit:Number.isFinite(limit)?limit:'all',stats:enrichmentStats(db)}));
 if(args.includes('--retry-links')||args.includes('--complete-links')){
  normalizeLinkKinds(db);
  const linkReports=db.prepare(`SELECT DISTINCT r.* FROM reports r JOIN evidence_report_links a ON a.report_id=r.id JOIN evidence_links l ON l.url=a.url WHERE l.status ${args.includes('--complete-links')?"IN ('failed','linked-not-fetched')":"= 'failed'"} AND l.kind='merge-request'`).all();
  let linkProcessed=0;async function linkWorker(){while(linkReports.length&&!stopped){const report=linkReports.shift();await collectLinkedEvidence(db,report,client,{shouldStop:()=>stopped,limit:10000,retryOnly:!args.includes('--complete-links')});const j=db.prepare('SELECT status FROM enrichment_jobs WHERE report_id=?').get(report.id);if(j?.status==='completed')finishEnrichment(db,report,reserved);linkProcessed++;if(linkProcessed%25===0)console.log(JSON.stringify({event:'linked-progress',processedReports:linkProcessed,remainingReports:linkReports.length,stats:enrichmentStats(db)}));}}const linkResults=await Promise.allSettled(Array.from({length:concurrency},async()=>{try{await linkWorker();}catch(error){stopped=true;throw error;}}));const linkFailure=linkResults.find(result=>result.status==='rejected');if(linkFailure)throw linkFailure.reason;
 }
 let claimed=0;
 async function worker(){while(!stopped&&claimed<limit){
  const report=db.prepare(`SELECT r.* FROM reports r JOIN enrichment_jobs j ON j.report_id=r.id WHERE j.status='pending' ORDER BY CASE WHEN r.state='closed' AND (r.labels LIKE '%type::bug%' OR r.labels LIKE '%support request%') THEN 0 WHEN r.state='closed' THEN 1 ELSE 2 END, r.updated_at DESC LIMIT 1`).get();if(!report)return;
  claimed++; // enrichReport claims synchronously before its first network await.
  const result=await enrichReport(db,report,client,{reservedUrls:reserved,shouldStop:()=>stopped});processed++;beat();if(result.status==='failed')failures++;else failures=0;
  if(failures>=12){stopped=true;console.log(JSON.stringify({event:'circuit-breaker',reason:'12 consecutive issue failures; inspect logged source or collector errors, then resume with --retry-failed'}));}
  if(processed%25===0||result.status!=='completed'||processed<=3)console.log(JSON.stringify({event:'progress',processed,reportId:report.id,result,stats:enrichmentStats(db)}));
 }}
 await Promise.all(Array.from({length:concurrency},worker));
 if(args.includes('--complete-links')&&!stopped)reextract(db,reserved,{force:true});
 const stats=enrichmentStats(db);const status=stopped?'interrupted':(stats.pending||(args.includes('--complete-links')&&stats.linkedPending))?'partial':(stats.failed||stats.linkedFailed)?'completed-with-failures':'completed';
 db.prepare('UPDATE enrichment_runs SET finished_at=?,status=?,processed=?,heartbeat_at=? WHERE id=?').run(new Date().toISOString(),status,processed,new Date().toISOString(),runId);
 const final={event:'finished',runId,status,stats:enrichmentStats(db)};mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/enrichment-progress.json',JSON.stringify(final,null,2)+'\n');console.log(JSON.stringify(final));if(stopped||stats.failed||stats.linkedFailed)process.exitCode=1;
}catch(error){if(store&&runId)store.db.prepare("UPDATE enrichment_runs SET finished_at=?,status='failed',error=? WHERE id=?").run(new Date().toISOString(),String(error.message).slice(0,500),runId);console.error(JSON.stringify({event:'failed',error:error.message}));process.exitCode=1;}finally{store?.close();if(ownLock)unlinkSync(lockPath);}
