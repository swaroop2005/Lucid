// Every browser run gets isolated databases and explicit offline provider modes.
import {EvidenceStore} from '../server/evidence-store.js';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const stamp=`${Date.now()}-${process.pid}`;
Object.assign(process.env,{MEMORY_MODE:'offline',AGENT_MODE:'offline',ALLOW_EXTERNAL_CALLS:'false',EVIDENCE_FILE:resolve(`work/e2e-evidence-${stamp}.sqlite`),DATA_FILE:resolve(`work/e2e-workspace-${stamp}.sqlite`),OPENAI_SETTINGS_FILE:resolve(`work/e2e-openai-${stamp}.json`),SETTINGS_FILE:resolve(`work/e2e-cloud-${stamp}.json`),PORT:'4318'});
const evidence=new EvidenceStore(process.env.EVIDENCE_FILE);
for(const r of JSON.parse(readFileSync(new URL('../tests/fixtures/public-reports.json',import.meta.url),'utf8'))){
 evidence.upsert({...r,createdAt:r.created_at,updatedAt:r.updated_at,labels:JSON.parse(r.labels)});
}
evidence.close();
await import('../server/index.js');
