// Explicit display allowlist. Never expose the provider journal or withheld advice.
export function savedInvestigations(state,caseRecord){
 const articleIds=new Set((state.articles||[]).map(article=>article.id));
 return (state.hindsightInvestigations||[]).filter(run=>run?.caseId===caseRecord.id)
  .map(run=>{
   const at=typeof run.at==='string'&&Number.isFinite(Date.parse(run.at))?new Date(run.at).toISOString():null;
   const delivered=typeof run.id==='string'&&run.id.length>0&&run.status==='succeeded'&&!!run.result&&caseRecord.analysis?.modelResult?.investigationId===run.id;
   const status=delivered?'delivered':run.status==='succeeded'?'recorded':['prepared','dispatched','awaiting-audit'].includes(run.status)?'pending':'withheld';
   return {at,useMemory:typeof run.useMemory==='boolean'?run.useMemory:null,status,articleIds:run.useMemory===true&&Array.isArray(run.selectedArticleIds)?[...new Set(run.selectedArticleIds.filter(id=>typeof id==='string'&&/^KA-\d+$/.test(id)&&articleIds.has(id)))]:[]};
  }).sort((a,b)=>(b.at||'').localeCompare(a.at||'')).slice(0,20);
}
