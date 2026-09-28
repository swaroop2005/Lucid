import {HindsightCreditBudget} from '../scripts/lib/hindsight-credit-budget.js';
import {hash} from './domain.js';

// Read existing authority only. Every actual dispatch still reserves under the ledger lock.
export function createCheckpointBudget({ledgerPath,settings,store}={}){
 const ledger=new HindsightCreditBudget(ledgerPath);
 const unavailable=()=>({authorized:false,reservedUSD:0,remainingUSD:0,ingestionRemainingUSD:0,note:'No matching existing credit authorization is available. No paid checkpoint can start.'});
 const inspect=()=>{
  try{
   const authority=ledger.read(),secret=settings.read(),connectionId=secret?hash([secret.baseUrl,secret.bank,hash(secret.apiKey)]):null;
   const authorized=!authority.stopped&&authority.provider==='Hindsight Cloud'&&Number.isFinite(authority.capUSD)&&authority.capUSD>=1&&authority.capUSD<=50&&authority.workspaceId===store.read().workspaceId&&authority.connectionId===connectionId;
   if(!authorized)return unavailable();
   const sum=items=>Number(items.reduce((n,c)=>n+c.reservedUSD,0).toFixed(2));
   const reservedUSD=sum(authority.calls),remainingUSD=Math.max(0,Number((authority.capUSD-authority.unallocatedSafetyUSD-reservedUSD).toFixed(2))),ingestionRemainingUSD=Math.max(0,Number((authority.categoryCaps.ingestion-sum(authority.calls.filter(c=>c.category==='ingestion'))).toFixed(2)));
   return {authorized,connectionId,bank:secret?.bank,workspaceId:authority.workspaceId,reservedUSD,remainingUSD,ingestionRemainingUSD,note:'Conservative reservations, not measured provider charges. The protected reserve is excluded from available credit.'};
  }catch{return unavailable();}
 };
 return {status:()=>{const {authorized,reservedUSD,remainingUSD,ingestionRemainingUSD,note}=inspect();return {authorized,reservedUSD,remainingUSD,ingestionRemainingUSD,note};},canSpend:({forecast,workspaceId,connectionId,bank})=>{const status=inspect(),cost=forecast?.totalReservationUSD;return status.authorized&&status.workspaceId===workspaceId&&status.connectionId===connectionId&&status.bank===bank&&Number.isFinite(cost)&&cost>=0&&cost<=status.remainingUSD+1e-9&&cost<=status.ingestionRemainingUSD+1e-9;}};
}
