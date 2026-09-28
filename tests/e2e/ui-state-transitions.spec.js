import {test,expect} from '@playwright/test';

const article=()=>({id:'KA-UI-1',title:'Reviewed UI fixture',revision:1,fix:'Observed recovery.',cause:'',verification:'A controlled fixture.',limitations:'Test evidence only.',symptom:'network',executor:'Unknown',hosting:'Unknown',serverVersion:'',runnerVersion:'',chartVersion:'',sourceIds:[],sourceCases:[],history:[],reviewer:'Test reviewer',sync:'local-only',updatedAt:'2026-09-29T00:00:00Z',curation:{immutable:true}});
async function fixture(page){const state=await(await page.request.get('/api/workspace')).json();await page.route('**/api/workspace',route=>route.fulfill({json:state}));return state;}

test('empty workspace keeps Connections and first-case creation usable',async({page})=>{
 const state=await fixture(page),sample=structuredClone(state.cases[0]);state.cases=[];state.companies=[];state.articles=[];state.outbox=[];
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/cases',route=>{const input=route.request().postDataJSON();const created={...sample,id:'CS-EMPTY-1',title:input.title,description:input.description,companyId:'CO-EMPTY-1',contact:input.contact,analysis:null,drafts:null,resolution:null,proposal:null,articleIds:[],attempts:[],tasks:[],timeline:[]};state.cases.push(created);state.companies.push({id:'CO-EMPTY-1',name:input.companyName});return route.fulfill({status:201,json:created});});
 await page.goto('/#cases');await expect(page.getByRole('heading',{name:'Start your first investigation'})).toBeVisible();
 await page.getByRole('button',{name:'Connections',exact:true}).click();await expect(page.getByRole('heading',{name:'Connections',exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:/^Cases/}).click();await page.getByRole('button',{name:'Create the first case',exact:true}).click();
 await page.getByLabel('Company',{exact:true}).fill('Fixture company');await page.getByLabel('Contact name').fill('Fixture reporter');await page.getByLabel('Short case title').fill('First fixture investigation');await page.getByLabel('Customer report',{exact:true}).fill('An observed error needs investigation.');await page.getByRole('button',{name:'Create case',exact:true}).click();
 await expect(page.locator('.case-header h2')).toHaveText('First fixture investigation');expect(errors).toEqual([]);
});

test('disconnected required Cloud blocks preparation in every case section',async({page})=>{
 const state=await fixture(page);state.config.cloudRequired=true;state.config.cloudMemoryAvailable=false;state.cases[0].analysis=null;state.cases[0].drafts=null;
 const calls=[];await page.route('**/api/cases/*/analyze',route=>{calls.push(route.request().url());return route.fulfill({status:409,json:{error:'Disconnected'}});});
 await page.goto('/#cases');for(const tab of ['Overview','Investigation','Drafts']){await page.getByRole('tab',{name:tab,exact:true}).click();await expect(page.getByRole('button',{name:'Prepare investigation',exact:true})).toBeDisabled();}expect(calls).toEqual([]);
});

test('skip link moves keyboard focus without replacing the current route',async({page})=>{
 await page.goto('/#connections');await expect(page.getByRole('heading',{name:'Connections',exact:true})).toBeVisible();await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to workspace'})).toBeFocused();await page.keyboard.press('Enter');
 await expect(page.locator('#workspace-content')).toBeFocused();await expect(page).toHaveURL(/#connections$/);await expect(page.getByRole('heading',{name:'Connections',exact:true})).toBeVisible();
});

test('old-connection Cloud retention never counts as current memory',async({page})=>{
 const state=await fixture(page),a=article();a.cloudRetention={status:'succeeded',revision:1,connectionMismatch:true};state.articles=[a];state.config.cloudMemoryAvailable=true;
 await page.goto('/#knowledge');const memory=page.getByRole('region',{name:'Source library and memory'});await expect(memory.locator('.memory-stages > div').nth(2).locator('strong')).toHaveText('0');
 const card=page.locator('#article-KA-UI-1');await expect(card.getByText('Local knowledge · Hindsight not verified',{exact:true})).toBeVisible();await expect(card.getByText('Current connection not retained',{exact:true})).toBeVisible();await expect(card.getByRole('button',{name:'Check Cloud status'})).toHaveCount(0);
});

test('approved outcome sync distinguishes pending, unverified and verified readback',async({page})=>{
 const state=await fixture(page),a=article(),calls=[];a.curation=undefined;state.articles=[a];state.config.cloudMemoryAvailable=false;
 a.learningCloseout={key:'fixture-key',articleId:a.id,revision:1,status:'pending',note:'Waiting for a configured connection.',checks:0};
 await page.route('**/api/articles/KA-UI-1/learning-status',route=>{calls.push(route.request().postDataJSON());return route.fulfill({json:a.learningCloseout});});
 await page.goto('/#knowledge');const area=page.getByRole('region',{name:'Cloud retention for KA-UI-1'});await expect(area).toContainText('Approved outcome sync: pending');await expect(area).toContainText('Drafts and unconfirmed suggestions are not shared knowledge');
 a.learningCloseout.status='unverified';a.learningCloseout.note='Cloud readback is not verified.';await area.getByRole('button',{name:'Check Cloud status'}).click();await expect(area).toContainText('Approved outcome sync: unverified');await expect(area).not.toContainText('Current revision retained');
 a.learningCloseout.status='succeeded';a.learningCloseout.note='Exact original document verified.';a.cloudRetention={status:'succeeded',revision:1};await area.getByRole('button',{name:'Check Cloud status'}).click();await expect(area).toContainText('Approved outcome sync: succeeded');await expect(area).toContainText('Current revision retained');expect(calls).toEqual([{expectedRevision:1},{expectedRevision:1}]);
});

test('connection status read failure is explicit and recoverable',async({page})=>{
 let failing=true;await page.route('**/api/cloud-settings',route=>failing?route.fulfill({status:503,json:{error:'Settings unavailable'}}):route.fulfill({json:{configured:false,bank:'fixture-bank'}}));
 await page.goto('/#connections');await expect(page.getByRole('alert').filter({hasText:'Connection status could not be loaded'})).toBeVisible();await expect(page.getByText('Status unavailable',{exact:true})).toBeVisible();
 failing=false;await page.getByRole('button',{name:'Retry connection status'}).click();await expect(page.getByText('Not connected',{exact:true})).toBeVisible();
});

test('research collection read failure is explicit and recoverable',async({page})=>{
 let failing=true;await page.route('**/api/corpus',route=>failing?route.fulfill({status:503,json:{error:'Corpus unavailable'}}):route.fulfill({json:{records:[],totals:{reports:0,outcomes:0,confirmedCauses:0,holdout:0,knownVersions:0,withFailedSteps:0},coverage:[]}}));
 await page.goto('/#research');await expect(page.getByRole('alert').filter({hasText:'Research collection could not be loaded'})).toBeVisible();
 failing=false;await page.getByRole('button',{name:'Retry research collection'}).click();await expect(page.getByText('0 public reports · 0 held out',{exact:true})).toBeVisible();
});

test('unsaved drafts still warn before reload after navigating away',async({page})=>{
 const state=await fixture(page);state.cases.find(c=>c.id==='CS-1042').drafts={customer:'Original reply',engineering:'Original brief',provider:'Fixture'};
 await page.goto('/#cases');await page.getByRole('tab',{name:'Drafts',exact:true}).click();await page.getByLabel('Customer reply',{exact:true}).fill('Unsaved important reply');await page.getByRole('button',{name:'Knowledge',exact:true}).click();
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:/^Cases/}).click();await page.getByRole('tab',{name:'Drafts',exact:true}).click();await expect(page.getByLabel('Customer reply',{exact:true})).toHaveValue('Unsaved important reply');await page.getByRole('button',{name:'Knowledge',exact:true}).click();
 const dialogPromise=page.waitForEvent('dialog',{timeout:3000});const reload=page.reload({timeout:3000}).catch(()=>{});const dialog=await dialogPromise;expect(dialog.type()).toBe('beforeunload');await dialog.dismiss();await reload;
});

test('late investigation completion preserves the newly selected case section',async({page})=>{
 const state=await fixture(page);let release,started;const startedPromise=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/cases/CS-1042/analyze',async route=>{started();await gate;const c=state.cases.find(c=>c.id==='CS-1042');c.analysis={useMemory:true,provider:'Fixture',at:new Date().toISOString(),finding:'Original case completed',questions:[],references:[],candidates:[],incidentCandidates:[]};await route.fulfill({json:c});});
 await page.goto('/#cases');await page.getByRole('button',{name:'Prepare investigation',exact:true}).click();await startedPromise;await page.locator('.case-row').filter({hasText:'CS-1043'}).click();release();
 await expect(page.getByRole('status').filter({hasText:'Investigation prepared'})).toBeVisible();await expect(page.getByRole('tab',{name:'Overview',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.locator('.case-kicker').first()).toContainText('CS-1043');
});

test('Escape during a pending form save keeps the controlled dialog visible',async({page})=>{
 const state=await fixture(page);let release,started;const startedPromise=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/cases/CS-1042/context',async route=>{started();await gate;await route.fulfill({json:state.cases.find(c=>c.id==='CS-1042')});});
 await page.goto('/#cases');await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('button',{name:'Save environment'}).click();await startedPromise;await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();release();await expect(page.getByRole('dialog')).toHaveCount(0);
});
