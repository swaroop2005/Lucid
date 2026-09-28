import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdirSync,writeFileSync} from 'node:fs';

// Selected structural rules only. This is not a complete accessibility audit.
test('active routes fit mobile, tablet and desktop with named controls and landmarks',async({page})=>{
 test.setTimeout(180000);
 const routes=['cases','cases/history','knowledge','incidents','library','guides','research','studies','story','home','connections'];
 const metrics=[];
 for(const width of [375,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const route of routes){
   await page.goto('/#'+route);await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();
   const layout=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth}));
   const result=await new AxeBuilder({page}).withRules(['landmark-one-main','landmark-unique','page-has-heading-one','button-name','link-name','label','aria-valid-attr','aria-valid-attr-value','aria-required-attr','duplicate-id-aria']).analyze();
   metrics.push({route,width,...layout,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  }
 }
 mkdirSync('work/ui-verification',{recursive:true});writeFileSync('work/ui-verification/RESPONSIVE-AXE-METRICS.json',JSON.stringify({checkedAt:new Date().toISOString(),mode:'isolated fixture server',scope:'11 routes × 3 widths; structural rules only, no contrast or full keyboard audit',metrics},null,2));
 expect(metrics.filter(m=>m.documentWidth>m.viewport||m.bodyWidth>m.viewport)).toEqual([]);
 expect(metrics.filter(m=>m.violations.length)).toEqual([]);
});
