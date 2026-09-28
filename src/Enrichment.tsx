import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowUpRight,RefreshCw,MessageSquare,FileCheck2,Database} from 'lucide-react';
import {api} from './api';
import type {Workspace} from './types';
import './enrichment.css';

type Citation={id:string;kind?:string;quote:string;url:string;createdAt?:string;sourceType?:string};
type Enrichment={status:string;collectionComplete:boolean;linkedEvidenceStatus?:string;linkedPending?:number;notesCount:number;pages:number;updatedAt:string;error?:string;outcome?:{category:string;label:string};versions?:{value:string;context:string;url:string;applicability:string}[];environment?:Citation[];attempts?:Citation[];resolutions?:Citation[];tasks?:Citation[];limitations?:string[];linkedEvidence?:any[]};
type Counts={total:number;pending:number;collecting:number;completed:number;unavailable:number;failed:number;notes:number;discussionNotes:number;sourceSupportedCandidates:number;linkedEvidence?:number;linkedPending?:number;linkedFailed?:number;latestRun?:{status:string;started_at?:string;finished_at?:string};outcomes?:{category:string;count:number}[]};
const number=(n:number|undefined)=>(n??0).toLocaleString();
export function EnrichmentProgress(){
 const query=useQuery({queryKey:['enrichment-progress'],queryFn:()=>api<Counts>('/evidence/enrichment'),refetchInterval:15000});
 const s=query.data;
 if(query.error)return <div className="enrichment-progress"><p role="alert">Discussion progress could not be loaded.</p><button className="secondary" onClick={()=>query.refetch()}>Try again</button></div>;
 if(!s)return <p className="caption" role="status">Loading discussion coverage…</p>;
 const done=s.completed+s.unavailable;
 return <section className="enrichment-progress" aria-label="Discussion collection progress">
  <div className="section-heading"><div><h3><MessageSquare size={17}/> Behind the reports</h3><p>Public discussions, attempted fixes and outcome evidence.</p></div><button className="icon-button" aria-label="Refresh discussion progress" disabled={query.isFetching} onClick={()=>query.refetch()}><RefreshCw size={16}/></button></div>
  <progress aria-label="Reports processed" value={done} max={s.total||1}/>
  <div className="enrichment-counts"><span><b>{number(s.completed)}</b> discussions collected</span><span><b>{number(s.discussionNotes)}</b> public comments</span><span><b>{number(s.sourceSupportedCandidates)}</b> source-supported candidates</span><span><b>{number(s.pending+s.collecting)}</b> remaining</span></div>
  <details><summary>Collection status and evidence boundaries</summary><p>{number(s.total)} indexed reports = {number(s.pending)} pending + {number(s.collecting)} collecting + {number(s.completed)} complete + {number(s.unavailable)} unavailable + {number(s.failed)} failed.</p><p>{number(s.linkedEvidence)} linked changes fetched; {number(s.linkedPending)} waiting and {number(s.linkedFailed)} failed. Discussion completion and linked-change collection are tracked separately.</p><p>Discussion collection does not approve a fix or put it in Hindsight. Outcome signals are machine-extracted with citations; human-reviewed bulk reports and independently confirmed bulk solutions remain zero.</p>{s.latestRun&&<p>Latest run: {s.latestRun.status}. Progress updates every 15 seconds while this view is open.</p>}</details>
 </section>;
}
function Trail({title,items}:{title:string;items:Citation[]}){
 if(!items.length)return null;
 return <section className="extraction-trail"><h4>{title}</h4><ol>{items.map((x,i)=><li key={`${x.id}-${i}`}><blockquote>{x.quote}</blockquote><a href={x.url} target="_blank" rel="noreferrer">{['issue','issue-body'].includes(x.sourceType||'')?'Issue report':'Public source'}{x.createdAt?' · '+x.createdAt.slice(0,10):''}<ArrowUpRight size={13}/></a></li>)}</ol></section>;
}
export function SourceInvestigationAction({id,onOpenCase,label='Open historical investigation',existingCaseId,disabled=false}:{id:string;onOpenCase:(id:string)=>void;label?:string;existingCaseId?:string;disabled?:boolean}){
 const [opening,setOpening]=useState(false),[openError,setOpenError]=useState('');
 const client=useQueryClient();
 async function open(){if(existingCaseId){onOpenCase(existingCaseId);return;}setOpening(true);setOpenError('');try{const c=await api<{id:string}>(`/evidence/${encodeURIComponent(id)}/open`,'POST',{});await client.invalidateQueries({queryKey:['workspace']});onOpenCase(c.id);}catch(e){setOpenError((e as Error).message);}finally{setOpening(false);}}
 return <div className="source-open-action"><button className="primary" disabled={opening||disabled} onClick={open}>{opening?'Opening…':existingCaseId?'Continue investigation':label}</button><p className="caption">{disabled?'Reserved for evaluation; browse the original evidence here.':'Creates or reopens one source-linked investigation. No outcome is confirmed and no memory is uploaded.'}</p>{openError&&<p className="form-error" role="alert">{openError}</p>}</div>;
}
export function EnrichedReport({id,onOpenCase,section='all'}:{id:string;onOpenCase?:(id:string)=>void;section?:'all'|'evidence'|'discussion'}){
 const [page,setPage]=useState(1),[showSystem,setShowSystem]=useState(false);
 const openAction=onOpenCase?<SourceInvestigationAction id={id} onOpenCase={onOpenCase}/>:null;
 const query=useQuery({queryKey:['report-enrichment',id],queryFn:()=>api<Enrichment>(`/evidence/${encodeURIComponent(id)}/enrichment`),refetchInterval:q=>['pending','collecting'].includes(q.state.data?.status||'')?15000:false});
 const notes=useQuery({queryKey:['report-discussion',id,page],queryFn:()=>api<{rows:any[];total:number;pages:number}>(`/evidence/${encodeURIComponent(id)}/discussion?page=${page}`),enabled:section!=='evidence'&&!!query.data?.notesCount});
 const d=query.data;
 if(query.error)return <section className="enriched-report"><p role="alert">Discussion evidence could not be loaded.</p><button className="secondary" onClick={()=>query.refetch()}>Retry discussion</button></section>;
 if(!d)return <p role="status">Loading investigation trail…</p>;
 if(d.status==='pending')return <section className="enriched-report"><h3>Discussion pending</h3><p>This report is in the collection queue. The original source remains available.</p>{openAction}</section>;
 return <section className="enriched-report" aria-label="Investigation trail">
  {section!=='discussion'&&<><div className="section-heading"><h3>Investigation trail</h3><span className="badge">{d.collectionComplete?'Discussion collected':d.status}</span></div>
  <p className="outcome-label"><FileCheck2 size={18}/>{d.outcome?.label||'No outcome established'}</p>
  <p className="caption">Machine extraction from public source text. Read the linked context and check your environment before reuse.</p>
  {openAction}
  {d.linkedEvidenceStatus==='partial'&&<p className="caption">Discussion pages are saved; {number(d.linkedPending)} linked changes still need collection. Review the original links for their full context.</p>}
  {d.error&&<p className="form-error">Collection stopped: {d.error}. Saved pages are preserved.</p>}
  <Trail title="Environment and symptoms" items={d.environment||[]}/>
  {!!d.versions?.length&&<details><summary>Version mentions in this discussion</summary><ul>{d.versions.map((v,i)=><li key={i}><a href={v.url} target="_blank" rel="noreferrer">{v.value}</a> — {v.context}<small>{v.applicability}</small></li>)}</ul></details>}
  <Trail title="Investigation and attempted changes" items={d.attempts||[]}/>
  <Trail title="Outcome evidence" items={d.resolutions||[]}/>
  <Trail title="Follow-up work" items={d.tasks||[]}/>
  {!!d.linkedEvidence?.length&&<details><summary>Linked fixes and references · {d.linkedEvidence.length}</summary><ul>{d.linkedEvidence.map((x:any,i:number)=><li key={i}><a href={x.canonicalUrl||x.url} target="_blank" rel="noreferrer">{x.title||x.canonicalUrl||x.url}<ArrowUpRight size={12}/></a><small>{x.status||'Linked public evidence; review applicability'}</small></li>)}</ul></details>}
  </>}{section!=='evidence'&&<details className="source-comments" open={section==='discussion'}><summary>Read the public discussion · {number(d.notesCount)} notes</summary>
   <label className="check"><input type="checkbox" checked={showSystem} onChange={e=>setShowSystem(e.target.checked)}/> Include system activity</label>
   {notes.error?<p role="alert">This discussion page could not be loaded. <button onClick={()=>notes.refetch()}>Retry</button></p>:notes.isPending&&d.notesCount>0?<p role="status">Loading comments…</p>:null}
   {notes.data?.rows.filter(x=>showSystem||!x.system).map(x=><article key={x.id} className="discussion-note"><div><span>{x.system?'System activity':'Public participant'}</span><a href={x.url} target="_blank" rel="noreferrer">{x.createdAt?.slice(0,10)} <ArrowUpRight size={12}/></a></div><pre>{x.body}</pre>{x.truncated&&<p className="caption">Long note truncated locally; open the source for full context.</p>}</article>)}
   {notes.data&&!notes.data.rows.some(x=>showSystem||!x.system)&&<p>No participant comments on this page. Include system activity or continue to another page.</p>}
   {!d.notesCount&&<p>No publicly accessible notes were returned for this report.</p>}
   {(notes.data?.pages||0)>1&&<div className="pagination"><button className="secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Earlier notes</button><span>Page {page} of {notes.data?.pages}</span><button className="secondary" disabled={page>=(notes.data?.pages||1)} onClick={()=>setPage(p=>p+1)}>Later notes</button></div>}
  </details>}
  {section!=='discussion'&&!!d.limitations?.length&&<details><summary>Extraction limits</summary><ul>{d.limitations.map((x,i)=><li key={i}>{x}</li>)}</ul></details>}
 </section>;
}
export function MemoryStatus(){
 const {data:w}=useQuery({queryKey:['workspace'],queryFn:()=>api<Workspace>('/workspace')});
 const {data:s}=useQuery({queryKey:['enrichment-progress'],queryFn:()=>api<Counts>('/evidence/enrichment')});
 const retained=w?.articles.filter(a=>a.cloudRetention?.status==='succeeded'&&a.cloudRetention.revision===a.revision).length||0;
 return <section className="memory-status" aria-label="Source library and memory"><h3><Database size={17}/> What Lucid remembers</h3><div className="memory-stages"><div><strong>{s?number(s.total):'—'}</strong><span>source reports</span><small>Searchable evidence, not approved memory</small></div><div><strong>{w?number(w.articles.length):'—'}</strong><span>published local articles</span><small>Check each article’s review basis before reuse</small></div><div><strong>{w?number(retained):'—'}</strong><span>current articles retained in Cloud</span><small>Verified retention recorded by this workspace</small></div></div><p className="caption">Importing reports never sends them to Hindsight. Cloud retention and recall are explicit actions. These counts exclude connection tests, isolated pilots, older revisions and other bank contents.</p></section>;
}
