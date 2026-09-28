import {z} from 'zod';
import {DomainError,event,incidentMatch} from './domain.js';
const field=z.string().trim().min(3).max(4000);
export const incidentInput=z.object({title:field,hosting:z.enum(['Self-managed','GitLab.com','Dedicated']),host:z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9.-]+(?::\d+)?$/).transform(x=>x.toLowerCase()),services:z.array(z.string().trim().min(1).max(100)).min(1).max(12),start:z.string().datetime({offset:true}),end:z.string().datetime({offset:true}),status:z.enum(['Investigating','Resolved']),evidence:field,reviewer:field,expectedRevision:z.number().int().positive().optional()}).strict().refine(x=>Date.parse(x.end)>=Date.parse(x.start),{message:'Impact window end must follow start.',path:['end']});
export function caseLinks(c){return c.incidentLinks??=(c.incidentIds||[]).map(incidentId=>({incidentId,state:'confirmed',evidence:'Previously reviewed link.',at:null}));}
export function refreshIncidentLinks(s,c){
 const links=caseLinks(c);
 for(const link of links){const i=s.incidents.find(i=>i.id===link.incidentId);if(!i||!incidentMatch(c,i)){if(link.state==='confirmed'){link.state='needs-review';c.incidentIds=c.incidentIds.filter(id=>id!==link.incidentId);event(s,c,`Incident ${link.incidentId} no longer matches the case context; review required.`);}}}
 c.incidentLinks=links.filter(link=>link.state!=='proposed'||s.incidents.some(i=>i.id===link.incidentId&&incidentMatch(c,i)));
 for(const i of s.incidents.filter(i=>incidentMatch(c,i))){if(!c.incidentLinks.some(l=>l.incidentId===i.id))c.incidentLinks.push({incidentId:i.id,state:'proposed',revision:i.revision||1,evidence:'Host, hosting, service and impact window match; human confirmation required.',at:new Date().toISOString()});}
}
export function saveIncident(s,input,id){
 const {expectedRevision,...data}=input;
 let incident=id?s.incidents.find(i=>i.id===id):null;
 if(id&&!incident)throw new DomainError('Incident not found.',404);
 if(incident){
  if(expectedRevision!==(incident.revision||1))throw new DomainError('Incident changed. Reload before editing.',409);
  const previous=structuredClone({...incident,history:undefined});
  Object.assign(incident,data,{summary:data.evidence,revision:(incident.revision||1)+1,updatedAt:new Date().toISOString(),history:[...(incident.history||[]),previous]});
  for(const c of s.cases){const link=caseLinks(c).find(l=>l.incidentId===id);if(link){link.state='needs-review';c.incidentIds=c.incidentIds.filter(x=>x!==id);c.analysis=null;event(s,c,`Incident ${id} was edited; confirm the relationship against revision ${incident.revision}.`);}else if(c.analysis?.incidentCandidates?.some(i=>i.id===id))c.analysis=null;}
 }else{
  incident={...data,id:`INC-${Math.max(1000,...s.incidents.map(i=>Number(i.id.slice(4))||0))+1}`,revision:1,sourceId:null,summary:data.evidence,history:[],updatedAt:new Date().toISOString()};s.incidents.push(incident);
 }
 event(s,null,`${id?'Updated':'Created'} incident ${incident.id}; evidence recorded by ${data.reviewer}.`);return incident;
}
