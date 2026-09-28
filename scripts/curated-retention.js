// Local manifest/staging utility. This CLI never dispatches retention.
// Status requires a root-owned module exporting reserve(details) to authorize bounded metadata reads.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../server/db.js';
import {CloudSettings} from '../server/settings.js';
import {CloudWorkflow} from '../server/cloud-workflow.js';
import {MemoryProvider} from '../server/providers.js';
import {buildCuratedRetentionManifest,CuratedRetentionWorkflow} from '../server/curated-retention.js';
const args=process.argv.slice(2),mode=args[0]||'preview',option=(flag,fallback)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1];};
if(!['preview','stage','status'].includes(mode))throw new Error('Use preview, stage or status. Dispatch is available only through the budget-injected workflow module.');
const workspace=resolve(option('--workspace','.data/lucid.sqlite')),file=resolve(option('--manifest','work/curated-retention/MANIFEST.json'));
const settings=new CloudSettings(resolve(option('--settings','.data/cloud-credentials.json'))),connection=()=>CloudWorkflow.prototype.connectionId.call({settings}),secret=settings.read();
if(!secret)throw new Error('A configured connection is required to freeze its identity; no provider request was sent.');
if(mode==='preview'){
 const db=new DatabaseSync(workspace,{readOnly:true});try{const state=JSON.parse(db.prepare('SELECT body FROM workspace WHERE id=1').get().body),manifest=buildCuratedRetentionManifest(state,{connectionId:connection(),bank:secret.bank,scope:`lucid-workspace-${state.workspaceId}`});mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify({mode,manifest:file,id:manifest.id,manifestHash:manifest.manifestHash,batches:manifest.batches.length,articles:manifest.totalArticles,bytes:manifest.totalBytes,skipped:manifest.skipped,providerCalls:0}));}finally{db.close();}
}else{
 const manifest=JSON.parse(readFileSync(file,'utf8')),store=new Store(workspace);try{let reserve;
  if(mode==='status'){const modulePath=option('--budget-module');if(!modulePath)throw new Error('Status reads require a root-owned --budget-module exporting reserve.');const budget=await import(pathToFileURL(resolve(modulePath)));if(typeof budget.reserve!=='function')throw new Error('Budget module must export reserve(details).');reserve=budget.reserve;}
  const provider=new MemoryProvider(store,{memoryMode:'hindsight',allowExternal:true,hindsightUrl:secret.baseUrl,hindsightKey:secret.apiKey,bank:secret.bank,workspaceScope:manifest.scope}),workflow=new CuratedRetentionWorkflow(store,provider,{connectionId:connection,reserve});
  console.log(JSON.stringify(mode==='stage'?workflow.stage(manifest):await workflow.check(manifest.id,option('--batch'))));
 }finally{store.close();}
}
