/** Run with node --experimental-transform-types; reads actual producer publication output. */
import fs from 'node:fs';
import path from 'node:path';
import {loadReportsV3} from '../src/lib/domain/cqas-v3.ts';
import {loadSidecars} from '../src/lib/domain/cqas-sidecars.ts';
import {parseCqasReport} from '../src/lib/domain/cqas.ts';
const root=process.argv[2];if(!root)throw Error('Pass a publication directory');
const files={};
function walk(directory,prefix){if(!fs.existsSync(directory))return;for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
 const local=path.join(directory,entry.name),key=prefix+'/'+entry.name;
 if(entry.isDirectory())walk(local,key);else if(entry.name.endsWith('.json'))files[key]=JSON.parse(fs.readFileSync(local,'utf8'));
}}
walk(path.join(root,'reports'),'/data/cqas-v3');walk(path.join(root,'alerts'),'/data/cqas-alerts');
const known=['synthetic-sr'];
const reports=loadReportsV3(files,known),sidecars=loadSidecars(files,known);
if(reports.warnings.length||sidecars.warnings.length)throw Error(JSON.stringify([...reports.warnings,...sidecars.warnings]));
const count=Object.values(reports.reports).flat().length;
if(!count||!Object.values(sidecars.series).flat().length||!sidecars.alerts.length)throw Error('Incomplete contract exercise');
const v2=path.join(root,'v2.json');if(fs.existsSync(v2))parseCqasReport(JSON.parse(fs.readFileSync(v2,'utf8')));
console.log(JSON.stringify({reports:count,series:Object.values(sidecars.series).flat().length,alerts:sidecars.alerts.length,v2:fs.existsSync(v2)}));
