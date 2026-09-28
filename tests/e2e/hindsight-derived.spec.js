import {test,expect} from '@playwright/test';
test('a derived aid needs a local source plan and separate explicit generation and result actions',async({page})=>{
 const calls=[],items=[],sources=[1,2].map(n=>({id:`KA-000${n}`,revision:1,title:`Source lesson${n}`,executor:'Shell',hosting:'Self-managed',runnerVersion:''}));
 await page.route('**/api/derived-aids',async route=>{
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();calls.push({action:'stage',body});items.push({id:'lucid-derived-test',name:body.name,question:body.question,planHash:'a'.repeat(64),status:'staged',sourceSnapshots:sources.map(s=>({articleId:s.id,revision:1})),stale:false,snapshot:null,canCreate:true,canCheck:false,canRefresh:false});return route.fulfill({json:items[0],status:201});}
  return route.fulfill({json:{enabled:true,sources,items}});
 });
 await page.route('**/api/derived-aids/lucid-derived-test/*',async route=>{
  const action=route.request().url().split('/').at(-1);calls.push({action,body:route.request().postDataJSON()});const aid=items[0];
  if(action==='create')Object.assign(aid,{status:'processing',canCreate:false,canCheck:true});
  if(action==='check')Object.assign(aid,{status:'reviewable',canRefresh:true,snapshot:{content:'Compare source-specific outcomes [KA-0001] [KA-0002].',verifiedAt:'2026-09-28T00:00:00Z',reviewStatus:'Unreviewed generated aid; source provenance checked',provenance:{records:sources.map(s=>({factId:s.id+'-fact',articleId:s.id,revision:1,text:'Source-reported outcome only.'}))}}});
  await route.fulfill({json:aid});
 });
 await page.goto('/#knowledge');const area=page.getByRole('region',{name:'Generated diagnostic aids'});
 await area.getByText('Prepare a source plan · no credits',{exact:true}).click();await area.getByLabel('Summary title').fill('Configuration comparison');await area.getByLabel('Question to compare').fill('Which diagnostics distinguish these source outcomes?');
 for(const s of sources)await area.getByRole('checkbox',{name:new RegExp(s.id)}).check();
 await area.getByRole('button',{name:'Review source plan'}).click();await expect(area.getByRole('button',{name:'Generate aid · uses credits'})).toBeVisible();expect(calls.map(c=>c.action)).toEqual(['stage']);expect(calls[0].body.articleIds).toEqual(['KA-0001','KA-0002']);
 await area.getByRole('button',{name:'Generate aid · uses credits'}).click();await expect(area.getByRole('button',{name:'Check result · uses credits'})).toBeVisible();expect(calls[1].body).toEqual({expectedPlanHash:'a'.repeat(64),acknowledgeCreditUse:true});
 await area.getByRole('button',{name:'Check result · uses credits'}).click();await expect(area.getByText(/Not human reviewed or independently reproduced/)).toBeVisible();await expect(area.getByText('Compare source-specific outcomes [KA-0001] [KA-0002].',{exact:true})).toBeVisible();await expect(area.getByRole('button',{name:/Approve/})).toHaveCount(0);expect(calls.map(c=>c.action)).toEqual(['stage','create','check']);
});
