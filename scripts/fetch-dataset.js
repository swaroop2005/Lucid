// Explicit public-source download. No model, Hindsight, credentials or cloud writes.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {EvidenceStore} from '../server/evidence-store.js';
import {cleanPublicText} from '../server/evidence-text.js';

const fields=['id','issueIid','url','createdAt','updatedAt','state','family'];
const families=new Set(['Artifacts','Authentication & permissions','Build environment','Caching','Configuration & upgrades','Container images','Kubernetes execution','Network & DNS','Other runner reports','Resource pressure','Runner lifecycle','Windows execution']);
const sourceUrl=(iid,kind='issues')=>`https://gitlab.com/gitlab-org/gitlab-runner/-/${kind}/${iid}`;
const validUrl=(url,iid)=>['issues','work_items'].some(kind=>url===sourceUrl(iid,kind));
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));

export function readDataset(index,manifest){
 const bytes=readFileSync(index),meta=JSON.parse(readFileSync(manifest,'utf8'));
 if(meta.schemaVersion!==1||meta.representation!=='public-source-metadata-index'||meta.project!=='gitlab-org/gitlab-runner'||createHash('sha256').update(bytes).digest('hex')!==meta.indexSha256)throw Error('Dataset identity or checksum mismatch.');
 const rows=bytes.toString('utf8').trim().split('\n').map(line=>JSON.parse(line));
 if(rows.length!==meta.records||!rows.length)throw Error('Dataset count mismatch.');
 let previous=0;
 for(const row of rows){
  if(Object.keys(row).length!==fields.length||fields.some(key=>!Object.hasOwn(row,key))||!Number.isSafeInteger(row.issueIid)||row.issueIid<=previous||row.id!==`gitlab-runner-${row.issueIid}`||!validUrl(row.url,row.issueIid)||!date(row.createdAt)||!date(row.updatedAt)||!['opened','closed'].includes(row.state)||!families.has(row.family))throw Error('Invalid public dataset record.');
  previous=row.issueIid;
 }
 return rows;
}

export async function fetchReport(row,{fetcher=fetch}={}){
 // Build the endpoint from a validated numeric identity, never a supplied remote URL.
 if(!Number.isSafeInteger(row.issueIid)||row.issueIid<1||!validUrl(row.url,row.issueIid))throw Error('Invalid source identity.');
 const endpoint=`https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab-runner/issues/${row.issueIid}`;
 const response=await fetcher(endpoint,{headers:{'User-Agent':'Lucid-source-reproduction/1.0'},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(30000)});
 if([403,404,410].includes(response.status))return {status:'unavailable',issueIid:row.issueIid};
 if(!response.ok)throw Error(`GitLab returned HTTP ${response.status}. Stopped without retry; respect any Retry-After guidance before running again.`);
 const item=await response.json();
 if(item.confidential!==false)return {status:'not-public',issueIid:row.issueIid};
 if(item.iid!==row.issueIid||!validUrl(item.web_url,row.issueIid)||typeof item.title!=='string'||typeof item.description!=='string'||!date(item.created_at)||!date(item.updated_at)||!['opened','closed'].includes(item.state)||!Array.isArray(item.labels)||item.labels.some(x=>typeof x!=='string'))throw Error('Source identity or public issue schema changed; nothing imported for this item.');
 return {status:'ready',report:{id:row.id,url:sourceUrl(row.issueIid),title:cleanPublicText(item.title),body:cleanPublicText(item.description),author:'Public user',createdAt:item.created_at,updatedAt:item.updated_at,state:item.state,family:row.family,labels:item.labels.map(x=>cleanPublicText(x,200)),source:'GitLab Runner public issues'}};
}

export async function fetchBatch(rows,store,{offset=0,limit=25,fetcher=fetch,wait=pause}={}){
 if(!Number.isInteger(offset)||offset<0||offset>rows.length||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Use a valid offset and a limit between 1 and 100.');
 const result={processed:0,imported:0,existing:0,unavailable:0,notPublic:0,nextOffset:offset};
 for(const row of rows.slice(offset,offset+limit)){
  try{
   if(store.get(row.id))result.existing++;
   else{
    const item=await fetchReport(row,{fetcher});
    if(item.status==='ready'){store.upsert(item.report);result.imported++;}
    else if(item.status==='unavailable')result.unavailable++;
    else result.notPublic++;
    await wait(1000);
   }
   result.processed++;result.nextOffset++;
  }catch(error){throw new Error(`${error.message} Resume from --offset ${result.nextOffset}.`,{cause:error});}
 }
 return result;
}

async function main(){
 const args=process.argv.slice(2);let download=false,offset=0,limit=25;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--fetch')download=true;
  else if(['--offset','--limit'].includes(args[i])){const key=args[i],value=args[++i];if(!/^\d+$/.test(value||''))throw Error('Expected a nonnegative integer.');if(key==='--offset')offset=Number(value);else limit=Number(value);}
  else throw Error('Usage: npm run dataset:fetch -- [--fetch] [--offset 0] [--limit 25]');
 }
 const base=new URL('../data/public-dataset/',import.meta.url),rows=readDataset(new URL('reports.jsonl',base),new URL('manifest.json',base));
 if(!Number.isSafeInteger(offset)||offset<0||offset>rows.length||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Use an offset within the index and a limit between 1 and 100.');
 if(!download){console.log(JSON.stringify({mode:'preview; zero network requests and zero database writes',records:rows.length,offset,limit,selected:rows.slice(offset,offset+limit).map(r=>r.id)},null,2));return;}
 const store=new EvidenceStore(resolve(process.env.EVIDENCE_FILE||'.data/evidence.sqlite'));
 try{console.log(JSON.stringify(await fetchBatch(rows,store,{offset,limit}),null,2));}finally{store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
