import {test,expect} from '@playwright/test';
test('historical source and immutable AI-reviewed article link in both directions',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const reports=await (await page.request.get('/api/evidence')).json(),report=reports.rows.find(r=>!r.reserved);
 const article={id:'KA-9090',title:'Historical timeout source review',revision:1,fix:'The source reported a workaround; validate it in the current environment.',cause:'',verification:'Source-reported only.',limitations:'Not independently reproduced.',symptom:'unclassified',executor:'Unknown',hosting:'Unknown',serverVersion:'',runnerVersion:'',chartVersion:'',sourceIds:[],citations:[{id:report.id,title:report.title,url:report.url,status:'Public source evidence'}],sourceCases:[],history:[],reviewer:'AI source reviewer · AI source inspection',sync:'local-only',updatedAt:'2026-09-28T00:00:00Z',historicalReportIds:[report.id],diagnostics:['Inspect the actual failure stage.'],curation:{key:'ui-source',humanReviewed:false,confirmed:false,independentlyReproduced:false,immutable:true}};
 await page.route('**/api/workspace',async route=>{const response=await route.fetch(),state=await response.json();state.articles.push(article);await route.fulfill({response,json:state});});
 await page.goto('/#cases/history?report='+encodeURIComponent(report.id));
 await page.getByRole('link',{name:'KA-9090 · Historical timeout source review'}).click();
 const card=page.locator('#article-KA-9090');await expect(card).toBeVisible();
 await expect(card.getByText(/Not human reviewed/)).toBeVisible();await expect(card.getByText('Source-reported explanation')).toBeVisible();await expect(card.getByRole('button',{name:'Draft revision'})).toHaveCount(0);
 await card.getByRole('link',{name:report.id+' ↗',exact:true}).click();
 await expect(page.getByRole('main',{name:'Historical case record'}).getByRole('heading',{name:report.title,exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
