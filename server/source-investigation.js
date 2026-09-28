import {initialState} from './fixtures.js';
import {DomainError,event} from './domain.js';

export function openSourceInvestigation(state,report,reference){
 if(!reference)throw new DomainError('This source is unavailable or reserved for evaluation.',409);
 const existing=state.cases.find(c=>c.evidenceReportId===report.id);
 if(existing)return existing;
 const companyId='public-source-investigations';
 if(!state.companies.some(x=>x.id===companyId))state.companies.push({id:companyId,name:'Anonymous public reports',kind:'public-source',note:'Public investigations; no company affiliation or private customer relationship inferred.'});
 const id=`CS-${Math.max(0,...state.cases.map(c=>Number(c.id.slice(3))||0))+1}`;
 const c={...structuredClone(initialState().cases[0]),id,companyId,evidenceReportId:report.id,contact:'Public source participant',owner:'',priority:'Normal',title:report.title.slice(0,200),description:report.body.slice(0,4000),status:'Open',hosting:'Unknown',executor:'Unknown',serverVersion:'',runnerVersion:'',chartVersion:'',host:'',service:'',occurredAt:'',recentChanges:'Not established from source',stage:report.family,symptom:'unclassified',sourceId:reference.id,sourceDate:report.created_at?.slice(0,10)||null,reconstructed:true,tasks:[],attempts:[],articleIds:[],incidentIds:[],incidentLinks:[],timeline:[],resolution:null,proposal:null,drafts:null,analysis:null,publicEvidence:[reference]};
 state.corpusSources??=[];
 if(!state.corpusSources.some(x=>x.id===reference.id))state.corpusSources.push({id:reference.id,title:report.title,url:report.url,type:'Public source investigation',verification:'Machine-collected public report and discussion; no independent or human resolution review.',summary:'Historical source investigation. Source outcomes are unverified reference evidence, not a confirmed operational resolution.'});
 state.cases.unshift(c);event(state,c,'Historical source investigation opened. Confirm environment and outcome independently; no shared knowledge or Cloud memory created.');
 return c;
}
