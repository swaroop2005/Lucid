// Explicit new local spending authority; never copies or resets another ledger.
import {DatabaseSync} from 'node:sqlite';
import {resolve,dirname} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {CloudSettings} from '../server/settings.js';
import {hash} from '../server/domain.js';
const args=process.argv.slice(2),pos=args.indexOf('--cap-usd'),cap=Number(pos<0?NaN:args[pos+1]);
if(!args.includes('--acknowledge-paid-usage')||!Number.isFinite(cap)||cap<1||cap>50)throw new Error('Use --cap-usd NUMBER (1–50) --acknowledge-paid-usage. Reservations are estimates, not a provider billing cap.');
const secret=new CloudSettings(resolve(process.env.SETTINGS_FILE||'.data/cloud-credentials.json')).read();
if(!secret)throw new Error('Save the intended Cloud connection first.');
const db=new DatabaseSync(resolve(process.env.DATA_FILE||'.data/lucid.sqlite'),{readOnly:true});
let state;try{state=JSON.parse(db.prepare('SELECT body FROM workspace WHERE id=1').get().body);}finally{db.close();}
if(!state.workspaceId)throw new Error('Start the app once or import a private library before authorizing.');
const file=resolve(process.env.HINDSIGHT_CREDIT_LEDGER||'work/hindsight-50-ledger.json');
const round=n=>Math.round(n*100)/100;
const ledger={schemaVersion:1,createdAt:new Date().toISOString(),provider:'Hindsight Cloud',authorization:'Operator explicitly acknowledged paid usage through the local authorization command.',capUSD:cap,connectionId:hash([secret.baseUrl,secret.bank,hash(secret.apiKey)]),workspaceId:state.workspaceId,usableBalanceVerified:false,categoryCaps:{ingestion:round(cap*.4),evaluation:round(cap*.4),derived:round(cap*.1),metadata:0},unallocatedSafetyUSD:round(cap*.1),maxMetadataOperations:2200,calls:[],rules:['Reserve before dispatch; uncertain calls keep reservations.','Reservations are estimates, not invoiced charges or a hosted billing cap.','No automatic retries, purchases or recharges.']};
mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(ledger,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify({authorizedCapUSD:cap,providerCalls:0,existingLedgerReplaced:false}));
