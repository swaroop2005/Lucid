import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {CheckCircle2,Plus,RotateCcw,ClipboardList} from 'lucide-react';
import {api} from './api';
type Task={id:string;title:string;completed:boolean;evidence:string;createdAt:string;completedAt:string|null};

export function CaseTasks({caseId}:{caseId:string}){
 const client=useQueryClient(),[title,setTitle]=useState(''),[recording,setRecording]=useState<string|null>(null),[evidence,setEvidence]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const query=useQuery({queryKey:['case-tasks',caseId],queryFn:()=>api<Task[]>(`/cases/${caseId}/tasks`)});
 async function save(path:string,method:string,body:unknown){setBusy(true);setError('');try{await api(path,method,body);setTitle('');setRecording(null);setEvidence('');await Promise.all([client.invalidateQueries({queryKey:['case-tasks',caseId]}),client.invalidateQueries({queryKey:['workspace']})]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="case-tasks"><div className="section-heading"><h3><ClipboardList size={17}/> Investigation steps</h3><span className="badge">{query.data?.filter(t=>t.completed).length||0} / {query.data?.length||0} complete</span></div>
  <p className="caption">Plan a check, then record what you observed. Completing a step does not confirm the case resolution.</p>
  {query.isPending&&<p role="status">Loading investigation steps…</p>}
  {query.error&&<p role="alert">Investigation steps could not be loaded. <button onClick={()=>query.refetch()}>Retry</button></p>}
  <form className="task-add" onSubmit={e=>{e.preventDefault();void save(`/cases/${caseId}/tasks`,'POST',{title});}}><label><span className="sr-only">Next investigation step</span><input aria-label="Next investigation step" placeholder="Add a concrete check or follow-up" value={title} onChange={e=>setTitle(e.target.value)} minLength={3} maxLength={500} required/></label><button className="secondary" disabled={busy||title.trim().length<3}><Plus size={15}/>Add step</button></form>
  <ul className="task-list">{query.data?.map(task=><li key={task.id} className={task.completed?'complete':''}><div><span className="task-state">{task.completed?<CheckCircle2 size={18}/>:<span className="task-circle"/>}</span><div><strong>{task.title}</strong>{task.evidence&&<p>{task.evidence}</p>}{task.completedAt&&<small>Recorded {new Date(task.completedAt).toLocaleString()}</small>}</div><button className="text-button" disabled={busy} onClick={()=>{if(task.completed)void save(`/cases/${caseId}/tasks/${task.id}`,'PATCH',{completed:false,evidence:task.evidence});else{setRecording(task.id);setEvidence(task.evidence);}}}>{task.completed?<><RotateCcw size={13}/>Reopen</>:'Record result'}</button></div>{recording===task.id&&<form onSubmit={e=>{e.preventDefault();void save(`/cases/${caseId}/tasks/${task.id}`,'PATCH',{completed:true,evidence});}}><label><span>Observed result for this step</span><textarea aria-label="Observed step result" value={evidence} onChange={e=>setEvidence(e.target.value)} minLength={3} maxLength={2000} required autoFocus/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setRecording(null)}>Cancel</button><button className="primary" disabled={busy||evidence.trim().length<3}>Complete step</button></div></form>}</li>)}</ul>
  {query.data?.length===0&&<p className="empty-inline">No planned steps yet. Start with the missing evidence or a diagnostic question.</p>}
  {error&&<p role="alert" className="form-error">{error}</p>}
 </section>;
}
