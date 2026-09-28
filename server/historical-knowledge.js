import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {DomainError,hash} from './domain.js';
import {canonicalPublicUrl,cleanPublicText} from './evidence-text.js';
import {publicLinks} from './enrichment-extract.js';
const text=z.string().min(1).max(6000), version=z.string().max(80);
const url=z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='gitlab.com'&&!u.username&&!u.password&&!u.search;},'A public GitLab HTTPS citation without credentials or query parameters is required.');
export const historicalArticleInput=z.object({key:z.string().regex(/^[a-zA-Z0-9_-]{3,120}$/),title:text,symptom:text,executor:z.enum(['Kubernetes','Docker','Shell','Unknown']),hosting:z.enum(['Self-managed','GitLab.com','Dedicated','Unknown']),runnerVersion:version,serverVersion:version,chartVersion:version,fix:text,cause:z.string().max(6000),verification:text,limitations:text,diagnostics:z.array(text).max(20),failedAlternatives:z.array(z.object({step:text,evidence:text,url}).strict()).max(20),sourceReports:z.array(z.object({reportId:text,sourceHash:z.string().regex(/^[a-f0-9]{64}$/),reviewDepth:z.literal('full-local-context')}).strict()).min(1).max(20),citations:z.array(z.object({id:text,title:text,url,quote:text,sourceDate:z.string().nullable(),status:text}).strict()).min(1).max(30)}).strict();

export const historicalAssociationInput=z.object({articleKey:historicalArticleInput.shape.key,reportId:text,sourceHash:z.string().regex(/^[a-f0-9]{64}$/),reviewDepth:z.literal('full-local-context'),rationale:z.string().min(1).max(2000).optional()}).strict();
const historicalImportInput=z.union([z.array(historicalArticleInput).max(500).transform(articles=>({articles,associations:[]})),z.object({articles:z.array(historicalArticleInput).max(500).default([]),associations:z.array(historicalAssociationInput).max(2000).default([])}).strict()]);

// Field selection/order is part of the immutable source-hash contract. No hidden outcomes.
export function readHistoricalSource(db,reportId){
 const report=db.prepare('SELECT id,url,title,body,created_at,updated_at,state,family,labels FROM reports WHERE id=?').get(reportId);
 if(!report)throw new DomainError('Historical source report not found: '+reportId,404);
 const notes=db.prepare('SELECT id,url,body,created_at,updated_at,system,truncated FROM evidence_notes WHERE report_id=? ORDER BY created_at,id').all(reportId);
 const links=db.prepare('SELECT DISTINCT l.url,l.title,l.description,l.state,l.status,l.merged_at FROM evidence_links l JOIN evidence_report_links r ON r.url=l.url WHERE r.report_id=? ORDER BY l.url').all(reportId);
 return {report,notes,links,sourceHash:hash({report,notes,links})};
}
const issueUrl=id=>'https://gitlab.com/gitlab-org/gitlab-runner/-/issues/'+id.replace(/^gitlab-runner-/,'');
export const curationSourceIdentity=value=>canonicalPublicUrl(value).replace('https://gitlab.com/gitlab-org/gitlab-ci-multi-runner/','https://gitlab.com/gitlab-org/gitlab-runner/');
export function curationExclusions(state,evidenceDb){
 const manifest=JSON.parse(readFileSync(new URL('../data/quality-evaluation/source-manifest.json',import.meta.url),'utf8'));
 const former=JSON.parse(readFileSync(new URL('../data/quality-evaluation/exclusions.json',import.meta.url),'utf8')).filter(x=>['Q04','Q09'].includes(x.formerTestId));
 const fresh=['fresh-source-exclusions.json','fresh-v3-source-exclusions.json','fresh-v4-source-exclusions.json'].flatMap(file=>JSON.parse(readFileSync(new URL('../data/quality-evaluation/'+file,import.meta.url),'utf8')).urls);
 const excluded=new Set([...(state.corpus||[]).filter(x=>x.partition==='holdout').map(x=>x.source.url),...manifest.heldouts.map(x=>issueUrl(x.sourceId)),...former.map(x=>issueUrl(x.sourceId)),...fresh].map(curationSourceIdentity));
 // Source identity metadata only: shared fixing changes remain evaluation evidence.
 if(evidenceDb){
  const heldoutIds=new Set(evidenceDb.prepare('SELECT id,url FROM reports').all().filter(r=>excluded.has(curationSourceIdentity(r.url))).map(r=>r.id));
  if(heldoutIds.size){
   const placeholders=[...heldoutIds].map(()=>'?').join(',');
   for(const row of evidenceDb.prepare(`SELECT DISTINCT url FROM evidence_report_links WHERE report_id IN (${placeholders})`).all(...heldoutIds)){
    const identity=curationSourceIdentity(row.url);if(identity.includes('/-/merge_requests/'))excluded.add(identity);
   }
  }
 }
 return excluded;
}
export function sourceIsExcluded(snapshot,excluded){
 const texts=[snapshot.report.body,...snapshot.notes.map(x=>x.body),...snapshot.links.map(x=>x.description||'')];
 return [snapshot.report.url,...snapshot.notes.map(x=>x.url),...snapshot.links.map(x=>x.url),...texts.flatMap(t=>publicLinks(t,'').map(x=>x.url))].some(u=>excluded.has(curationSourceIdentity(u)));
}
function citationSources(snapshot){return [{url:snapshot.report.url,text:snapshot.report.body,date:snapshot.report.created_at},...snapshot.notes.filter(n=>!n.system&&!n.truncated).map(n=>({url:n.url,text:n.body,date:n.created_at})),...snapshot.links.filter(l=>l.status==='fetched').map(l=>({url:l.url,text:l.description||'',date:l.merged_at}))];}
function sameCitationUrl(a,b){const first=new URL(a),second=new URL(b);return canonicalPublicUrl(a)===canonicalPublicUrl(b)&&first.hash===second.hash;}
export function importHistoricalKnowledge(state,items,evidenceDb,{publishedAt=new Date().toISOString()}={}){
 const {articles:inputs,associations}=historicalImportInput.parse(items),excluded=curationExclusions(state,evidenceDb),seen=new Set(),plans=[];
 if(!Number.isFinite(Date.parse(publishedAt)))throw new DomainError('A valid publication date is required.');
 for(const input of inputs){
  if(seen.has(input.key))throw new DomainError('Duplicate curation key in batch: '+input.key);seen.add(input.key);
  if(cleanPublicText(JSON.stringify(input),Infinity)!==JSON.stringify(input))throw new DomainError('Remove private identifiers from curated content before import.');
  const fingerprint=hash(input),existing=state.articles.find(a=>a.curation?.key===input.key);
  if(existing){if(existing.curation.contentHash!==fingerprint)throw new DomainError('Published historical knowledge is immutable: '+input.key,409);plans.push({existing});continue;}
  const snapshots=input.sourceReports.map(source=>{const snapshot=readHistoricalSource(evidenceDb,source.reportId);if(snapshot.sourceHash!==source.sourceHash)throw new DomainError('Historical source changed after review: '+source.reportId,409);if(sourceIsExcluded(snapshot,excluded))throw new DomainError('Heldout source or cross-link cannot enter curated knowledge: '+source.reportId);return snapshot;});
  const sources=snapshots.flatMap(citationSources);
  for(const citation of input.citations){
   const matched=sources.find(s=>sameCitationUrl(s.url,citation.url)&&s.text.includes(citation.quote));
   if(!matched)throw new DomainError('Citation must quote the exact stored source at its URL: '+citation.id);
   if(citation.sourceDate&&(!Number.isFinite(Date.parse(citation.sourceDate))||!matched.date||citation.sourceDate.slice(0,10)!==matched.date.slice(0,10)))throw new DomainError('Citation date does not match its stored source: '+citation.id);
  }
  for(const failed of input.failedAlternatives)if(!sources.some(s=>sameCitationUrl(s.url,failed.url)&&s.text.includes(failed.evidence)))throw new DomainError('Failed alternative requires exact source evidence.');
  if(publicLinks(JSON.stringify(input),'').some(l=>excluded.has(curationSourceIdentity(l.url))))throw new DomainError('Heldout citation cannot enter curated knowledge.');
  plans.push({input,fingerprint});
 }
 // Validate every association before mutating articles or association state.
 const associationPlans=[],associationKeys=new Set();
 for(const input of associations){
  const pair=JSON.stringify([input.articleKey,input.reportId]);
  if(associationKeys.has(pair))throw new DomainError('Duplicate historical association in batch.');associationKeys.add(pair);
  if(cleanPublicText(JSON.stringify(input),Infinity)!==JSON.stringify(input))throw new DomainError('Remove private identifiers from association review.');
  const target=state.articles.find(a=>a.curation?.key===input.articleKey),newTarget=plans.find(p=>p.input?.key===input.articleKey);
  if((!target&&!newTarget)||(target&&!target.curation?.immutable))throw new DomainError('Association requires an immutable curated article: '+input.articleKey);
  const contentHash=hash(input),existing=(state.historicalKnowledgeAssociations||[]).find(a=>a.articleKey===input.articleKey&&a.reportId===input.reportId);
  if(existing){if(existing.contentHash!==contentHash||existing.articleFingerprint!==target?.fingerprint||existing.articleRevision!==target?.revision)throw new DomainError('Published historical association is immutable.',409);associationPlans.push({existing});continue;}
  const snapshot=readHistoricalSource(evidenceDb,input.reportId);
  if(snapshot.sourceHash!==input.sourceHash)throw new DomainError('Historical source changed after review: '+input.reportId,409);
  if(sourceIsExcluded(snapshot,excluded)||publicLinks(JSON.stringify(input),'').some(l=>excluded.has(curationSourceIdentity(l.url))))throw new DomainError('Heldout source or cross-link cannot enter historical associations: '+input.reportId);
  associationPlans.push({input,contentHash});
 }
 let next=Math.max(0,...state.articles.map(a=>Number(/^KA-(\d+)$/.exec(a.id)?.[1]||0)))+1;
 const articleIds=[],duplicates=[];let added=0;
 for(const plan of plans){if(plan.existing){duplicates.push(plan.existing.id);articleIds.push(plan.existing.id);continue;}
  const {input,fingerprint}=plan,{key,sourceReports,...content}=input,id='KA-'+String(next++).padStart(4,'0');
  const article={...content,id,revision:1,fingerprint,sourceIds:input.citations.map(c=>c.id),sourceCases:[],historicalReportIds:sourceReports.map(r=>r.reportId),sourceReports,history:[],reviewer:'AI source reviewer · AI source inspection',updatedAt:publishedAt,sync:'local-only',retentionPolicy:'explicit-only',curation:{key,contentHash:fingerprint,schemaVersion:1,method:'assistant-source-inspection',reviewer:'AI source reviewer',reviewedAt:publishedAt,humanReviewed:false,confirmed:false,independentlyReproduced:false,immutable:true}};
  state.articles.push(article);state.memories??=[];state.memories.push({articleId:id,revision:1,hash:fingerprint,docId:`${id}-r1-${fingerprint.slice(0,12)}`,text:article.fix});articleIds.push(id);added++;
 }
 const associationIds=[],duplicateAssociations=[];let associationsAdded=0;
 for(const plan of associationPlans){
  if(plan.existing){associationIds.push(plan.existing.id);duplicateAssociations.push(plan.existing.id);continue;}
  const {input,contentHash}=plan,article=state.articles.find(a=>a.curation?.key===input.articleKey);
  const association={...input,id:'HA-'+hash([input.articleKey,input.reportId]).slice(0,24),contentHash,articleId:article.id,articleRevision:article.revision,articleFingerprint:article.fingerprint,reviewedAt:publishedAt,method:'assistant-source-inspection',reviewer:'AI source reviewer',humanReviewed:false,confirmed:false,independentlyReproduced:false,immutable:true};
  state.historicalKnowledgeAssociations??=[];state.historicalKnowledgeAssociations.push(association);associationIds.push(association.id);associationsAdded++;
 }
 return {added,duplicates,articleIds,associationsAdded,associationIds,duplicateAssociations};
}
