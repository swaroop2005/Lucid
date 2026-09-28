import {retrievalTerms} from './evidence-text.js';

// Discovery only. Company identity and unverified resolutions are not search inputs.
export function relatedCases(evidence,record,{excludeIds=[],excludeUrls=[]}={}){
 const text=[record.title,record.description||record.body,record.symptom,record.stage].filter(Boolean).join(' ');
 if(excludeUrls.some(url=>evidence.isReserved(url))||evidence.containsReserved(text))return {rows:[],query:'',reason:'This source is reserved for evaluation. Related-case suggestions are unavailable.'};
 const query=text.slice(0,5000),terms=retrievalTerms(query);
 const rows=evidence.suggest(query,record,{excludeIds,excludeUrls,deduplicate:true,includeFeatures:true,priorityTerms:retrievalTerms(record.title)});
 return {query:terms.slice(0,3).join(' '),rows:rows.map(r=>({id:r.id,title:r.title,url:r.reportUrl||r.url,excerpt:r.excerpt.slice(0,320),family:r.family,kind:r.kind,state:r.state,outcome:r.status,applicability:r.applicability}))};
}
