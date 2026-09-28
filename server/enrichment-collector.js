import {setTimeout as sleep} from 'node:timers/promises';
import {cleanPublicText,canonicalPublicUrl} from './evidence-text.js';
import {saveNotePage,finishEnrichment,rememberSourceLinks} from './enrichment-store.js';
export const NOTES_QUERY=`query LucidPublicDiscussion($iid:String!,$after:String){project(fullPath:"gitlab-org/gitlab-runner"){issue(iid:$iid){id webUrl state notes(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{id body system createdAt updatedAt url discussion{id}}}}}}`;
export class PublicSourceError extends Error{constructor(message,{status=0,retryable=false,retryAfter=0}={}){super(message);this.status=status;this.retryable=retryable;this.retryAfter=retryAfter;}}
export class PublicGitlabClient{
 constructor({fetchFn=fetch,pause=sleep,minInterval=250,maxRetries=3,now=Date.now,onRequest=()=>{}}={}){this.fetchFn=fetchFn;this.pause=pause;this.minInterval=minInterval;this.maxRetries=maxRetries;this.now=now;this.nextAt=0;this.onRequest=onRequest;}
 async request(url,options={}){for(let attempt=0;attempt<=this.maxRetries;attempt++){
  const delay=Math.max(0,this.nextAt-this.now());this.nextAt=this.now()+delay+this.minInterval;if(delay)await this.pause(delay);
  try{this.onRequest();const response=await this.fetchFn(url,{...options,headers:{'User-Agent':'Lucid-public-research/2.0',...options.headers},signal:AbortSignal.timeout(30000),redirect:'error'});
   const remaining=Number(response.headers.get('ratelimit-remaining')),reset=Number(response.headers.get('ratelimit-reset'));if(response.headers.has('ratelimit-remaining')&&remaining<=20&&reset*1000>this.now())this.nextAt=Math.max(this.nextAt,reset*1000);
   if(!response.ok){const raw=response.headers.get('retry-after');const retryAfter=raw?Math.max(0,Number.isFinite(Number(raw))?Number(raw)*1000:Date.parse(raw)-this.now()):0;throw new PublicSourceError(`Public GitLab HTTP ${response.status}`,{status:response.status,retryable:response.status===429||response.status>=500,retryAfter});}
   const json=await response.json();if(json.errors?.length)throw new PublicSourceError('Public GraphQL rejected query: '+String(json.errors[0].message).slice(0,220),{retryable:/rate|temporar|timeout/i.test(json.errors[0].message)});return json;
  }catch(error){const e=error instanceof PublicSourceError?error:new PublicSourceError(`Public source network/response error: ${error.message}`,{retryable:true});if(!e.retryable||attempt===this.maxRetries)throw e;const delay=Math.max(e.retryAfter,Math.min(60000,1000*2**attempt));this.nextAt=Math.max(this.nextAt,this.now()+delay);await this.pause(delay);}
 }}
 async notes(iid,after=null){const data=await this.request('https://gitlab.com/api/graphql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:NOTES_QUERY,variables:{iid:String(iid),after}})});const issue=data.data?.project?.issue;if(issue===null||data.data?.project===null)throw new PublicSourceError('Public issue absent, deleted, moved, or no longer accessible',{status:404});if(!issue?.notes?.pageInfo||!Array.isArray(issue.notes.nodes))throw new PublicSourceError('Incomplete GraphQL notes response',{retryable:true});return issue;}
 async mergeRequest(url){const u=new URL(canonicalPublicUrl(url));const m=u.pathname.match(/^\/(gitlab-org\/(?:gitlab-runner|gitlab))\/-\/merge_requests\/(\d+)$/);if(u.hostname!=='gitlab.com'||!m)return null;return this.request(`https://gitlab.com/api/v4/projects/${encodeURIComponent(m[1])}/merge_requests/${m[2]}`);}
}
export async function collectLinkedEvidence(db,report,client,{shouldStop=()=>false,limit=3,retryOnly=false}={}){
 // Reconstruct associations from saved notes as well: recovery from older collectors is safe.
 rememberSourceLinks(db,report.id,report.body,report.url);
 for(const note of db.prepare('SELECT body,url FROM evidence_notes WHERE report_id=?').all(report.id))rememberSourceLinks(db,report.id,note.body,note.url);
 // Cache promises per canonical change, including across workers. Raw citation URLs stay intact.
 if(!client.linkCache){client.linkCache=new Map();for(const l of db.prepare("SELECT * FROM evidence_links WHERE status='fetched' AND kind='merge-request'").all())client.linkCache.set(canonicalPublicUrl(l.url),Promise.resolve({title:l.title,state:l.state,merged_at:l.merged_at,description:l.description}));}
 const candidates=db.prepare(`SELECT DISTINCT l.url FROM evidence_report_links r JOIN evidence_links l ON l.url=r.url WHERE r.report_id=? AND l.kind='merge-request' AND l.status ${retryOnly?"= 'failed'":"IN ('linked-not-fetched','failed')"} LIMIT ?`).all(report.id,limit);
 for(const {url} of candidates){if(shouldStop())throw new PublicSourceError('Interrupted; notes complete, linked evidence pending',{retryable:true});try{const key=canonicalPublicUrl(url);if(!client.linkCache.has(key))client.linkCache.set(key,Promise.resolve().then(()=>client.mergeRequest(key)).catch(error=>{client.linkCache.delete(key);throw error;}));const mr=await client.linkCache.get(key);if(!mr){db.prepare("UPDATE evidence_links SET status='outside-collector-scope',error='Only public GitLab Runner/GitLab merge requests are fetched' WHERE url=?").run(url);continue;}db.prepare("UPDATE evidence_links SET status='fetched',title=?,state=?,merged_at=?,description=?,fetched_at=?,error=NULL WHERE url=?").run(cleanPublicText(mr.title),mr.state||'',mr.merged_at||null,cleanPublicText(mr.description),new Date().toISOString(),url);}catch(error){if(!(error instanceof PublicSourceError)||error.status===429)throw error;db.prepare('UPDATE evidence_links SET status=?,fetched_at=?,error=? WHERE url=?').run([401,403,404].includes(error.status)?'unavailable':'failed',new Date().toISOString(),String(error.message).slice(0,300),url);}}
}
export async function enrichReport(db,report,client,{reservedUrls=[],shouldStop=()=>false,onPage=()=>{}}={}){
 let job=db.prepare('SELECT * FROM enrichment_jobs WHERE report_id=?').get(report.id);if(job?.status==='completed')return {status:'completed',skipped:true};
 const now=new Date().toISOString();db.prepare("UPDATE enrichment_jobs SET status='collecting',started_at=coalesce(started_at,?),updated_at=?,attempts=attempts+1,error=NULL WHERE report_id=?").run(now,now,report.id);
 try{
  let cursor=job?.cursor||null;const seen=new Set();while(cursor!=='__COMPLETE__'){
   if(shouldStop())throw new PublicSourceError('Interrupted; cursor saved',{retryable:true});
   if(seen.has(cursor))throw new Error('Pagination cursor repeated; refusing incomplete collection');seen.add(cursor);
   const iid=report.id.match(/^gitlab-runner-(\d+)$/)?.[1];if(!iid)throw new Error('Unsupported report ID');const issue=await client.notes(iid,cursor);
   const info=issue.notes.pageInfo;if(info.hasNextPage&&!info.endCursor)throw new Error('Missing next cursor; refusing incomplete collection');
   const next=info.hasNextPage?info.endCursor:'__COMPLETE__';if(next===cursor)throw new Error('Pagination cursor did not advance');
   saveNotePage(db,report,issue.notes.nodes,next);cursor=next;onPage(issue.notes.nodes.length);
  }
  await collectLinkedEvidence(db,report,client,{shouldStop});
  const extraction=finishEnrichment(db,report,reservedUrls);return {status:'completed',outcome:extraction.outcome.category};
 }catch(error){const unavailable=[401,403,404,410].includes(error.status);const retryAt=new Date(Date.now()+Math.max(error.retryAfter||0,60000)).toISOString();db.prepare('UPDATE enrichment_jobs SET status=?,updated_at=?,error=?,retry_at=? WHERE report_id=?').run(unavailable?'unavailable':'failed',new Date().toISOString(),String(error.message).slice(0,500),unavailable?null:retryAt,report.id);return {status:unavailable?'unavailable':'failed',error:error.message,httpStatus:error.status||0,errorType:error instanceof PublicSourceError?'public-source':'collector-validation-or-storage'};}
}
