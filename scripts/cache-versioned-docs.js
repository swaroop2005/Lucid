import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {references} from '../server/reference-library.js';
import {Store} from '../server/db.js';

// Public tagged source files only. Fetching these files never contacts a model.
const state=new Store(':memory:');
const versions=[...new Set(state.read().corpus.map(r=>r.versions.runner).filter(v=>/^\d+\.\d+\.\d+(?:-rc\d+)?$/.test(v)))];state.close();
const file=new URL('../data/versioned-docs.json',import.meta.url);
let records=[];try{records=JSON.parse(readFileSync(file,'utf8'));}catch{/* first run */}
mkdirSync(new URL('../data/versioned-docs/',import.meta.url),{recursive:true});
const pages=[...new Set(references.map(r=>new URL(r.url).pathname).filter(p=>p.startsWith('/runner/')))];
for(const version of versions)for(const path of pages){
 if(records.some(r=>r.version===version&&r.path===path&&r.status==='available'))continue;
 const sourcePath=path.replace(/^\/runner\//,'docs/').replace(/\/$/,'.md');
 let sourceUrl=`https://gitlab.com/gitlab-org/gitlab-runner/-/raw/v${version}/${sourcePath}`;
 let record={version,product:'GitLab Runner',path,sourceUrl,fetchedAt:new Date().toISOString()};
 try{
  let response=await fetch(sourceUrl,{signal:AbortSignal.timeout(25000)});
  if(response.status===404){
   for(const suffix of ['/_index.md','/index.md']){const alternate=sourceUrl.replace(/\.md$/,suffix);const attempt=await fetch(alternate,{signal:AbortSignal.timeout(25000)});if(attempt.ok){response=attempt;sourceUrl=alternate;record.sourceUrl=alternate;break;}}
  }
  if(response.status===429||response.status>=500){record={...record,status:'retryable',httpStatus:response.status};}
  else if(!response.ok){record={...record,status:'unavailable',httpStatus:response.status};}
  else {
   const text=await response.text();
   if(text.startsWith('<!')||text.length<50)throw new Error('Unexpected source format');
   const hash=createHash('sha256').update(text).digest('hex');
   const name=`${version}-${sourcePath.replace(/[^a-z0-9.-]+/gi,'_')}`;
   writeFileSync(new URL('../data/versioned-docs/'+name,import.meta.url),text);
   record={...record,status:'available',sha256:hash,file:name,bytes:Buffer.byteLength(text)};
  }
 }catch{record={...record,status:'retryable',error:'Public source request did not complete'};}
 records=records.filter(r=>!(r.version===version&&r.path===path));records.push(record);
 writeFileSync(file,JSON.stringify(records,null,2)+'\n');
 console.log(`${version} ${path} ${record.status}`);
 await new Promise(resolve=>setTimeout(resolve,200));
}
console.log(JSON.stringify({versions:versions.length,available:records.filter(r=>r.status==='available').length,unavailable:records.filter(r=>r.status==='unavailable').length,retryable:records.filter(r=>r.status==='retryable').length}));
