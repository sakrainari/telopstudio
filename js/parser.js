import {uid,mergeStyle} from './presets.js';
export function parseBlock(block){
 let text=block.trim(),role='A';const prefix=text.match(/^([ABNＡＢＮ])[:：]\s*/i);
 if(prefix){role=prefix[1].normalize('NFKC').toUpperCase();text=text.slice(prefix[0].length);}
 else if(text.startsWith('※'))role='※';else if(/^[!！]/.test(text)){role='!';text=text.slice(1).trimStart();}
 return {id:uid(),role,text,override:{},marks:Array.from(text,()=>null)};
}
export function parseScript(text){return text.replace(/\r\n?/g,'\n').split(/\n[ \t]*\n+/).filter(s=>s.trim()).map(parseBlock);}
export function updateText(row,text){
 const a=Array.from(row.text),b=Array.from(text);let start=0,end=0;
 while(start<Math.min(a.length,b.length)&&a[start]===b[start])start++;
 while(end<Math.min(a.length-start,b.length-start)&&a[a.length-1-end]===b[b.length-1-end])end++;
 row.marks=[...row.marks.slice(0,start),...Array(Math.max(0,b.length-start-end)).fill(null),...(end?row.marks.slice(a.length-end):[])];row.text=text;
}
export function selectionRange(text,start,end){return {start:Array.from(text.slice(0,start)).length,end:Array.from(text.slice(0,end)).length};}
export function markRange(row,range,patch,mode='merge'){
 for(let i=range.start;i<range.end;i++){
  if(mode==='inherit')row.marks[i]=null;
  else if(mode==='clear')row.marks[i]={noAuto:true};
  else {const old=row.marks[i]||{};const next={...old,...patch};for(const k of ['shadow','auto'])if(patch[k])next[k]={...old[k],...patch[k]};if(patch.edges)next.edges=Array.from({length:3},(_,j)=>({...old.edges?.[j],...patch.edges[j]}));row.marks[i]=next;}
 }
}
export function tokens(row,style){
 const flags=new Set();
 if(style.auto.on){const pattern=/[0-9０-９]+(?:[.,．，][0-9０-９]+)*(?:万円|億円|万|億|円|[%％]|つ|個|人|回|秒|分|時間|年|日|倍|本|歳|点|位|km|cm|mm|kg|m|g)|[!！?？]+|『[^』\n]*』|【[^】\n]*】/gu;
  for(const m of row.text.matchAll(pattern)){const from=Array.from(row.text.slice(0,m.index)).length;for(let i=from;i<from+Array.from(m[0]).length;i++)flags.add(i);}}
 return Array.from(row.text,(char,i)=>{const mark=row.marks[i]||{};let s=style;if(flags.has(i)&&!mark.noAuto)s=mergeStyle(s,{size:s.size*s.auto.scale,color:s.auto.color,gradient:false});return {char,style:mergeStyle(s,mark)};});
}
