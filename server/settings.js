import { existsSync,readFileSync,writeFileSync,mkdirSync,renameSync,chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { DomainError } from './domain.js';
import { HindsightClient } from '@vectorize-io/hindsight-client';
export const cloudSettingsSchema=z.object({baseUrl:z.literal('https://api.hindsight.vectorize.io'),bank:z.string().regex(/^[a-zA-Z0-9_-]{3,80}$/),apiKey:z.string().min(8).max(500)}).strict();
export class CloudSettings {
 constructor(file,client){this.client=client;this.file=file;this.running=false;this.resultFile=`${file}.check.json`;this.lastResult=existsSync(this.resultFile)?JSON.parse(readFileSync(this.resultFile,'utf8')):null;}
 read(){return existsSync(this.file)?JSON.parse(readFileSync(this.file,'utf8')):null;}
 save(input){if(this.running)throw new DomainError('Wait for the current connection check to finish.',409);const value=cloudSettingsSchema.parse(input);mkdirSync(dirname(this.file),{recursive:true});writeFileSync(`${this.file}.tmp`,JSON.stringify(value),{mode:0o600});chmodSync(`${this.file}.tmp`,0o600);renameSync(`${this.file}.tmp`,this.file);this.lastResult=null;this.persist();}
 persist(){mkdirSync(dirname(this.resultFile),{recursive:true});writeFileSync(`${this.resultFile}.tmp`,JSON.stringify(this.lastResult),{mode:0o600});renameSync(`${this.resultFile}.tmp`,this.resultFile);}
 status(){const c=this.read();return {configured:!!c,baseUrl:c?.baseUrl||'https://api.hindsight.vectorize.io',bank:c?.bank||'lucid-dev',lastResult:this.lastResult,running:this.running};}
 async test(){
  if(this.running)throw new DomainError('A connection check is already running.',409);
  if(this.lastResult)return this.lastResult;
  const c=this.read();if(!c)throw new Error('Save Cloud credentials locally first.');
  this.running=true;
  try{
   const client=this.client||new HindsightClient({baseUrl:c.baseUrl,apiKey:c.apiKey,maxAttempts:1});const started=Date.now();
   const docId='lucid-connection-check-v1';
   await client.retain(c.bank,'Lucid connection check: the verification marker is lucid-orchid-73.',{documentId:docId,context:'Non-customer connectivity test.',async:false,signal:AbortSignal.timeout(60000)});
   const result=await client.recall(c.bank,'What is the Lucid verification marker?',{budget:'low',maxTokens:256,signal:AbortSignal.timeout(45000)});
   const found=result.results.some(r=>(r.text||'').includes('lucid-orchid-73'));
   this.lastResult={at:new Date().toISOString(),retain:'completed',recall:found?'marker found':'response received; marker not found',verified:found,elapsedMs:Date.now()-started,operations:2,docId,note:'One short retain and one bounded recall. Check Cloud Billing for actual charges; no provider hard spending cap is claimed. App memory remains offline.'};
   this.persist();return this.lastResult;
  }catch(e){this.lastResult={at:new Date().toISOString(),verified:false,retain:'Check incomplete',recall:'Not verified',elapsedMs:0,operations:null,note:'The result is uncertain. Check Cloud activity and bank access before saving settings to authorize another check.'};this.persist();throw e;}finally{this.running=false;}
 }
}
