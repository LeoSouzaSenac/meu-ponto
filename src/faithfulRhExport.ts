/** Edits worksheet XML inside the user's actual ADP/RH template.
 * No workbook reconstruction: all other OOXML parts, styles, merged ranges,
 * printable settings and original worksheet names are preserved.
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import type { Store, Period } from './engine';
import { duration } from './engine';

const clockColumns: [string,string,string][] = [['C','D','J'],['E','F','L'],['G','H','N']];
const editedColumns = ['C','D','E','F','G','H','J','L','N'];
const escapeXml=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const cellPattern=(addr:string)=>new RegExp(`<c\\b([^>]*\\br="${addr}"[^>]*?)(?:\\s*/>|>([\\s\\S]*?)<\\/c>)`);
function rewriteCell(xml:string,addr:string,content:string,type?:'inlineStr'){
 const re=cellPattern(addr);const match=re.exec(xml);
 if(!match)throw new Error(`Célula ${addr} não existe no modelo oficial.`);
 const attrs=match[1].replace(/\s+t="[^"]*"/g,'');
 const output=`<c${attrs}${type?' t="inlineStr"':''}>${content}</c>`;
 return xml.slice(0,match.index)+output+xml.slice(match.index+match[0].length);
}
function cleanCell(xml:string,addr:string){return rewriteCell(xml,addr,'');}
function numCell(xml:string,addr:string,num:number){return rewriteCell(xml,addr,`<v>${Number(num.toPrecision(15))}</v>`);}
function textCell(xml:string,addr:string,value:string){return rewriteCell(xml,addr,`<is><t>${escapeXml(value)}</t></is>`,'inlineStr');}
function cachedFormula(xml:string,addr:string,num:number){
 const re=cellPattern(addr);const match=re.exec(xml);
 if(!match || !match[2]?.includes('<f'))throw new Error(`Fórmula de total ausente em ${addr}.`);
 const content=match[2].replace(/<v>[^<]*<\/v>/,`<v>${Number(num.toPrecision(15))}</v>`);
 return rewriteCell(xml,addr,content);
}
function noteLabel(note:string){
 if(/esquecimento/i.test(note))return 'ESQUECIMENTO';
 return note.toLocaleUpperCase('pt-BR');
}
function slotChoice(start:string,used:Set<number>){
 const h=Number(start.slice(0,2));
 const preferred=h<12?0:h<18?1:2;
 for(let i=preferred;i<3;i++)if(!used.has(i))return i;
 return -1;
}
function periodsSheetNumber(key:string):number{
 const [y,m]=key.split('-').map(Number);
 if(y===2026&&m>=2&&m<=12)return m+1;
 if(y===2027&&m===1)return 14;
 throw new Error(`O modelo entregue contém competências até janeiro/2027. Não exporte ${key} usando uma aba de outro ano.`);
}
function isoDateFromKey(key:string,offset:number){const[y,m]=key.split('-').map(Number);const d=new Date(y,m-2,16+offset,12);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

export function exportExactRhWorkbook(template:Uint8Array,store:Store,p:Period):Uint8Array{
 const sheetNumber=periodsSheetNumber(p.key);
 const files=unzipSync(template);
 const chosen=`xl/worksheets/sheet${sheetNumber}.xml`;
 if(!files[chosen])throw new Error('Aba esperada não existe no Excel original.');
 const inputRows=new Map<string,{start:string;end:string;note:string;slot:number;minutes:number}[]>();
 let included=0;
 for(const a of p.allocations){
  const e=store.entries.find(x=>x.id===a.id);
  if(!e)throw new Error('Uma hora complementar não tem registro de origem.');
  if(e.date<p.from||e.date>p.to)throw new Error(`Há horas pendentes de ${e.date} para esta competência. Confirme com o RH como lançar a data original antes de exportar.`);
  if(a.minutes!==duration(e))throw new Error(`O intervalo de ${e.date}, ${e.start}–${e.end}, cabe só parcialmente no limite mensal. Ajuste com o RH antes de exportar.`);
  const dayOffset=Math.round((new Date(`${e.date}T12:00:00`).getTime()-new Date(`${p.from}T12:00:00`).getTime())/86400000);
  if(dayOffset<0||dayOffset>30)throw new Error(`Data fora do modelo: ${e.date}.`);
  const dayRecords=inputRows.get(e.date)||[];
  const used=new Set(dayRecords.map(x=>x.slot));
  const slot=slotChoice(e.start,used);
  if(slot<0)throw new Error(`Mais horários no dia ${e.date} do que o modelo comporta. Não exportado para evitar mudança no layout.`);
  dayRecords.push({start:e.start,end:e.end,note:noteLabel(e.note),slot,minutes:a.minutes});
  inputRows.set(e.date,dayRecords);
  included+=a.minutes;
 }
 if(p.clockMinutes+included>store.config.capMinutes)throw new Error('Horas batidas + complementares excedem o limite configurado. Exportação bloqueada.');
 // All worksheet tabs remain exactly where they are. Only value/formula caches
 // in their calendar cells are cleared; formatting and other content stay intact.
 for(let n=3;n<=14;n++){
  const path=`xl/worksheets/sheet${n}.xml`;
  if(!files[path])continue;
  let xml=strFromU8(files[path]);
  const sheetKey=n===14?'2027-01':`2026-${String(n-1).padStart(2,'0')}`;
  const [cy,cm]=sheetKey.split('-').map(Number);
  const days=Math.round((new Date(cy,cm-1,16,12).getTime()-new Date(cy,cm-2,16,12).getTime())/86400000);
  for(let row=4;row<4+days;row++){
   for(const col of editedColumns)xml=cleanCell(xml,`${col}${row}`);
   xml=cachedFormula(xml,`I${row}`,0);
  }
  xml=cachedFormula(xml,`I${4+days}`,0);
  if(n===sheetNumber){
   let periodSum=0;
   for(let i=0;i<days;i++){
    const date=isoDateFromKey(p.key,i);
    const row=i+4;let rowSum=0;
    for(const e of inputRows.get(date)||[]){
     const [inCol,outCol,noteCol]=clockColumns[e.slot];
     const asFraction=(hhmm:string)=>{const[h,m]=hhmm.split(':').map(Number);return (h*60+m)/1440;};
     xml=numCell(xml,`${inCol}${row}`,asFraction(e.start));
     xml=numCell(xml,`${outCol}${row}`,asFraction(e.end));
     if(e.note)xml=textCell(xml,`${noteCol}${row}`,e.note);
     rowSum+=e.minutes;
    }
    xml=cachedFormula(xml,`I${row}`,rowSum/1440);
    periodSum+=rowSum;
   }
   xml=cachedFormula(xml,`I${4+days}`,periodSum/1440);
   if(periodSum!==included)throw new Error('A soma das horas exportadas está divergente.');
  }
  files[path]=strToU8(xml);
 }
 // Nome preenchido uma única vez no sharedStrings; mantém as referências de cada aba.
 const shared='xl/sharedStrings.xml';
 if(files[shared]){
  const old=strFromU8(files[shared]);
  const name=escapeXml(store.config.holderName||'');
  files[shared]=strToU8(old.replace(/Nome: (?:Leonardo de Souza)?/g,`Nome: ${name}`));
 }
 // Leave ALL original OOXML parts, media, drawings, styles, formulas, print area,
 // names and worksheet order in the archive. No new or renamed sheets.
 return zipSync(files,{level:6});
}
