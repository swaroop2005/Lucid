import {z} from 'zod';
import {DomainError} from './domain.js';
import {HindsightDerived,derivedAidViews} from './hindsight-derived.js';
import {verifiedArticleScope} from './hindsight-scope.js';

export function mountDerivedRoutes(app,store,{cloud,configured,authorize,service}={}){
 const engine=service||new HindsightDerived(store,{provider:()=>cloud.provider(),connectionId:()=>cloud.connectionId(),authorize});
 app.get('/api/derived-aids',(_req,res)=>{
  if(!configured())return res.json({enabled:false,sources:[],items:derivedAidViews(store.read())});
  const provider=cloud.provider(),scope=provider.scope(),connectionId=cloud.connectionId();
  const sources=store.read().articles.filter(a=>verifiedArticleScope(a,{connectionId,scope})).map(({id,title,revision,executor,hosting,runnerVersion,serverVersion,chartVersion})=>({id,title,revision,executor,hosting,runnerVersion,serverVersion,chartVersion}));
  res.json({enabled:true,sources,items:engine.view()});
 });
 app.post('/api/derived-aids',(req,res)=>{
  if(!configured())throw new DomainError('Save a Hindsight connection before planning a derived aid.');
  res.status(201).json(engine.stage(req.body));
 });
 app.post('/api/derived-aids/:id/:action',async(req,res)=>{
  if(!configured())throw new DomainError('Save a Hindsight connection before using a derived aid.');
  const action=z.enum(['create','refresh','check']).parse(req.params.action),input=z.object({expectedPlanHash:z.string().regex(/^[a-f0-9]{64}$/),acknowledgeCreditUse:z.literal(true)}).strict().parse(req.body);
  res.json(await engine.run(req.params.id,action,input));
 });
}
