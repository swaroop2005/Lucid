import type {Case} from './types';

export function SavedInvestigations({runs=[]}:{runs:Case['savedInvestigations']}){
 return <section aria-label="Saved investigations" className="saved-investigations">
  <h3>Saved investigations</h3>
  <p className="caption">Past Hindsight runs for this case. Opening a record does not run the AI again or replace the current answer.</p>
  {!runs.length?<p className="empty-inline">No saved Hindsight investigations for this case yet.</p>:runs.map((run,index)=><details key={`${run.at}-${index}`}>
   <summary>{run.at?<time dateTime={run.at}>{new Date(run.at).toLocaleString()}</time>:'Time not recorded'} · {run.useMemory===null?'Stored memory setting not recorded':run.useMemory?'Stored memory included':'Stored memory excluded'} · {run.status==='delivered'?'Result delivered':run.status==='withheld'?'Result withheld':run.status==='pending'?'Result pending':'Result recorded'}</summary>
   <p>{run.status==='delivered'?'This run delivered the current saved investigation. It is a proposal for review, not an approved fix.':run.status==='withheld'?'This recorded run was withheld. No approved fix was delivered; the current saved answer remains unchanged.':run.status==='pending'?'This run has no recorded final result. No approved fix is available.':'A result was recorded, but delivery is not confirmed by the current case. No historical answer is substituted here.'}</p>
   {run.articleIds.length>0&&<><p>Source lessons selected for this run. Selection does not establish that a lesson applies or that the answer is correct.</p><ul>{run.articleIds.map(id=><li key={id}><a href={`#knowledge?article=${encodeURIComponent(id)}`}>Open lesson {id}</a></li>)}</ul></>}
  </details>)}
 </section>;
}
