import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readDataset} from './fetch-dataset.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const fail=message=>{throw Error(message);};
const exact=(row,keys)=>Object.keys(row).length===keys.length&&keys.every(k=>Object.hasOwn(row,k));
export function verifySupportData(root=process.cwd()){
 const base=join(root,'data/public-dataset');
 const reports=readDataset(join(base,'reports.jsonl'),join(base,'manifest.json'));
 const ids=new Set(reports.map(r=>r.id)),meta=json(join(base,'discussion-manifest.json'));
 if(meta.schemaVersion!==1||meta.project!=='gitlab-org/gitlab-runner'||meta.containsNoteText!==false||meta.containsKnowledgeArticles!==false)fail('Unexpected discussion manifest.');
 const seen=new Set(),counts=new Map();let noteCount=0;
 for(const part of meta.parts){
  if(!/^discussions\/part-\d{3}\.jsonl$/.test(part.file))fail('Invalid discussion path.');
  const bytes=readFileSync(join(base,part.file));
  if(sha(bytes)!==part.sha256||bytes.length!==part.bytes)fail('Discussion checksum mismatch.');
  const rows=bytes.toString('utf8').trim().split('\n').map(JSON.parse);
  if(rows.length!==part.records)fail('Discussion part count mismatch.');
  for(const row of rows){
   if(!exact(row,['noteId','reportId','url','createdAt','updatedAt','textWasTruncatedLocally'])||!ids.has(row.reportId)||!Number.isSafeInteger(row.noteId)||row.noteId<=0||typeof row.textWasTruncatedLocally!=='boolean'||![row.createdAt,row.updatedAt].every(t=>typeof t==='string'&&Number.isFinite(Date.parse(t))))fail('Invalid discussion metadata.');
   const iid=row.reportId.replace('gitlab-runner-','');
   if(!['issues','work_items'].some(kind=>row.url===`https://gitlab.com/gitlab-org/gitlab-runner/-/${kind}/${iid}#note_${row.noteId}`)||seen.has(row.noteId))fail('Invalid or duplicate discussion identity.');
   seen.add(row.noteId);counts.set(row.reportId,(counts.get(row.reportId)||0)+1);noteCount++;
  }
 }
 if(noteCount!==meta.records||counts.size!==meta.reportsWithDiscussion)fail('Discussion total mismatch.');
 if(meta.coverage.file!=='discussion-coverage.jsonl')fail('Invalid coverage path.');
 const coverageBytes=readFileSync(join(base,meta.coverage.file));
 if(sha(coverageBytes)!==meta.coverage.sha256)fail('Coverage checksum mismatch.');
 const coverage=coverageBytes.toString('utf8').trim().split('\n').map(JSON.parse),covered=new Set();let all=0;
 for(const row of coverage){
  if(!exact(row,['reportId','collectedNotes','indexedDiscussionNotes','collectorStatus'])||!ids.has(row.reportId)||covered.has(row.reportId)||!Number.isSafeInteger(row.collectedNotes)||row.collectedNotes<(counts.get(row.reportId)||0)||row.indexedDiscussionNotes!==(counts.get(row.reportId)||0)||row.collectorStatus!=='completed')fail('Invalid collection coverage.');
  covered.add(row.reportId);all+=row.collectedNotes;
 }
 if(coverage.length!==reports.length||coverage.length!==meta.coverage.records||all!==meta.allCollectedNotes||all-noteCount!==meta.excludedSystemNotes)fail('Coverage totals mismatch.');
 const docsRoot=join(root,'data/public-reference-docs'),docsMeta=json(join(docsRoot,'manifest.json')),indexBytes=readFileSync(join(docsRoot,'index.json'));
 if(docsMeta.license!=='CC-BY-SA-4.0'||sha(indexBytes)!==docsMeta.indexSha256)fail('Documentation manifest mismatch.');
 const records=JSON.parse(indexBytes),pages=[];const names=new Set();
 for(const row of records){
  if(!/^\d+\.\d+\.\d+(?:-rc\d+)?$/.test(row.version)||!row.path.startsWith('/runner/')||!row.sourceUrl.startsWith(`https://gitlab.com/gitlab-org/gitlab-runner/-/raw/v${row.version}/docs/`))fail('Invalid documentation source.');
  if(row.status!=='available')continue;
  if(typeof row.file!=='string'||basename(row.file)!==row.file||!/^\d[^/\\]*\.md$/.test(row.file)||names.has(row.file))fail('Invalid documentation path.');
  names.add(row.file);const bytes=readFileSync(join(docsRoot,'pages',row.file));
  if(sha(bytes)!==row.sha256||bytes.length!==row.bytes||!/^[a-f0-9]{64}$/.test(row.sourceSha256))fail('Documentation checksum mismatch.');
  pages.push({file:row.file,bytes});
 }
 if(records.length!==docsMeta.records||pages.length!==docsMeta.available||records.length-pages.length!==docsMeta.unavailable)fail('Documentation total mismatch.');
 return {reports:reports.length,discussionNotes:noteCount,documentationPages:pages.length,documentationVersions:docsMeta.versions.length,records,pages};
}

export function installDocs(bundle,target){
 const outputs=[...bundle.pages.map(p=>({path:join(target,'versioned-docs',p.file),bytes:p.bytes})),{path:join(target,'versioned-docs.json'),bytes:Buffer.from(JSON.stringify(bundle.records,null,2)+'\n')}];
 // Validate every existing destination before writing anything. Preserve local data.
 for(const item of outputs)if(existsSync(item.path)&&sha(readFileSync(item.path))!==sha(item.bytes))fail('Existing local documentation differs; no files overwritten. Use a clean checkout or move the old cache aside.');
 mkdirSync(join(target,'versioned-docs'),{recursive:true});
 for(const item of outputs)if(!existsSync(item.path))writeFileSync(item.path,item.bytes,{flag:'wx'});
 return bundle.pages.length;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2);if(args.some(a=>a!=='--install-docs'))fail('Usage: npm run dataset:verify -- [--install-docs]');
  const bundle=verifySupportData();
  if(args.includes('--install-docs'))installDocs(bundle,resolve('data'));
  console.log(JSON.stringify({reports:bundle.reports,discussionNotes:bundle.discussionNotes,documentationPages:bundle.documentationPages,documentationVersions:bundle.documentationVersions,installed:args.includes('--install-docs'),networkRequests:0,cloudWrites:0}));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
