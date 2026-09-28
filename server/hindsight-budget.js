import {HindsightCreditBudget} from '../scripts/lib/hindsight-credit-budget.js';
import {DomainError,hash} from './domain.js';
import {verifiedArticleScope,investigationTagGroups} from './hindsight-scope.js';

// This opens only an already-authorized ledger. Starting the app never creates credit authority.
export function createInvestigationAuthorizer({ledgerPath='work/hindsight-50-ledger.json',store,settings}={}){
 const ledger=new HindsightCreditBudget(ledgerPath);
 return async({id,investigationId,derivedId,kind,budget,connectionId,request})=>{
  try{
   const authority=ledger.read(),secret=settings.read();
   const actualConnection=secret?hash([secret.baseUrl,secret.bank,hash(secret.apiKey)]):null;
   if((!Number.isFinite(authority.capUSD)||authority.capUSD<=0||authority.capUSD>50)||authority.provider!=='Hindsight Cloud'||authority.connectionId!==connectionId||actualConnection!==connectionId||authority.workspaceId!==store.read().workspaceId)throw new Error('Credit authority does not match this workspace and connection.');
   const kinds={'investigation-metadata':0,'investigation-recall':.05,'investigation-reflect':.10,'investigation-audit':.10,'investigation-provenance':0,'derived-create':.50,'derived-refresh':.50,'derived-read':.05,'derived-metadata':0,'derived-provenance':0},derived=kind?.startsWith('derived-');
   if(!Object.hasOwn(kinds,kind)||(!derived&&!['mid','high'].includes(budget)))throw new Error('Unapproved Hindsight operation.');
   if(derived){
    const state=store.read(),scope='lucid-workspace-'+state.workspaceId,snapshots=request?.sourceSnapshots,options=request?.options,trigger=options?.trigger;
    if(!/^lucid-derived-[a-f0-9-]{36}$/.test(derivedId||'')||!/^[a-f0-9]{64}$/.test(request?.planHash||'')||!Array.isArray(snapshots)||snapshots.length<2||snapshots.length>3||new Set(snapshots.map(s=>s.articleId)).size!==snapshots.length)throw new Error('Derived knowledge requires a frozen two or three source plan.');
    const articles=snapshots.map(s=>{const a=state.articles.find(a=>a.id===s.articleId);if(!a||!verifiedArticleScope(a,{connectionId,scope})||a.revision!==s.revision||a.fingerprint!==s.articleHash||a.cloudScope.docId!==s.docId||a.cloudScope.contentHash!==s.contentHash||hash(a.cloudScope.tags)!==hash(s.tags))throw new Error('Derived source scope changed or is unverified.');return a;});
    if(options?.id!==derivedId||options.maxTokens!==2048||!Array.isArray(options.tags)||options.tags.length!==2||options.tags[0]!==scope||!options.tags[1].startsWith('lucid-derived-snapshot:'+derivedId+':')||trigger?.mode!=='full'||trigger.refreshCron!==null||trigger.refreshAfterConsolidation!==false||trigger.excludeMentalModels!==true||trigger.keepTrace!==true||trigger.recallMaxTokens!==4096||trigger.recallChunksMaxTokens!==4096||hash(trigger.tagGroups)!==hash(investigationTagGroups(articles,scope)))throw new Error('Derived model must use exact source scopes and manual bounded refresh.');
    if(kind==='derived-create'&&(typeof request.name!=='string'||request.name.length>200||typeof request.sourceQuery!=='string'||Buffer.byteLength(request.sourceQuery)>10000))throw new Error('Derived query exceeds its allowance.');
   }
   if(kind==='investigation-reflect'&&(Buffer.byteLength(request.query)>19000||request.options?.budget!==budget||request.options?.includeFacts!==true||request.options?.excludeMentalModels!==true))throw new Error('Reflect request exceeds approved bounds.');
   if(kind==='investigation-audit'){
    if(typeof investigationId!=='string'||!investigationId||investigationId.length>200||typeof request?.query!=='string'||Buffer.byteLength(request.query)>48000||!/^[a-f0-9]{64}$/.test(request.auditInputHash||'')||request.options?.budget!==budget||request.options?.includeFacts!==true||request.options?.excludeMentalModels!==true||request.options?.includeToolCalls!==true||request.options?.includeToolCallOutput!==true||request.options?.applyAllDirectives!==false)throw new Error('Evidence audit exceeds approved bounds or is missing its frozen identity.');
    if(authority.calls.some(call=>call.operation==='investigation-audit'&&call.limits?.investigationId===investigationId))throw new Error('An evidence audit was already reserved for this investigation; no retry is authorized.');
   }
   if(kind==='investigation-recall'&&(request.options?.maxTokens>4096||request.options?.maxChunkTokens>4096||request.options?.budget!==budget))throw new Error('Recall request exceeds approved bounds.');
   const reservedUSD=kinds[kind];
   ledger.reserve({id,category:reservedUSD?(derived?'derived':'evaluation'):'metadata',operation:kind,reservedUSD,limits:{investigationId,derivedId,budget,requestHash:hash(request),connectionId}});
   ledger.mark(id,'dispatched');
   return {
    complete:response=>ledger.mark(id,'completed',{usage:response?.usage||null,invoiceMeasuredUSD:null}),
    fail:error=>{const status=error?.status||error?.statusCode||null;ledger.mark(id,'unverified',{httpStatus:status});if(status===402)ledger.stop('Provider reported insufficient credit',status);}
   };
  }catch(error){throw new DomainError(`Hindsight credit dispatch was blocked: ${error.code==='ENOENT'?'no authorized local budget is available':error.message}`,409);}
 };
}
