import {randomUUID} from 'node:crypto';
import {DomainError,requireCase,event} from './domain.js';

export function addCaseTask(state,caseId,input){
 const c=requireCase(state,caseId);c.tasks??=[];
 const existing=c.tasks.find(t=>t.title.toLowerCase()===input.title.toLowerCase()&&!t.completed);
 if(existing)return existing;
 if(c.tasks.length>=40)throw new DomainError('Keep at most 40 investigation steps in one case.');
 if(input.sourceId&&!c.publicEvidence?.some(r=>r.id===input.sourceId))throw new DomainError('Select the source for this case before citing it in a step.');
 const task={id:randomUUID(),title:input.title,sourceId:input.sourceId||null,completed:false,evidence:'',createdAt:new Date().toISOString(),completedAt:null};
 c.tasks.push(task);event(state,c,`Planned investigation step: ${task.title}`);return task;
}
export function updateCaseTask(state,caseId,taskId,input){
 const c=requireCase(state,caseId),task=c.tasks?.find(t=>t.id===taskId);
 if(!task)throw new DomainError('Investigation step not found.',404);
 if(input.completed&&!input.evidence?.trim())throw new DomainError('Record what you observed before completing this step.');
 Object.assign(task,{completed:input.completed,evidence:input.evidence||'',completedAt:input.completed?new Date().toISOString():null});
 c.analysis=null;event(state,c,`${input.completed?'Completed':'Reopened'} investigation step: ${task.title}`);return task;
}
