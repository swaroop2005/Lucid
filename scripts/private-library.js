// Private metadata handoff only. No provider calls, cases, credentials or budget export.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {Store} from '../server/db.js';
const args=process.argv.slice(2),mode=args[0],value=flag=>{const i=args.indexOf(flag);return i<0?null:args[i+1];};
if(!['export','import'].includes(mode)||!value('--workspace')||!value('--file')||!args.includes('--acknowledge-private-data'))throw new Error('Use export|import --workspace PATH --file PATH --acknowledge-private-data. Stop the destination app before importing.');
const workspace=resolve(value('--workspace')),file=resolve(value('--file'));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object=z.record(z.unknown());
const schema=z.object({format:z.literal('lucid-private-library-v1'),workspaceId:z.string().min(1).max(200),articles:z.array(object).max(10000),officialDocuments:z.array(object).max(1000),historicalKnowledgeAssociations:z.array(object).max(20000)}).strict();
if(mode==='export'){
 const db=new DatabaseSync(workspace,{readOnly:true});let state;
 try{state=JSON.parse(db.prepare('SELECT body FROM workspace WHERE id=1').get().body);}finally{db.close();}
 const payload=schema.parse({format:'lucid-private-library-v1',workspaceId:state.workspaceId,articles:state.articles||[],officialDocuments:state.officialDocuments||[],historicalKnowledgeAssociations:state.historicalKnowledgeAssociations||[]});
 mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify({payload,sha256:sha(payload)},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({articles:payload.articles.length,officialDocuments:payload.officialDocuments.length,providerCalls:0,privateFile:true}));
}else{
 if(existsSync(workspace))throw new Error('Destination must be a new database path; existing data is never overwritten.');
 const raw=readFileSync(file);if(raw.length>50_000_000)throw new Error('Private library exceeds 50 MB.');
 const bundle=z.object({payload:schema,sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(JSON.parse(raw));
 if(sha(bundle.payload)!==bundle.sha256)throw new Error('Private library integrity check failed.');
 for(const key of ['articles','officialDocuments']){const ids=bundle.payload[key].map(x=>x.id);if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw new Error('Missing or duplicate library identity.');}
 mkdirSync(dirname(workspace),{recursive:true});closeSync(openSync(workspace,'wx',0o600));
 const store=new Store(workspace);try{store.update(s=>{s.workspaceId=bundle.payload.workspaceId;s.articles=bundle.payload.articles;s.officialDocuments=bundle.payload.officialDocuments;s.historicalKnowledgeAssociations=bundle.payload.historicalKnowledgeAssociations;});}finally{store.close();}
 console.log(JSON.stringify({articles:bundle.payload.articles.length,officialDocuments:bundle.payload.officialDocuments.length,providerCalls:0,casesImported:0,credentialsImported:false,budgetImported:false}));
}
