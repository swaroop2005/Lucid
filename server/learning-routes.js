import {DomainError} from './domain.js';
import {LearningCloseout} from './learning-closeout.js';

export function mountLearningRoutes(app,store,{cloud,authorize,service,onCommitted=()=>{}}={}){
 const learning=service||(cloud?new LearningCloseout(store,()=>cloud.provider(),{connectionId:()=>cloud.connectionId(),authorize}):null);
 const timers=new Set(),queued=new Set();let active=false;
 const publicStatus=record=>({key:record.key,articleId:record.articleId,revision:record.revision,status:record.status,note:record.note,checks:record.checks,checkedAt:record.checkedAt});
 const statuses=()=>Object.values(store.read().learningCloseouts||{}).map(publicStatus);
 const later=key=>{const timer=setTimeout(async()=>{timers.delete(timer);try{const current=store.read().learningCloseouts?.[key];if(!current||current.checks>=3||current.status==='succeeded')return;const status=await learning.check(key);if(status.status==='processing'&&status.checks<3)later(key);}catch{/* durable service status explains failures */}finally{onCommitted();}},20000);timer.unref?.();timers.add(timer);};
 const run=async key=>{if(!learning)return;queued.add(key);if(active)return;active=true;try{while(queued.size){const next=queued.values().next().value;queued.delete(next);try{const status=await learning.run(next,{maxChecks:0});if(['processing','dispatched','unverified'].includes(status.status)&&status.checks<3)later(next);}catch{/* approval is already saved; Cloud remains pending */}}}finally{active=false;onCommitted();}};
 const resume=()=>{const item=statuses().find(r=>r.status==='pending'||(['processing','dispatched','unverified'].includes(r.status)&&r.checks<3));if(item)void run(item.key);};
 app.get('/api/learning',(_,res)=>res.json({items:statuses()}));
 app.post('/api/articles/:id/learning-status',async(req,res)=>{if(!learning)throw new DomainError('Configure Hindsight before checking reviewed learning.',409);const record=statuses().find(r=>r.articleId===req.params.id&&r.revision===req.body.expectedRevision);if(!record)throw new DomainError('No approved learning closeout exists for this revision.',404);res.json(await learning.check(record.key));onCommitted();});
 return {afterApproval(article,caseId){if(!learning)return null;const status=learning.enqueue(article.id,{caseId,expectedRevision:article.revision});if(status.key)void run(status.key);return status;},resume,statuses,close(){for(const timer of timers)clearTimeout(timer);timers.clear();}};
}
