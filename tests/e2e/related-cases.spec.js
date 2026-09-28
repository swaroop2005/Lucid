import {test,expect} from '@playwright/test';

const sample=(id,title)=>({id,title,excerpt:'Observed certificate error; verify the affected environment.',family:'Network & DNS',kind:'Bug report',state:'closed',outcome:'Source-reported resolution',applicability:{executor:'Executor not specified',version:'Version applicability unknown'}});

test('related results open reports without changing records; company context and top search remain available',async({page})=>{
 const response=await page.request.post('/api/cases',{headers:{'x-lucid-local':'1'},data:{companyName:'Related discovery test company',contact:'Local test contact',title:'Certificate trust path for related-case test',description:'The helper reports x509 certificate signed by unknown authority.'}});
 expect(response.status()).toBe(201);const created=await response.json();
 const before=await(await page.request.get('/api/workspace')).json();
 await page.goto('/');await page.locator('.case-row').filter({hasText:created.id}).click();
 await expect(page.locator('.related-contact')).toContainText('Related discovery test company');
 await expect(page.locator('.related-contact')).toContainText('Local test contact');
 await expect(page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Companies',exact:true})).toHaveCount(0);
 const panel=page.getByRole('region',{name:'Related prior cases'});
 await expect(panel.locator('.related-case-title').first()).toBeVisible();
 const first=panel.locator('.related-case-title').first(),href=await first.getAttribute('href'),title=await first.textContent();
 await first.click();await expect(page.locator('.history-record-header h2')).toHaveText(title);
 await expect(panel).toHaveAttribute('data-case-id',new URLSearchParams(href.split('?')[1]).get('report'));
 await expect(panel.locator('.related-case-title').first()).toBeVisible();
 expect(await panel.locator('.related-case-title').evaluateAll(links=>links.map(a=>a.getAttribute('href')))).not.toContain(href);
 await page.goBack();await expect(page.locator('.case-header h2')).toHaveText(created.title);
 await page.locator('.console-search').click();await page.getByLabel('Search cases, knowledge and evidence',{exact:true}).fill('1059');await page.getByLabel('Search cases, knowledge and evidence',{exact:true}).press('Enter');
 await expect(page.getByLabel('Search historical cases')).toHaveValue('1059');await expect(page.locator('.history-case-row')).toHaveCount(1);
 const after=await(await page.request.get('/api/workspace')).json();
 for(const key of ['cases','companies','articles','outbox','events'])expect(after[key]).toEqual(before[key]);
});

test('late suggestions cannot overwrite the newly selected case',async({page})=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/cases/CS-1042/related',async route=>{await gate;await route.fulfill({json:{rows:[sample('old','Old case result')],query:'certificate'}}).catch(()=>{});});
 await page.route('**/api/cases/CS-1043/related',route=>route.fulfill({json:{rows:[sample('new','Current case result')],query:'certificate'}}));
 await page.goto('/');await expect(page.getByText('Finding related cases…')).toBeVisible();
 await page.locator('.case-row').filter({hasText:'CS-1043'}).click();
 const panel=page.getByRole('region',{name:'Related prior cases'});
 await expect(panel.getByRole('link',{name:'Current case result'})).toBeVisible();release();
 await expect(panel).toHaveAttribute('data-case-id','CS-1043');await expect(panel.getByRole('link',{name:'Old case result'})).toHaveCount(0);
});

test('related sidebar has recoverable error and empty states',async({page})=>{
 let unavailable=true;
 await page.route('**/api/cases/CS-1042/related',route=>unavailable?route.fulfill({status:503,json:{error:'Index temporarily unavailable'}}):route.fulfill({json:{rows:[],query:''}}));
 await page.goto('/');const panel=page.getByRole('region',{name:'Related prior cases'});
 await expect(panel.getByRole('alert')).toContainText('Related cases could not be loaded');unavailable=false;await panel.getByRole('button',{name:'Try again'}).click();
 await expect(panel).toContainText('No close matches yet');await expect(panel.getByRole('link',{name:'Search historical cases'})).toHaveAttribute('href','#cases/history');
});

test('historical suggestions refresh with browser navigation and remain usable on mobile in both themes',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/#cases/history?q=certificate&report=gitlab-runner-1059');
 const panel=page.getByRole('region',{name:'Related prior cases'});await expect(panel.locator('.related-case-title').first()).toBeVisible();
 const firstTitle=await page.locator('.history-record-header h2').textContent();
 await panel.locator('.related-case-title').first().click();await expect(page.locator('.history-record-header h2')).not.toHaveText(firstTitle);
 await expect(page.locator('.history-record-header h2')).toBeInViewport();
 await page.goBack();await expect(page.getByLabel('Search historical cases')).toHaveValue('certificate');await expect(page.locator('.history-record-header h2')).toHaveText(firstTitle);
 for(const theme of ['light','dark']){await page.getByLabel('Color theme').selectOption(theme);await panel.scrollIntoViewIfNeeded();await expect(panel.locator('.related-case-title').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.goto('/#companies');await expect(page.getByRole('heading',{name:'Case desk',exact:true})).toBeVisible();
});
