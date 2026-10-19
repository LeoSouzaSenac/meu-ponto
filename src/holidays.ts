export type Holiday={date:string;name:string;level:'nacional'|'estadual'|'municipal'|'personalizado'|'escolar'};
const iso=(y:number,m:number,d:number)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
function easter(y:number){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return new Date(y,month-1,day,12);}
const shifted=(day:Date,days:number)=>{const d=new Date(day);d.setDate(d.getDate()+days);return iso(d.getFullYear(),d.getMonth()+1,d.getDate());};
export function holidaysForYear(year:number,custom:Holiday[]=[]):Holiday[]{
 const rows:[number,number,string,Holiday['level']][]=[
 [1,1,'Confraternização Universal','nacional'],[4,21,'Tiradentes','nacional'],[5,1,'Dia do Trabalhador','nacional'],[9,7,'Independência do Brasil','nacional'],[10,12,'Nossa Senhora Aparecida','nacional'],[11,2,'Finados','nacional'],[11,15,'Proclamação da República','nacional'],[11,20,'Consciência Negra','nacional'],[12,25,'Natal','nacional'],[9,20,'Revolução Farroupilha','estadual'],[7,25,'Aniversário de São Leopoldo','municipal'],[12,8,'Nossa Senhora da Conceição','municipal']];
 const result:Holiday[]=rows.map(([m,d,name,level])=>({date:iso(year,m,d),name,level}));
 // Dia do Professor: feriado ESCOLAR pelo Decreto 52.682/1963; não é feriado civil de DSR.
 result.push({date:iso(year,10,15),name:'Dia do Professor (feriado escolar)',level:'escolar'});
 // Em 2026, o SINEPE/RS antecipou a comemoração para 13/10 em convenções privadas.
 // Aplicação ao Senac exige confirmação: registro informativo, nunca DSR automático.
 if(year===2026)result.push({date:iso(year,10,13),name:'Dia do Professor — antecipação SINEPE/RS (confirmar aplicação ao Senac)',level:'escolar'});
 const pascoa=easter(year);result.push({date:shifted(pascoa,-2),name:'Sexta-feira Santa',level:'nacional'});
 // Corpus Christi depende de lei municipal/ato aplicável: não incluir automaticamente.
 // Carnaval e pontos facultativos não são feriados legais por padrão.
 for(const h of custom){if(h.date.startsWith(String(year)+'-')&&/^\d{4}-\d\d-\d\d$/.test(h.date)){const index=result.findIndex(x=>x.date===h.date);if(index<0)result.push(h);else result[index]={...h,name:`${result[index].name} / ${h.name}`};}}
 return result.sort((a,b)=>a.date.localeCompare(b.date));
}
export type CalendarInfo={sundays:number;holidayWeekdays:number;workableDays:number;holidays:Holiday[];restDates:string[];holidayWorked:string[]};
export function calendarInfo(from:string,to:string,entries:{date:string}[]=[],custom:Holiday[]=[]):CalendarInfo{
 const holidays=[...new Set([Number(from.slice(0,4)),Number(to.slice(0,4))])].flatMap(y=>holidaysForYear(y,custom)).filter(h=>h.date>=from&&h.date<=to);
 const holidaySet=new Set(holidays.filter(h=>h.level!=='escolar').map(h=>h.date)),worked=new Set(entries.map(e=>e.date));
 let sundays=0,holidayWeekdays=0,workableDays=0;const restDates:string[]=[];
 for(const d=new Date(`${from}T12:00:00`);d<=new Date(`${to}T12:00:00`);d.setDate(d.getDate()+1)){
 const date=iso(d.getFullYear(),d.getMonth()+1,d.getDate());if(d.getDay()===0){sundays++;restDates.push(date);}else if(holidaySet.has(date)){holidayWeekdays++;restDates.push(date);}else workableDays++;
 }
 return {sundays,holidayWeekdays,workableDays,holidays,restDates,holidayWorked:holidays.filter(h=>h.level!=='escolar'&&worked.has(h.date)).map(h=>h.date)};
}
export function dsrForPeriod(base:number,mode:'professor'|'calendar',calendar:CalendarInfo){
 if(mode==='professor')return {value:base/6,factor:1/6,description:'Professor horista: 1/6 (Súmula 351/TST). Feriados não somados novamente.'};
 const count=calendar.sundays+calendar.holidayWeekdays;
 const factor=calendar.workableDays>0?count/calendar.workableDays:0;
 return {value:base*factor,factor,description:`Simulação por calendário: ${count} descansos ÷ ${calendar.workableDays} dias restantes. Verificar jornada e norma coletiva.`};
}
