import {useQuery} from '@tanstack/react-query';
import {ArrowRight,Search} from 'lucide-react';
import {api} from './api';

type Result={id:string;title:string;excerpt:string;family:string;kind:string;state:string;outcome:string;applicability:{executor:string;version:string}};
type Results={rows:Result[];query:string;reason?:string};

export function RelatedCases({kind,id,context=''}:{kind:'cases'|'evidence';id:string;context?:string}){
 const {data,isPending,error,refetch}=useQuery({queryKey:['related-cases',kind,id,context],queryFn:({signal})=>api<Results>(`/${kind}/${encodeURIComponent(id)}/related`,'GET',undefined,signal),staleTime:30000});
 return <section className="related-cases" aria-label="Related prior cases" data-case-id={id}>
  <div className="related-cases-heading"><Search size={16}/><h2>Related prior cases</h2></div>
  <p className="related-cases-intro">Similar reports across organizations. Check the version and evidence before applying a fix.</p>
  {isPending&&<p className="related-cases-state" role="status">Finding related cases…</p>}
  {error&&<p className="related-cases-state" role="alert">Related cases could not be loaded. <button className="text-button" onClick={()=>refetch()}>Try again</button></p>}
  {!error&&data&&<>
   {data.rows.length?<ol className="related-case-results">{data.rows.map(r=><li key={r.id}>
    <div className="related-case-source">GitLab Runner · #{r.id.replace(/^gitlab-runner-/,'')} · Source {r.state==='opened'?'open':r.state}</div>
    <a className="related-case-title" href={`#cases/history?report=${encodeURIComponent(r.id)}`}>{r.title}</a>
    <p className="related-case-excerpt">{r.excerpt}</p>
    <div className="related-case-context">{r.family} · {r.kind}</div>
    <div className="related-case-outcome">{r.outcome}</div>
    <small>{r.applicability.executor!=='Executor not specified'&&<>{r.applicability.executor}. </>}{r.applicability.version}.</small>
   </li>)}</ol>:<p className="related-cases-state">{data.reason||'No close matches yet. Try the exact error or a broader term in search.'}</p>}
   {!data.reason&&<p className="related-cases-footnote">Public evidence · outcomes are not independently confirmed.</p>}
  </>}
  <a className="related-cases-search" href={'#cases/history'+(data?.query?'?q='+encodeURIComponent(data.query):'')}>Search historical cases<ArrowRight size={14}/></a>
 </section>;
}
