// Public source text is data, never executable instructions or confirmed advice.
export function cleanPublicText(value,maxLength=24000){return String(value||'')
 .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,'[private key removed]')
 .replace(/\b(?:glpat-|glrt-|ghp_|github_pat_|sk-)[A-Za-z0-9_-]{10,}\b/g,'[credential removed]')
 .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,'[access key removed]')
 .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\b/g,'[token removed]')
 .replace(/((?:password|passwd|api[_-]?key|access[_-]?token|private[_-]?token|secret[_-]?key|authorization)\s*[:=]\s*["']?)(?:Bearer\s+|Basic\s+)?[^\s"'<>[]{6,}/gi,'$1[credential removed]')
 .replace(/(https?:\/\/)[^\s/:]+:[^\s/@]+@/gi,'$1[credentials removed]@')
 .replace(/[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,63}/gi,'[email removed]').slice(0,maxLength);}
export function reportKind(labels){const text=labels.join(' ').toLowerCase();return /type::bug|bug::|\bbug\b/.test(text)?'Bug report':/type::feature|feature proposal|enhancement/.test(text)?'Feature request':/support request|support_backlog/.test(text)?'Support request':'Unclassified report';}
export function retrievalTerms(value){const allowed=new Set('artifact artifacts upload uploads uploading download downloads downloading cache caching cached permission permissions denied forbidden unauthorized authentication token registration register restart restarts restarting liveness readiness probetimeoutseconds timeout timed deadline network dns resolve hostname certificate x509 authority tls ssl webhook admission scheduler scheduling pending kubernetes docker container registry pull image windows powershell pwsh bash shell profile logout oom memory disk cpu resource quota helm upgrade config configuration postgres mysql backup restore consul calico retry retries backoff'.split(' '));return [...new Set(String(value).toLowerCase().match(/[a-z][a-z0-9]+/g)||[])].filter(x=>allowed.has(x)).slice(0,10);}

// Identity only: callers retain the original URL as the source citation.
export function canonicalPublicUrl(value){
 try{const u=new URL(String(value));const match=u.hostname==='gitlab.com'&&u.pathname.match(/^(.+?)(?:\/-)?\/(issues|work_items|merge_requests)\/(\d+)(?![\w-]).*$/);
 if(match)return `${u.origin}${match[1]}/-/${match[2]==='work_items'?'issues':match[2]}/${match[3]}`;
 u.hash='';u.search='';return u.href.replace(/\/$/,'');
 }catch{return String(value||'').split('#')[0].split('?')[0].replace(/\/$/,'');}
}
