import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cleanPublicText} from './evidence-text.js';

export function cachedDocs(){try{return JSON.parse(readFileSync(new URL('../data/versioned-docs.json',import.meta.url),'utf8'));}catch{return [];}}
const slug=text=>text.toLowerCase().replace(/[`*]/g,'').replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');
export function versionedReference(reference,context={},records=cachedDocs(),readCachedFile=file=>readFileSync(new URL('../data/versioned-docs/'+file,import.meta.url),'utf8')){
 const path=new URL(reference.url).pathname;
 if(!path.startsWith('/runner/'))return {...reference,versionStatus:'current-reference',versions:`Current GitLab documentation. Server version ${context.serverVersion||'unknown'} has not been verified against an archived copy.`};
 const version=String(context.runnerVersion||'').replace(/^v/,'');
 const record=records.find(r=>r.version===version&&r.path===path&&r.status==='available');
 if(!record)return {...reference,versionStatus:version?'version-unavailable':'version-unknown',versions:version?`Current reference only. No cached documentation for Runner ${version}; verify applicability before following this guidance.`:'Runner version is unknown. Establish it before applying version-specific guidance.'};
 let text;try{text=readCachedFile(record.file);}catch{return {...reference,versionStatus:'version-unavailable',versions:`The cached source for Runner ${version} is unavailable. Current reference only.`};}
 if(createHash('sha256').update(text).digest('hex')!==record.sha256)return {...reference,versionStatus:'integrity-failed',versions:`The cached Runner ${version} document failed its integrity check. Current reference only.`};
 const anchor=new URL(reference.url).hash.slice(1);
 const sections=text.split(/(?=^#{1,6} )/m);
 let section=anchor?sections.find(s=>slug(s.split('\n')[0].replace(/^#+\s*/,''))===anchor):sections.find(s=>s.startsWith('# '));
 if(!section)return {...reference,versionStatus:'section-unavailable',versionUrl:record.sourceUrl,versions:`Runner ${version} source is cached, but this section was not found. The summary below describes current documentation.`};
 section=section.replace(/^---[\s\S]*?---\s*/,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1');
 return {...reference,url:record.sourceUrl+(anchor?'#'+anchor:''),currentUrl:reference.url,summary:cleanPublicText(section).slice(0,700),evidenceText:cleanPublicText(section,Infinity),versionStatus:'exact-version',versions:`Tagged GitLab Runner ${version} source; verify platform, feature flags and configuration.`,status:'Version-matched official source; not a confirmed fix',versionEvidence:{version,sha256:record.sha256,fetchedAt:record.fetchedAt}};
}
