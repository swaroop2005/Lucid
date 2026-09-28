// Local-only import. Preview is default; never initializes providers or reads settings.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {importHistoricalKnowledge} from '../server/historical-knowledge.js';
const args=process.argv.slice(2),commit=args.includes('--commit');
const value=(flag,fallback)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1];};
const file=resolve(value('--file','data/knowledge-curation/articles.json'));
const allowed=resolve('data/knowledge-curation/articles.json');
if(file!==allowed)throw new Error('Only data/knowledge-curation/articles.json is admitted by this importer.');
const workspace=new DatabaseSync(resolve(value('--workspace','.data/lucid.sqlite')),{readOnly:!commit});
const evidence=new DatabaseSync(resolve(value('--evidence','.data/evidence.sqlite')),{readOnly:true});
try{
 if(commit)workspace.exec('BEGIN IMMEDIATE');
 const state=JSON.parse(workspace.prepare('SELECT body FROM workspace WHERE id=1').get().body);
 const parsed=JSON.parse(readFileSync(file,'utf8'));
 const result=importHistoricalKnowledge(state,parsed,evidence);
 if(commit){workspace.prepare('UPDATE workspace SET body=? WHERE id=1').run(JSON.stringify(state));workspace.exec('COMMIT');}
 console.log(JSON.stringify({mode:commit?'committed':'preview',...result,providerCalls:0,operationalCasesCreated:0}));
}catch(error){if(commit)workspace.exec('ROLLBACK');throw error;}finally{workspace.close();evidence.close();}
