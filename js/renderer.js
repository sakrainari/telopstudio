import {mergeStyle} from './presets.js';
import {allFonts,weightOf} from './fonts.js';
import {tokens} from './parser.js';
export function fontString(style){return `${weightOf(style.font)} ${style.size}px "${style.font}", sans-serif`;}
export function loadFonts(text='日本語テロップ'){return Promise.allSettled(allFonts().map(({family:font})=>document.fonts.load(fontString({font,size:40}),text||'日本語テロップ')));}
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
export function crop(source){
 const ctx=source.getContext('2d',{willReadFrequently:true}),{width:w,height:h}=source,data=ctx.getImageData(0,0,w,h).data;
 let minX=w,minY=h,maxX=-1,maxY=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>0){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 if(maxX<0)return canvas(24,24);
 if(minX===0||minY===0||maxX===w-1||maxY===h-1)throw Error('描画範囲を超えました。文字サイズ・影を小さくしてください。');
 const out=canvas(maxX-minX+25,maxY-minY+25);out.getContext('2d').drawImage(source,minX,minY,maxX-minX+1,maxY-minY+1,12,12,maxX-minX+1,maxY-minY+1);return out;
}
export function render(row,roles){
 const style=mergeStyle(roles[row.role],row.override),measure=canvas(1,1).getContext('2d');
 const lines=[{items:[],width:0,ascent:style.size*.85,descent:style.size*.2}];let effect=0,maxSize=style.size;
 for(const token of tokens(row,style)){
  if(token.char==='\n'){lines.push({items:[],width:0,ascent:style.size*.85,descent:style.size*.2});continue;}
  const s=token.style;measure.font=fontString(s);const m=measure.measureText(token.char),line=lines.at(-1);
  line.items.push({...token,x:line.width});line.width+=m.width;
  line.ascent=Math.max(line.ascent,m.actualBoundingBoxAscent||s.size*.85);line.descent=Math.max(line.descent,m.actualBoundingBoxDescent||s.size*.2);
  maxSize=Math.max(maxSize,s.size);const stroke=s.edges.reduce((n,e)=>n+(e.on?e.width:0),0);
  effect=Math.max(effect,stroke+(s.shadow.on?s.shadow.blur*4+s.shadow.distance:0),Math.abs(m.actualBoundingBoxLeft||0),Math.max(0,(m.actualBoundingBoxRight||0)-m.width));
 }
 const gap=Math.max(16,maxSize*.18+effect*.12),textW=Math.max(1,...lines.map(l=>l.width)),textH=lines.reduce((n,l)=>n+l.ascent+l.descent,0)+gap*(lines.length-1);
 const pad=style.box.on?style.box.padding:0,margin=Math.ceil(effect+maxSize*.3+style.box.border+32),w=Math.ceil(textW+pad*2+margin*2),h=Math.ceil(textH+pad*2+margin*2);
 if(w>16384||h>16384||w*h>24000000)throw Error('画像が大きすぎます。カードを分割するか、改行・文字サイズを調整してください。');
 const work=canvas(w,h),ctx=work.getContext('2d',{willReadFrequently:true});ctx.lineJoin='round';ctx.miterLimit=2;
 if(style.box.on){const b=style.box;ctx.save();ctx.globalAlpha=b.opacity;ctx.fillStyle=b.color;ctx.strokeStyle=b.borderColor;ctx.lineWidth=b.border;ctx.beginPath();ctx.roundRect(margin,margin,textW+pad*2,textH+pad*2,b.radius);ctx.fill();if(b.border>0)ctx.stroke();ctx.restore();}
 const positioned=[];let y=margin+pad;
 for(const line of lines){const offset=style.align==='left'?0:style.align==='right'?textW-line.width:(textW-line.width)/2;
  for(const t of line.items)positioned.push({...t,x:margin+pad+offset+t.x,y:y+line.ascent,ascent:line.ascent,descent:line.descent});y+=line.ascent+line.descent+gap;}
 // Render complete layers, so adjacent glyph outlines never paint over fills.
 for(const t of positioned){const s=t.style;if(!s.shadow.on)continue;ctx.save();ctx.font=fontString(s);ctx.shadowColor=s.shadow.color;ctx.shadowBlur=s.shadow.blur;ctx.shadowOffsetX=s.shadow.distance;ctx.shadowOffsetY=s.shadow.distance;ctx.fillStyle=s.edges.findLast(e=>e.on)?.color||s.color;const width=s.edges.reduce((n,e)=>n+(e.on?e.width:0),0);if(width){ctx.lineWidth=width*2;ctx.strokeStyle=ctx.fillStyle;ctx.strokeText(t.char,t.x,t.y);}ctx.fillText(t.char,t.x,t.y);ctx.restore();}
 for(let layer=2;layer>=0;layer--)for(const t of positioned){const s=t.style;if(!s.edges[layer].on)continue;const width=s.edges.slice(0,layer+1).reduce((n,e)=>n+(e.on?e.width:0),0);if(!width)continue;ctx.font=fontString(s);ctx.lineWidth=width*2;ctx.strokeStyle=s.edges[layer].color;ctx.strokeText(t.char,t.x,t.y);}
 for(const t of positioned){const s=t.style;ctx.font=fontString(s);ctx.fillStyle=s.color;if(s.gradient){const g=ctx.createLinearGradient(0,t.y-t.ascent,0,t.y+t.descent);g.addColorStop(0,s.color);g.addColorStop(1,s.color2);ctx.fillStyle=g;}ctx.fillText(t.char,t.x,t.y);}
 return crop(work);
}
