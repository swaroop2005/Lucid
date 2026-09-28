import {createHash} from 'node:crypto';
import {prepareOfficialDocument,prepareOfficialDocumentRetention,verifyOfficialDocumentScope} from '../../server/hindsight-documents.js';
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
export function officialDocumentFixture({workspaceId='official-display-test',connectionId='official-display-connection'}={}){
 const sectionText='## Verify the certificate chain\n\nInspect the full chain for this exact Runner version.\n\n<img src="official-doc-inert" onerror="window.officialDocExecuted=true">\n<script>window.officialDocExecuted=true</script>\n\nDo not disable certificate verification.';
 const sourceText='# Synthetic offline documentation fixture\n\n'+sectionText+'\n\n## Other section\n\nNot selected.\n';
 const input={id:'DOC-TEST-19-3-0-TLS',revision:1,kind:'official-document',title:'Exact-version certificate chain guidance',url:'https://gitlab.com/gitlab-org/gitlab-runner/-/blob/v19.3.0/docs/configuration/tls-self-signed.md',component:'runner',version:'19.3.0',sourceRef:'v19.3.0',sourceCommit:'a'.repeat(40),sourcePath:'docs/configuration/tls-self-signed.md',sectionHeading:'Verify the certificate chain',sectionText,sectionHash:sha(sectionText),sourceHash:sha(sourceText),retrievedAt:'2026-09-28T00:00:00Z',executor:'Any',hosting:'Self-managed'};
 const document=prepareOfficialDocument(input,{sourceText}),scope='lucid-workspace-'+workspaceId,plan=prepareOfficialDocumentRetention(document,{scope});
 document.cloudRetention={connectionId,status:'succeeded',documentHash:document.fingerprint,revision:1,docId:plan.docId,contentHash:plan.contentHash,packetHash:plan.packetHash,response:{privateAudit:'PRIVATE_OFFICIAL_RETAIN_RESPONSE'}};
 document.cloudScope=verifyOfficialDocumentScope(document,{id:plan.docId,original_text:plan.packet.content,tags:plan.packet.tags,document_metadata:plan.packet.metadata,memory_unit_count:1},{connectionId,scope,verifiedAt:'2026-09-28T00:01:00Z'});
 const publicDocument=Object.fromEntries(['id','title','url','component','version','sectionHeading','sectionText','executor','hosting','sourceHash','sectionHash','sourceRef','sourceCommit','retrievedAt'].map(key=>[key,document[key]]));publicDocument.cloudVerified=true;
 const record={factId:'official-test-fact',sourceId:document.id,sourceType:'official-document',officialDocumentId:document.id,revision:1,documentHash:document.fingerprint,documentId:plan.docId,version:document.version,url:document.url,type:'world',text:'Inspect the complete certificate chain for Runner 19.3.0.'};
 return {document,publicDocument,record,plan,scope,connectionId};
}
