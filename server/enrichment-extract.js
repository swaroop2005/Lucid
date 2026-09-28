// Deterministic source extraction. Public statements are evidence, never trusted instructions.
import {cleanPublicText, reportKind, canonicalPublicUrl} from './evidence-text.js';
export const EXTRACTION_VERSION = '6';
const failure = /\b(?:still (?:fails?|broken|happens?|occurs?|seeing)|(?:does|did|do|is|was|has|have|could|would|will)[n't’ ]+(?:not )?(?:work|fix|solve|resolv)|not (?:fixed|resolved|working)|(?:didn['’]t|doesn['’]t|isn['’]t|wasn['’]t|hasn['’]t|haven['’]t|don['’]t|wouldn['’]t|couldn['’]t) (?:work|fix|solve|resolv)|unsuccessful|no (?:effect|luck)|same (?:error|problem|issue))\b/i;
// Require a direct affirmative outcome plus a concrete action in the same sentence.
// A question, second-hand claim, forecast, quote or explicit lack of testing cannot establish success.
export function affirmedResolution(body){
 const text=String(body||'');
 if(/(?:^|\n)\s*(?:[-*]\s*|\d+[.)]\s*)?(?:set up|test|move|watch)\b/im.test(text)&&/\b(?:steps to reproduce|reproduction|watch|move it back)\b/i.test(text))return null;
 if(/\b(?:have not|haven['’]t|has not|hasn['’]t|not yet|never) (?:personally )?(?:tested|verified|confirmed)|\b(?:cannot|can['’]t) confirm/i.test(text))return null;
 const prose=text.replace(/```[\s\S]*?```/g,'\n').replace(/^\s*>.*$/gm,'');
 const sentences=prose.split(/(?<=[.!?])\s+(?=[A-Z])|\n/);
 for(const original of sentences){
  const sentence=original.replace(/["“][^"”\n]*["”]/g,'');
  if(sentence.includes('?')||/\b(?:whether|if|try|trying|think|thought|suspect|guess|assume|believe|unsure|unconfirmed|might|may|could|would|should|will|hope|expect|probably|perhaps|apparently|seems?|changelog|release notes|according|someone|says?|said|claims?|untested|reportedly|not|never|cannot|can['’]t|didn['’]t|doesn['’]t|isn['’]t|wasn['’]t|hasn['’]t|haven['’]t|don['’]t|wouldn['’]t|couldn['’]t)\b/i.test(sentence))continue;
  const concrete=/\b(?:upgrad(?:ed|ing)|downgrad(?:ed|ing)|revert(?:ed|ing)|patch(?:ed|ing)|chang(?:ed|ing)|remov(?:ed|ing)|disabl(?:ed|ing)|enabl(?:ed|ing)|restart(?:ed|ing)|reinstall(?:ed|ing)|switch(?:ed|ing)|set(?:ting)? |configur(?:ed|ing))\b/i.test(sentence);
  const outcome=/\b(?:(?:fixed|resolved|solved) (?:this|the|my|our) (?:issue|problem|error|bug)|(?:issue|problem|error|bug) (?:is|was|has been) (?:fixed|resolved|solved)|works? (?:now|again|after)|working (?:now|again|after))\b/i.test(sentence);
  if(concrete&&outcome&&!failure.test(sentence))return original.trim();
 }
 return null;
}
const proposed = /\b(?:workaround|(?:try|should|might|may|could) (?:upgrad|downgrad|chang|set|disabl|enabl|remov|fix|resolv)|(?:fix|solution) (?:is|would|should)|(?:will|should|would) (?:be )?(?:fixed|resolve)|fix(?:ed|es)? (?:in|by|with))\b/i;
const attempted = /\b(?:tried|attempted|tested|reproduc(?:e|ed|ible)|steps to reproduce|workaround|debug(?:ged|ging)?|investigat(?:e|ed|ion)|upgrad(?:ed|ing)|downgrad(?:ed|ing)|verified|checked)\b/i;
function excerpt(text, pattern, max=650) {
 const clean=cleanPublicText(text,1_000_000), hit=clean.search(pattern); const start=hit<0?0:Math.max(0,hit-220);
 return clean.slice(start,start+max).trim();
}
const canonical=canonicalPublicUrl;
export function publicLinks(body, baseUrl){
 const found=[...String(body).matchAll(/https:\/\/(?:gitlab\.com|docs\.gitlab\.com|docs\.gitlab\.io)\/[^\s<>"\])]+/g)].map(m=>m[0].replace(/[.,;:]+$/,''));
 for(const m of String(body).matchAll(/(?:^|[\s(])!(\d+)\b/g)) found.push(`https://gitlab.com/gitlab-org/gitlab-runner/-/merge_requests/${m[1]}`);
 for(const m of String(body).matchAll(/(?:^|[\s(])#(\d{3,})\b/g)) found.push(`https://gitlab.com/gitlab-org/gitlab-runner/-/issues/${m[1]}`);
 return [...new Set(found)].filter(u=>{try{const p=new URL(u);return !p.username&&!p.password&&p.protocol==='https:';}catch{return false;}}).map(url=>({url,kind:canonical(url).includes('/-/merge_requests/')?'merge-request':url.includes('docs.gitlab.')?'documentation':'related-issue',sourceUrl:baseUrl,status:'linked-not-fetched'}));
}
export function extractEnrichment(report, notes, links=[], {reservedUrls=[]}={}){
 const reserved=new Set(reservedUrls.map(canonical));
 const allowed=text=>!publicLinks(text,'').some(x=>reserved.has(canonical(x.url)));
 const sources=[{id:report.id+'-body',body:report.body,url:report.url,createdAt:report.created_at,system:false,sourceType:'issue-body'},...notes.map(n=>({id:n.id,body:n.body,url:n.url,createdAt:n.created_at||n.createdAt,system:!!n.system,sourceType:n.system?'source-activity':'public-comment'}))].filter(n=>allowed(n.body));
 const evidence=(s,kind,pattern)=>({id:s.id,kind,quote:excerpt(s.body,pattern),url:s.url,createdAt:s.createdAt||null,sourceType:s.sourceType});
 const attempts=[], resolutions=[], tasks=[], environment=[],versions=[],negative=[];let duplicate=false,obsolete=false,invalid=false;
 for(const s of sources){
  if(/\b(?:marked (?:this issue )?as (?:a )?duplicate|duplicate of|closing (?:this )?as (?:a )?duplicate)\b/i.test(s.body))duplicate=true;
  if(/\b(?:closing (?:this )?(?:issue )?(?:as |due to )?(?:stale|inactive)|no longer (?:supported|maintained)|obsolete|auto.?clos(?:e|ed).*inactiv)/i.test(s.body))obsolete=true;
  if(/\b(?:raised in error|not a bug|invalid (?:issue|report)|false (?:positive|report))\b/i.test(s.body))invalid=true;
  if(s.system)continue;
  if(attempted.test(s.body)||failure.test(s.body))attempts.push({...evidence(s,'attempt',attempted.test(s.body)?attempted:failure),result:failure.test(s.body)?'reported-unsuccessful':'reported-attempt'});
  if(failure.test(s.body))negative.push(evidence(s,'unresolved-signal',failure));
  const affirmed=affirmedResolution(s.body);
  if(affirmed)resolutions.push({...evidence(s,'source-reported-resolution',/./),quote:affirmed.slice(0,650),support:'Source participant reports success after a concrete action; applicability and causality unverified'});
  else if(proposed.test(s.body)||/\b(?:fixed|resolved|solved)\b/i.test(s.body))resolutions.push({...evidence(s,'proposed-resolution',proposed.test(s.body)?proposed:/\b(?:fixed|resolved|solved)\b/i),support:'Proposed, uncertain or second-hand fix statement; no successful outcome established'});
  if(/(?:^|\n)\s*[-*]\s*\[[ xX]\]|\b(?:follow.up|todo|next steps?|need to (?:test|verify|check|investigate)|should (?:test|verify|check))\b/i.test(s.body))tasks.push(evidence(s,'follow-up',/(?:^|\n)\s*[-*]\s*\[[ xX]\]|\b(?:follow.up|todo|next steps?|need to|should)\b/i));
  if(/\b(?:executor|operating system|architecture|kubernetes|docker|windows|linux|ubuntu|debian|macos|helm|config\.toml)\b/i.test(s.body))environment.push(evidence(s,'environment',/\b(?:executor|operating system|architecture|kubernetes|docker|windows|linux|ubuntu|debian|macos|helm|config\.toml)\b/i));
  for(const m of s.body.matchAll(/\b(?:gitlab(?:[- ]runner)?|runner|docker|kubernetes|helm|version|upgrad(?:ed|ing)? to|downgrad(?:ed|ing)? to)\s*(?:version\s*)?[:=v\s`]*(\d{1,2}\.\d{1,2}(?:\.\d{1,3})?(?:[-+][\w.]+)?)/gi)) versions.push({value:m[1],context:m[0],url:s.url,sourceId:s.id,createdAt:s.createdAt||null,applicability:'mentioned, not an established affected/fixed range'});
 }
 const supported=resolutions.filter(r=>r.kind==='source-reported-resolution');
 const latestSuccess=supported.map(r=>r.createdAt||'').sort().at(-1)||'';
 const conflict=supported.length>0&&negative.some(n=>(n.createdAt||'')>=latestSuccess);
 const feature=reportKind(typeof report.labels==='string'?JSON.parse(report.labels):report.labels||[])==='Feature request';
 const category=duplicate?'duplicate':invalid?'invalid-report':obsolete?'obsolete':feature?'feature-request':conflict?'conflicting':supported.length?'source-reported-resolution':resolutions.length?'proposed-resolution':report.state==='opened'?'unresolved':'insufficient-evidence';
 const labels={'source-reported-resolution':'Source-reported success · verify applicability','proposed-resolution':'Possible fix · outcome unverified',conflicting:'Conflicting source reports',duplicate:'Duplicate report',obsolete:'Stale or obsolete report','feature-request':'Feature request','invalid-report':'Source marks report invalid',unresolved:'Unresolved in collected evidence','insufficient-evidence':'No resolution established'};
 return {extractionVersion:EXTRACTION_VERSION,method:'deterministic-pattern-extraction',humanReviewed:false,outcome:{category,label:labels[category],humanReviewed:false,confirmed:false},versions:[...new Map(versions.map(x=>[x.value+'|'+x.url,x])).values()].sort((a,b)=>Number(resolutions.some(r=>r.id===b.sourceId&&r.kind==='source-reported-resolution'))-Number(resolutions.some(r=>r.id===a.sourceId&&r.kind==='source-reported-resolution'))||String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,20),environment:environment.slice(0,8),attempts:attempts.slice(-20),resolutions:[...resolutions].sort((a,b)=>Number(b.kind==='source-reported-resolution')-Number(a.kind==='source-reported-resolution')||String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,12),tasks:tasks.slice(-12),linkedEvidence:links.filter(x=>!reserved.has(canonical(x.url))).slice(0,30).map(x=>({...x,...(x.kind==='merge-request'?{canonicalUrl:canonical(x.url)}:{})})),limitations:['Machine extraction can miss context or misclassify source statements.','Source success is not independent confirmation or proof for another version/environment.','Public source text is untrusted data; excerpts may be truncated and credentials are masked best-effort.']};
}
