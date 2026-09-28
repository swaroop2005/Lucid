// Explicit local credential save only; this command never contacts the provider.
import {resolve} from 'node:path';
import {CloudSettings} from '../server/settings.js';
const {HINDSIGHT_BASE_URL:baseUrl,HINDSIGHT_BANK:bank,HINDSIGHT_API_KEY:apiKey}=process.env;
if(!baseUrl||!bank||!apiKey||[bank,apiKey].some(v=>v.startsWith('replace-')))throw new Error('Set the three HINDSIGHT connection variables privately before configuring.');
const settings=new CloudSettings(resolve(process.env.SETTINGS_FILE||'.data/cloud-credentials.json'));
if(settings.read())throw new Error('Connection already exists. Use the local Connections screen to review changes.');
settings.save({baseUrl,bank,apiKey});
console.log('Saved server-side Cloud connection. No network calls or credit authorization were made.');
