import {calendarInfo,dsrForPeriod,type Holiday} from './holidays';
export type Entry = {id:string;date:string;start:string;end:string;kind:'clock'|'extra';note:string;createdAt:number};
export type Config = {holderName?:string;dependents?:number;hourly:number;capMinutes:number;dsrRate:number;inssRate:number;irRate:number;irAdjustment:number;loan:number;meal:number;medical:number;other:number;mealCreditDay:number;mealDiscountPercent:number;vtEnabled:boolean;vtCreditDay:number;vtDiscountPercent:number;dsrMode?:'professor'|'calendar';customHolidays?:Holiday[]};
export type Closure = {key:string;allocations:{id:string;minutes:number}[];clockMinutes:number;closedAt:string;note:string};
export type Store = {version:1;entries:Entry[];config:Config;closures:Closure[]};
export type Allocation = {id:string;minutes:number;origin:string;note:string};
export type Period = {key:string;from:string;to:string;clockMinutes:number;extraMinutes:number;available:number;overflowMinutes:number;allocations:Allocation[];closed:boolean;overCap:boolean};
export const DEFAULT_CONFIG:Config={holderName:'',dependents:0,hourly:0,capMinutes:10800,dsrRate:1/6,inssRate:928.32/8048.70,irRate:1049.37/7120.38,irAdjustment:0,loan:0,meal:0,medical:0,other:0,mealCreditDay:0,mealDiscountPercent:0,vtEnabled:false,vtCreditDay:0,vtDiscountPercent:6,dsrMode:'professor',customHolidays:[]};
export const emptyStore=():Store=>({version:1,entries:[],config:{...DEFAULT_CONFIG},closures:[]});
export function parseDate(iso:string){const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d,12);}
export function iso(d:Date){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function monthAdd(d:Date,offset:number){return new Date(d.getFullYear(),d.getMonth()+offset,1,12);}
export function periodKey(date:string){const d=parseDate(date);return iso(new Date(d.getFullYear(),d.getMonth()+(d.getDate()>=16?1:0),15,12)).slice(0,7);}
export function bounds(key:string){const [y,m]=key.split('-').map(Number);return {from:iso(new Date(y,m-2,16,12)),to:iso(new Date(y,m-1,15,12))};}
export function minutesBetween(start:string,end:string){if(!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end))return 0;const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);if(sh>23||eh>23||sm>59||em>59)return 0;return eh*60+em-sh*60-sm;}
export function duration(e:Entry){return Math.max(0,minutesBetween(e.start,e.end));}
export function fmtMinutes(m:number){const n=Math.max(0,Math.round(m));return `${Math.floor(n/60)}h ${String(n%60).padStart(2,'0')}min`;}
export const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
export function lastBusinessDay(key:string){const [y,m]=key.split('-').map(Number);const d=new Date(y,m,0,12);while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()-1);return iso(d);}// feriados bancários não considerados
export function buildPeriods(store:Store,untilKey:string):Period[]{
 const entries=[...store.entries].sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt-b.createdAt);
 const keys=[...entries.map(e=>periodKey(e.date)),...store.closures.map(c=>c.key),untilKey].sort();
 const first=keys.length&&keys[0]<untilKey?keys[0]:untilKey;const start=parseDate(`${first}-01`),end=parseDate(`${untilKey}-01`);
 const lastKey=keys[keys.length-1]||untilKey;const last=parseDate(`${lastKey}-01`);if(last>end)end.setTime(last.getTime());
 const closures=new Map(store.closures.map(c=>[c.key,c]));
 const remaining=new Map(entries.filter(e=>e.kind==='extra').map(e=>[e.id,duration(e)]));
 const periods:Period[]=[];
 for(let d=new Date(start);d<=end;d=monthAdd(d,1)){
  const key=iso(d).slice(0,7), {from,to}=bounds(key);
  const clockMinutes=entries.filter(e=>e.kind==='clock'&&periodKey(e.date)===key).reduce((s,e)=>s+duration(e),0);
  const locked=closures.get(key);const allocations:Allocation[]=[];
  if(locked){for(const a of locked.allocations){const src=entries.find(e=>e.id===a.id);if(!src)continue;const m=Math.min(a.minutes,remaining.get(a.id)||0);if(m>0){remaining.set(a.id,(remaining.get(a.id)||0)-m);allocations.push({id:a.id,minutes:m,origin:src.date,note:src.note});}}}
  else {
   let room=Math.max(0,store.config.capMinutes-clockMinutes);
   for(const e of entries){if(e.kind!=='extra'||e.date>to||room<=0)continue;const m=Math.min(room,remaining.get(e.id)||0);if(m>0){remaining.set(e.id,(remaining.get(e.id)||0)-m);room-=m;allocations.push({id:e.id,minutes:m,origin:e.date,note:e.note});}}
  }
  const extraMinutes=allocations.reduce((s,a)=>s+a.minutes,0);
  const overflowMinutes=entries.filter(e=>e.kind==='extra'&&e.date<=to).reduce((s,e)=>s+(remaining.get(e.id)||0),0);
  periods.push({key,from,to,clockMinutes,extraMinutes,available:Math.max(0,store.config.capMinutes-clockMinutes-extraMinutes),overflowMinutes,allocations,closed:!!locked,overCap:clockMinutes+extraMinutes>store.config.capMinutes});
 }
 return periods;
}
export function salary(p:Period,c:Config,eligibleDays=0,entries:Entry[]=[]){
 const hours=p.clockMinutes+p.extraMinutes;const configured=c.hourly>0;
 const base=hours/60*c.hourly;
 const cal=calendarInfo(p.from,p.to,entries,c.customHolidays||[]);
 const dsrResult=dsrForPeriod(base,c.dsrMode||'professor',cal);const dsr=dsrResult.value;
 const gross=base+dsr;
 const inss=configured&&hours>0?inss2026(gross):0;
 const dependentDeduction=(c.dependents||0)*189.59;
 const irLegal=inss+dependentDeduction;
 const irBase=Math.max(0,gross-Math.max(607.20,irLegal));
 const ir=configured&&hours>0?irrf2026(gross,irBase):0;
 const vrUnits=Math.floor(hours/480);
 const mealCredit=vrUnits*c.mealCreditDay,vtCredit=c.vtEnabled?eligibleDays*c.vtCreditDay:0;
 const mealDeduction=configured&&hours>0&&mealCredit>0?Math.min(mealCredit,mealCredit*c.mealDiscountPercent/100):0;
 const vtDeduction=configured&&hours>0&&c.vtEnabled&&vtCredit>0?Math.min(vtCredit,base*c.vtDiscountPercent/100):0;
 const applicable=hours>0&&configured;
 const loan=applicable?c.loan:0,medical=applicable?c.medical:0,other=applicable?c.other:0;
 const deductions=inss+ir+loan+mealDeduction+vtDeduction+medical+other;
 return {base,dsr,dsrResult,cal,gross,inss,ir,irBase,deductions,net:gross-deductions,mealCredit,vtCredit,mealDeduction,vtDeduction,loan,medical,other,eligibleDays,vrUnits,configured,hasHours:hours>0};
}
export function validateEntry(e:Entry){if(!e.date||!e.start||!e.end||duration(e)<=0)return 'Informe data e um intervalo válido (saída posterior à entrada).';if(duration(e)>16*60)return 'Intervalos acima de 16 horas precisam ser divididos.';return '';}
export function detectOverlap(entries:Entry[],candidate:Entry){return entries.some(e=>e.id!==candidate.id&&e.date===candidate.date&&e.start<candidate.end&&candidate.start<e.end);}

// Tabelas oficiais aplicáveis ao trabalho assalariado em 2026.
const round2=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
export function inss2026(gross:number){
 const bands:[[number,number],[number,number],[number,number],[number,number]]=[
  [1621,0.075],[2902.84,0.09],[4354.27,0.12],[8475.55,0.14]
 ];
 let prev=0,total=0;
 for(const [limit,rate] of bands){total+=Math.max(0,Math.min(gross,limit)-prev)*rate;prev=limit;if(gross<=limit)break;}
 return round2(total);
}
export function irrf2026(gross:number,base:number){
 const rate=base<=2428.8?0:base<=2826.65?.075:base<=3751.05?.15:base<=4664.68?.225:.275;
 const deduction=base<=2428.8?0:base<=2826.65?182.16:base<=3751.05?394.16:base<=4664.68?675.49:908.73;
 const calculated=Math.max(0,round2(base*rate-deduction));
 const reduction=gross<=5000?Math.min(calculated,312.89):gross<=7350?Math.max(0,978.62-.133145*gross):0;
 return round2(Math.max(0,calculated-reduction));
}
