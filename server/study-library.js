import {readFileSync} from 'node:fs';
import {rankDocuments} from './reference-library.js';
export const studies=JSON.parse(readFileSync(new URL('../data/incident-studies.json',import.meta.url),'utf8'));
const keywords={
 'cloudflare-2019':'regex regular expression waf backtracking cpu firewall',
 'github-2018':'database replication failover mysql latency partition backup',
 'slack-2021':'network autoscaling provisioning quota transit gateway',
 'atlassian-2022':'deletion recovery restore identifier maintenance script',
 'gitlab-2017':'backup postgres pg_dump replication restore deletion',
 'fastly-2021':'edge configuration outage rollout',
 'roblox-2021':'consul boltdb streaming contention discovery bootstrap',
 'dropbox-2014':'backup mysql replica maintenance destructive restoration',
 'aws-2021':'network retries backoff congestion control plane',
 'meta-2021':'backbone bgp dns maintenance recovery',
 'discord-2023':'scylladb authentication quorum cache raid retry upgrade',
 'datadog-2023':'systemd cilium ubuntu routing security update',
 'google-2020':'oauth identity quota paxos authentication',
 'twilio-2020':'taskrouter sdk s3 permissions integrity cache',
 'digitalocean-2019':'account lock fraud false positive escalation cpu',
 'reddit-2023':'kubernetes calico upgrade labels admission webhook'};
export function studyReference(s){return {id:`STUDY-${s.id}`,title:`${s.company}: ${s.category}`,summary:s.learning,question:'Which conditions in this historical incident match your environment?',url:s.url,versions:s.vendor,stage:s.category,executor:'Any',kind:'source-reviewed-study',status:'Publisher-reported historical outcome; not a verified fix for this case',reviewedAt:s.reviewedAt,outcome:s.outcomeStatus};}
export function studySearch(query){return rankDocuments(query,studies,s=>keywords[s.id]||'').slice(0,2).map(studyReference);}
