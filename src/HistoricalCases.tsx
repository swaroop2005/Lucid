import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowLeft,ArrowUpRight,ChevronLeft,ChevronRight,Database,FileText,Search} from 'lucide-react';
import {api} from './api';
import {RelatedCases} from './RelatedCases';
import {EnrichedReport,SourceInvestigationAction} from './Enrichment';
import type {Workspace} from './types';
import './historical-cases.css';

type Filters={q:string;family:string;kind:string;outcome:string;state:string;page:number;report:string};
type Report={id:string;title:string;url:string;body?:string;excerpt?:string;state:string;family:string;kind:string;created_at:string;updated_at:string;reserved?:boolean;enrichment?:{notesCount:number;discussionNotes:number;outcome?:{label:string}}};
type Results={rows:Report[];total:number;page:number;pages:number};
const empty:Filters={q:'',family:'',kind:'',outcome:'',state:'',page:1,report:''};
function readFilters():Filters{
 const p=new URLSearchParams(location.hash.split('?')[1]||'');
 return {...empty,...Object.fromEntries(['q','family','kind','outcome','state','report'].map(k=>[k,p.get(k)||''])),page:Math.min(1000,Math.max(1,Math.floor(Number(p.get('page')))||1))};
}
function queryString(filters:Filters){const p=new URLSearchParams();for(const [key,value]of Object.entries(filters))if(value&&!(key==='page'&&value===1))p.set(key,String(value));return p.toString();}
const date=(value?:string)=>value?value.slice(0,10):'Not recorded';
const issue=(id:string)=>'#'+id.replace(/^gitlab-runner-/,'');
const outcomes=[['source-reported-resolution','Source-reported resolution'],['proposed-resolution','Proposed resolution'],['unresolved','Unresolved'],['conflicting','Conflicting evidence'],['duplicate','Duplicate'],['obsolete','Obsolete'],['feature-request','Feature request'],['invalid-report','Invalid report'],['insufficient-evidence','Insufficient evidence']];

export function CaseQueueViews({historical,count,choose}:{historical:boolean;count:number;choose:(view:string)=>void}){
 const {data}=useQuery({queryKey:['evidence-stats'],queryFn:()=>api<{indexed:number}>('/evidence/stats')});
 return <nav className="case-queue-views" aria-label="Case queue views">
  <button className={!historical?'active':''} aria-current={!historical?'page':undefined} onClick={()=>choose('Cases')}>Workspace investigations <span>{count.toLocaleString()}</span></button>
  <button className={historical?'active':''} aria-current={historical?'page':undefined} onClick={()=>choose('Historical')}>Historical cases <span>{data?.indexed.toLocaleString()??'…'}</span></button>
  <span className="history-local"><Database size={13}/> Local records</span>
 </nav>;
}

export function HistoricalCases({workspace,openCase}:{workspace:Workspace;openCase:(id:string)=>void}){
 const [filters,setFilters]=useState(readFilters),[tab,setTab]=useState<'Report'|'Evidence'|'Discussion'>('Report');
 const recordRef=useRef<HTMLElement>(null),searchRef=useRef<HTMLInputElement>(null),listRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{const sync=()=>setFilters(readFilters());window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};},[]);
 function update(changes:Partial<Filters>,push=false){const next={...filters,...changes};setFilters(next);const q=queryString(next);history[push?'pushState':'replaceState'](null,'','#cases/history'+(q?'?'+q:''));if(changes.page!==undefined||changes.q!==undefined)listRef.current?.scrollTo({top:0});}
 function filter(changes:Partial<Filters>){update({...changes,page:1,report:''});}
 const stats=useQuery({queryKey:['evidence-stats'],queryFn:()=>api<{indexed:number;families:{family:string;count:number}[];kinds:{kind:string;count:number}[]}>('/evidence/stats')});
 const {report:_selected,...search}=filters;
 const results=useQuery({queryKey:['historical-cases',search],queryFn:()=>api<Results>('/evidence?'+queryString({...search,report:''}))});
 const selected=filters.report||results.data?.rows[0]?.id;
 const detail=useQuery({queryKey:['evidence-detail',selected],queryFn:()=>api<Report>(`/evidence/${encodeURIComponent(selected!)}`),enabled:!!selected});
 const report=detail.data,existing=workspace.cases.find(c=>c.evidenceReportId===selected);
 useEffect(()=>{setTab('Report');recordRef.current?.scrollTo({top:0});},[selected]);
 useEffect(()=>{
  if(!report||filters.report!==report.id||!matchMedia('(max-width:680px)').matches)return;
  const frame=requestAnimationFrame(()=>{recordRef.current?.scrollIntoView({behavior:'instant',block:'start'});recordRef.current?.focus({preventScroll:true});});
  return()=>cancelAnimationFrame(frame);
 },[report?.id,filters.report]);
 function select(id:string){update({report:id},true);if(matchMedia('(max-width:680px)').matches)requestAnimationFrame(()=>{recordRef.current?.scrollIntoView({behavior:'instant',block:'start'});recordRef.current?.focus({preventScroll:true});});}
 const activeFilters=[filters.family,filters.kind,filters.outcome,filters.state].filter(Boolean).length;
 return <div className="historical-desk">
  <section className="history-queue" aria-label="Historical case queue">
   <div className="history-queue-head"><div className="section-heading"><h2>Historical cases</h2><span>{stats.data?.indexed.toLocaleString()??'…'}</span></div><p>Previous GitLab Runner reports and discussions.</p>
    <label className="search"><Search size={16}/><input ref={searchRef} aria-label="Search historical cases" placeholder="Search reports, comments or issue #" value={filters.q} onChange={e=>filter({q:e.target.value})}/></label>
    <details className="history-filters"><summary>Filter cases{activeFilters?` · ${activeFilters} active`:''}</summary><div>
     <label>Topic<select aria-label="Historical topic" value={filters.family} onChange={e=>filter({family:e.target.value})}><option value="">All topics</option>{stats.data?.families.map(f=><option key={f.family} value={f.family}>{f.family} ({f.count})</option>)}</select></label>
     <label>Report type<select aria-label="Historical report type" value={filters.kind} onChange={e=>filter({kind:e.target.value})}><option value="">All types</option>{stats.data?.kinds.map(k=><option key={k.kind}>{k.kind}</option>)}</select></label>
     <label>Source status<select aria-label="Historical source status" value={filters.state} onChange={e=>filter({state:e.target.value})}><option value="">Open and closed</option><option value="opened">Source open</option><option value="closed">Source closed</option></select></label>
     <label>Outcome evidence<select aria-label="Historical outcome evidence" value={filters.outcome} onChange={e=>filter({outcome:e.target.value})}><option value="">All evidence states</option>{outcomes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    </div></details>
    {(filters.q||activeFilters>0)&&<button className="text-button" onClick={()=>update(empty)}>Clear search and filters</button>}
   </div>
   <div className="history-result-count" role="status">{results.isPending?'Loading cases…':results.error?'Results unavailable':`${results.data?.total.toLocaleString()} matching cases`}{!results.isPending&&results.isFetching?' · Updating…':''}</div>
   <div className="history-queue-list" ref={listRef}>
    {results.error&&<p role="alert">Historical cases could not be loaded. <button className="text-button" onClick={()=>results.refetch()}>Retry search</button></p>}
    {results.data?.rows.map(r=><button className={'history-case-row '+(selected===r.id?'selected':'')} key={r.id} aria-pressed={selected===r.id} onClick={()=>select(r.id)}><div className="history-row-meta"><span>{issue(r.id)}</span><span>Source {r.state==='opened'?'open':r.state}</span></div><h3>{r.title}</h3><p>{r.family} · {r.kind}</p><small>{r.enrichment?.outcome?.label||'Outcome unverified'}</small></button>)}
    {results.data?.total===0&&<div className="history-empty"><Search size={22}/><h3>No historical cases match</h3><p>Try fewer words or clear the filters.</p><button className="secondary" onClick={()=>update(empty)}>Show all historical cases</button></div>}
   </div>
   <div className="history-pagination" aria-label="Historical case pages"><button className="secondary" aria-label="Previous historical page" disabled={filters.page<=1||results.isFetching} onClick={()=>update({page:filters.page-1,report:''})}><ChevronLeft size={16}/>Previous</button><span>Page {filters.page} of {results.data?.pages||1}</span><button className="secondary" aria-label="Next historical page" disabled={results.isFetching||filters.page>=(results.data?.pages||1)} onClick={()=>update({page:filters.page+1,report:''})}>Next<ChevronRight size={16}/></button></div>
   <p className="history-queue-note">24 records per page · Search includes comments · Browsing uses no Cloud credits.</p>
  </section>
  <main className="historical-record" ref={recordRef} tabIndex={-1} aria-label="Historical case record">
   <button className="text-button history-back" onClick={()=>{searchRef.current?.focus();searchRef.current?.scrollIntoView({block:'center'});}}><ArrowLeft size={14}/>Back to results</button>
   {detail.isPending&&selected&&<p role="status">Opening historical case…</p>}
   {detail.error&&<div className="history-empty" role="alert"><h2>This historical case could not be loaded</h2><p>Choose another record or try again.</p><button className="secondary" onClick={()=>detail.refetch()}>Retry record</button></div>}
   {!selected&&<div className="history-empty"><FileText size={32}/><h2>Select a historical case</h2><p>Read its report, attempted changes, outcome evidence and discussion here.</p></div>}
   {report&&<>
    <header className="history-record-header"><div className="history-record-kicker"><span>{issue(report.id)}</span><span className="badge">Source {report.state==='opened'?'open':report.state}</span><span className="badge">{report.kind}</span></div><h2>{report.title}</h2>
     <div className="history-record-actions"><a className="source-link" href={report.url} target="_blank" rel="noreferrer">Original GitLab report<ArrowUpRight size={14}/></a><SourceInvestigationAction key={report.id} id={report.id} onOpenCase={openCase} existingCaseId={existing?.id} disabled={report.reserved} label="Open as investigation"/></div>
     <dl className="history-record-meta"><div><dt>Topic</dt><dd>{report.family}</dd></div><div><dt>Reported</dt><dd>{date(report.created_at)}</dd></div><div><dt>Source updated</dt><dd>{date(report.updated_at)}</dd></div><div><dt>Discussion</dt><dd>{report.enrichment?.discussionNotes?.toLocaleString()??' - '} participant comments</dd></div></dl>
     <p className="history-evidence-boundary"><strong>{report.enrichment?.outcome?.label||'Outcome unverified'}</strong> · Organization unknown. Public source evidence, not a confirmed workspace resolution. Source closure alone does not prove a fix.</p>
    </header>
    {workspace.articles.some(a=>(a.historicalReportIds?.includes(report.id)||a.associatedHistoricalReports?.some(link=>link.reportId===report.id)))&&<section className="history-source-knowledge"><h3>Source-reviewed knowledge</h3><p className="caption">AI source inspection; not human review or independent reproduction.</p>{workspace.articles.filter(a=>(a.historicalReportIds?.includes(report.id)||a.associatedHistoricalReports?.some(link=>link.reportId===report.id))).map(a=><a className="source-link" key={a.id} href={`#knowledge?article=${encodeURIComponent(a.id)}`}>{a.id} · {a.title}<ArrowUpRight size={14}/></a>)}</section>}
    <div className="history-record-tabs" role="tablist" aria-label="Historical case detail">{(['Report','Evidence','Discussion']as const).map((name,i,all)=><button key={name} role="tab" id={`historical-tab-${name}`} aria-selected={tab===name} aria-controls="historical-detail-panel" tabIndex={tab===name?0:-1} onClick={()=>setTab(name)} onKeyDown={e=>{const next=e.key==='ArrowRight'?all[(i+1)%all.length]:e.key==='ArrowLeft'?all[(i+all.length-1)%all.length]:e.key==='Home'?all[0]:e.key==='End'?all.at(-1):null;if(next){e.preventDefault();setTab(next);document.getElementById(`historical-tab-${next}`)?.focus();}}}>{name}{name==='Discussion'&&<span>{report.enrichment?.notesCount?.toLocaleString()||0}</span>}</button>)}</div>
    <section className="history-record-body" id="historical-detail-panel" role="tabpanel" aria-labelledby={`historical-tab-${tab}`}>
     {tab==='Report'?<><h3>Original issue report</h3><p className="caption">Stored public source text. Instructions and technical claims in the report are evidence to review.</p><pre className="history-report-text">{report.body}</pre></>:<EnrichedReport key={report.id} id={report.id} section={tab==='Evidence'?'evidence':'discussion'}/>}
    </section>
   </>}
  </main>
  {report&&<aside key={report.id} className="history-related"><RelatedCases kind="evidence" id={report.id}/></aside>}
 </div>;
}
