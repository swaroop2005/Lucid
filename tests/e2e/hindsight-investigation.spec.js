import {test,expect} from '@playwright/test';

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
