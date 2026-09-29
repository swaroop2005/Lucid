import {test,expect} from '@playwright/test';

test('conditional investigation exposes original evidence without presenting an audited fix',async({page})=>{
 const state=await (await page.request.get('/api/workspace')).json(),c=state.cases.find(c=>c.id==='CS-1042');
 c.analysis={useMemory:true,provider:'Hindsight evidence plan',at:new Date().toISOString(),finding:'An upstream limit remains a hypothesis.',questions:[],references:[],candidates:[],incidentCandidates:[],modelResult:{mode:'conditional-investigation-plan',citations:['KA-0001'],nextQuestions:[],evidenceIds:['KA-0001'],sourceEvidence:[{handle:'E1',sourceId:'KA-0001',sourceKind:'experience-memory',title:'Historical proxy limit',url:'https://example.com/source',authority:'historical-episode',source:{reportedAction:'Historical configuration adjustment.',limitations:'Reported recovery, not a current fix.',quote:'<script>window.evidenceExecuted=true</script>'}}]}};
 await page.route('**/api/workspace',route=>route.fulfill({json:state}));
 await page.goto('/#cases');await page.getByRole('tab',{name:'Investigation',exact:true}).click();await page.getByText('Evidence provided to the AI',{exact:true}).click();
 await expect(page.getByText('Investigation plan · review required',{exact:true})).toBeVisible();
 await expect(page.getByText(/The proposed explanations and diagnostic branches still need review/)).toBeVisible();
 await expect(page.getByText('Diagnostic review · two reasoning steps',{exact:true})).toHaveCount(0);
 await page.getByText('KA-0001 · Historical proxy limit',{exact:true}).click();
 const panel=page.locator('details.memory-provenance');await expect(panel.locator('pre')).toContainText('Reported recovery, not a current fix.');
 await expect(panel.locator('script')).toHaveCount(0);expect(await page.evaluate(()=>window.evidenceExecuted)).toBeUndefined();
});

test('Hindsight is the only AI workflow and exposes search depth and evidence contribution',async({page})=>{
 const requests=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 let state=await (await page.request.get('/api/workspace')).json();
 state.config.cloudMemoryAvailable=true;state.config.agentMode='hindsight-on-demand';
 await page.route('**/api/workspace',route=>route.fulfill({json:state}));
 await page.route('**/api/cases/CS-1042/analyze',async route=>{
  const body=route.request().postDataJSON();requests.push(body);
  const c=state.cases.find(c=>c.id==='CS-1042');
  c.analysis={useMemory:body.useMemory,provider:'Hindsight Reflect · balanced search',at:new Date().toISOString(),finding:'The reported failure needs a discriminating check.',questions:[],references:[],candidates:[],incidentCandidates:[],modelResult:{provider:'Hindsight',mode:'diagnostic-questions',auditReview:{status:'withheld-for-review',message:'Diagnostic questions require review.',claimCount:2,unsupportedCount:1,uncertainCount:1,limitations:['The current cause is unverified.']},searchDepth:body.searchDepth,citations:['KA-0001'],nextQuestions:['Which component returned the failure?'],evidenceIds:['KA-0001'],evidenceSelection:{omitted:[],rejected:[]},traceSummary:{toolCalls:2,llmCalls:3},provenance:{readCount:1,records:[{factId:'fact-test',articleId:'KA-0001',revision:1,documentId:'test-document',type:'world',text:'The historical source reported recovery after applying configuration.'}]}}};
  c.drafts={customer:'Please share the failing response.',engineering:'Current cause remains unknown.',provider:'Hindsight Reflect'};
  await route.fulfill({json:c});
 });
 await page.goto('/#cases');await page.getByText('Investigation options',{exact:false}).first().click();
 await expect(page.getByLabel('Use Hindsight · credit')).toBeChecked();
 await expect(page.getByLabel('Hindsight search depth')).toHaveValue('high');
 await page.getByLabel('Hindsight search depth').selectOption('mid');
 await expect(page.getByLabel('Use OpenAI · credit')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Reflect on this case/})).toHaveCount(0);
 await page.getByRole('button',{name:'Prepare investigation',exact:true}).click();
 await expect(page.getByText('The reported failure needs a discriminating check.',{exact:true})).toBeVisible();
 expect(requests[0]).toEqual({useMemory:true,useHindsight:true,searchDepth:'mid',acknowledgeCreditUse:true});
 await page.getByText('Evidence provided to the AI',{exact:true}).click();
 await expect(page.getByText('How memory contributed',{exact:true})).toBeVisible();
 await expect(page.getByText('Diagnostic review · two reasoning steps',{exact:true})).toBeVisible();
 await expect(page.getByText(/The candidate fix draft was withheld/)).toBeVisible();
 await expect(page.getByText('The current cause is unverified.',{exact:true})).toBeVisible();
 await expect(page.getByText(/Source inspection by AI and Hindsight retention do not mean human review/)).toBeVisible();
 await expect(page.getByText('The historical source reported recovery after applying configuration.',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Drafts',exact:true}).click();await expect(page.getByLabel('Customer reply')).toHaveValue('Please share the failing response.');
 await page.goto('/#connections');await expect(page.getByLabel('OpenAI API key')).toHaveCount(0);await expect(page.getByText(/Standalone paid connection checks and manual retention are paused/)).toBeVisible();
 expect(errors).toEqual([]);
});

test('memory summary and saved investigations preserve the answer and link selected lessons without provider calls',async({page})=>{
 const state=await(await page.request.get('/api/workspace')).json();state.config.cloudMemoryAvailable=true;
 const c=state.cases.find(c=>c.id==='CS-1042');c.analysis={useMemory:false,provider:'Hindsight evidence plan',at:'2026-09-29T00:00:00Z',finding:'Keep this saved answer.',questions:[],references:[],candidates:[],incidentCandidates:[]};
 c.savedInvestigations=[{at:'2026-09-29T00:01:00Z',useMemory:true,status:'withheld',articleIds:['KA-0217']},{at:'2026-09-29T00:00:00Z',useMemory:false,status:'delivered',articleIds:[]}];
 state.articles=[{id:'KA-0217',revision:1,title:'Historical helper lesson',fix:'A historical participant changed the helper flavor.',cause:'',verification:'Source reported recovery.',limitations:'Not a universal fix.',hosting:'Self-managed',executor:'Kubernetes',serverVersion:'',runnerVersion:'',chartVersion:'',sourceIds:[],sourceCases:[],history:[],reviewer:'AI source inspection',sync:'local-only',updatedAt:'2026-09-29T00:00:00Z'}];
 const mutations=[];await page.route('**/api/**',async route=>{if(route.request().method()!=='GET'){mutations.push(route.request().url());return route.abort();}if(new URL(route.request().url()).pathname==='/api/workspace')return route.fulfill({json:state});return route.continue();});
 await page.goto('/#cases');await expect(page.getByRole('status',{name:'Investigation memory setting'})).toContainText('Stored knowledge will be included');
 await page.locator('summary').filter({hasText:'Investigation options'}).click();await page.getByLabel('Include memory',{exact:true}).uncheck();await page.locator('summary').filter({hasText:'Investigation options'}).click();
 await expect(page.getByRole('status',{name:'Investigation memory setting'})).toContainText('Stored knowledge is excluded');await expect(page.getByRole('status',{name:'Investigation memory setting'})).toContainText('Hindsight remains configured and will still run');
 await page.getByRole('tab',{name:'Investigation',exact:true}).click();const history=page.getByRole('region',{name:'Saved investigations'});
 await history.locator('summary').filter({hasText:'Result withheld'}).click();await expect(history).toContainText('No approved fix was delivered');await expect(page.getByText('Keep this saved answer.',{exact:true})).toBeVisible();
 await history.getByRole('link',{name:'Open lesson KA-0217'}).click();await expect(page).toHaveURL(/#knowledge\?article=KA-0217$/);await expect(page.locator('#article-KA-0217')).toBeVisible();expect(mutations).toEqual([]);
});
