import {readFileSync,writeFileSync,renameSync,existsSync,mkdirSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {dirname} from 'node:path';
export class HindsightCreditBudget {
 constructor(file='work/hindsight-50-ledger.json'){this.file=file;}
 withLock(fn){
  mkdirSync(dirname(this.file),{recursive:true});let fd;try{fd=openSync(this.file+'.lock','wx',0o600);}catch{throw new Error('Credit ledger is locked by another operation; no dispatch.');}
  try{return fn();}finally{closeSync(fd);unlinkSync(this.file+'.lock');}
 }
 update(fn){return this.withLock(()=>{const ledger=this.read();const result=fn(ledger);this.save(ledger);return result;});}
 initialize(){return this.withLock(()=>this.initializeUnlocked());}
 initializeUnlocked(){
  if(existsSync(this.file))return this.read();
  const value={schemaVersion:1,createdAt:new Date().toISOString(),provider:'Hindsight Cloud',authorization:'Unbound local reservation ledger. Runtime dispatch requires explicit authorization bound to a workspace and connection. No purchases, recharge or automatic retries.',capUSD:50,usableBalanceVerified:false,categoryCaps:{ingestion:20,evaluation:20,derived:5,metadata:0},unallocatedSafetyUSD:5,maxMetadataOperations:400,calls:[],rules:['Reserve before dispatch. Uncertain operations retain their full reservation.','Reservations are serialized with an exclusive local lock.','Stop on insufficient credit or a rate/configuration outside the planned bound.','Conservative reservations are not provider invoice charges.']};this.save(value);return value;
 }
 read(){return JSON.parse(readFileSync(this.file,'utf8'));}
 save(value){mkdirSync(dirname(this.file),{recursive:true});writeFileSync(this.file+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(this.file+'.tmp',this.file);}
 reserve({id,category,operation,reservedUSD,limits,reservationCeilingUSD}){
  return this.update(ledger=>{
  if(ledger.stopped)throw new Error('Hindsight dispatch is stopped: '+ledger.stopped.reason);
  if(!id||ledger.calls.some(c=>c.id===id))throw new Error('Operation already reserved or missing identity; no automatic retry.');
  if(operation==='investigation-audit'&&(!limits?.investigationId||ledger.calls.some(c=>c.operation===operation&&c.limits?.investigationId===limits.investigationId)))throw new Error('Evidence audit already reserved or missing investigation identity; no automatic retry.');
  if(operation==='learning-retain'&&(!limits?.closeoutId||ledger.calls.some(c=>c.operation===operation&&c.limits?.closeoutId===limits.closeoutId)))throw new Error('Learning write already reserved or missing closeout identity; no automatic retry.');
  if(operation==='workspace-retain'&&(!limits?.documentId||ledger.calls.some(c=>c.operation===operation&&c.limits?.documentId===limits.documentId)))throw new Error('Archive document already reserved or missing identity; no automatic retry.');
  if(!Object.hasOwn(ledger.categoryCaps,category)||!Number.isFinite(reservedUSD)||reservedUSD<0||(reservedUSD===0&&category!=='metadata'))throw new Error('Invalid budget category or reservation.');
  const total=ledger.calls.reduce((n,c)=>n+c.reservedUSD,0),categoryTotal=ledger.calls.filter(c=>c.category===category).reduce((n,c)=>n+c.reservedUSD,0);
  if(reservationCeilingUSD!==undefined&&(!Number.isFinite(reservationCeilingUSD)||reservationCeilingUSD<0||total+reservedUSD>reservationCeilingUSD+1e-9))throw new Error('Experiment reservation ceiling would be exceeded.');
  if(total+reservedUSD>ledger.capUSD-ledger.unallocatedSafetyUSD+1e-9||categoryTotal+reservedUSD>ledger.categoryCaps[category]+1e-9)throw new Error('Hindsight budget or protected category would be exceeded.');
  if(category==='metadata'&&ledger.calls.filter(c=>c.category==='metadata').length>=ledger.maxMetadataOperations)throw new Error('Metadata operation limit reached.');
  ledger.calls.push({id,category,operation,reservedUSD,limits,at:new Date().toISOString(),status:'reserved'});return id;});
 }
 mark(id,status,details={}){return this.update(ledger=>{const entry=ledger.calls.find(c=>c.id===id);if(!entry)throw new Error('Missing reservation');Object.assign(entry,details,{status,updatedAt:new Date().toISOString()});});}
 stop(reason,httpStatus=null){this.update(ledger=>{ledger.stopped={reason,httpStatus,at:new Date().toISOString()};});}
 async run(details,operation){this.reserve(details);this.mark(details.id,'dispatched');try{const result=await operation();this.mark(details.id,'completed');return result;}catch(error){const status=error.status||error.statusCode||null;this.mark(details.id,'unverified',{httpStatus:status});if(status===402)this.stop('Provider reported insufficient credit',status);throw error;}}
 summary(){const ledger=this.read();return {capUSD:ledger.capUSD,reservedUSD:ledger.calls.reduce((n,c)=>n+c.reservedUSD,0),byCategory:Object.fromEntries(Object.keys(ledger.categoryCaps).map(k=>[k,{capUSD:ledger.categoryCaps[k],reservedUSD:ledger.calls.filter(c=>c.category===k).reduce((n,c)=>n+c.reservedUSD,0),operations:ledger.calls.filter(c=>c.category===k).length}])),invoiceMeasuredUSD:null,usableBalanceVerified:ledger.usableBalanceVerified};}
}
