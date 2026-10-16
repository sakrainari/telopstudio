import {mergeStyle} from './presets.js';
import {allFonts,weightOf} from './fonts.js';
import {tokens} from './parser.js';
export function fontString(style){return `${weightOf(style.font)} ${style.size}px "${style.font}", sans-serif`;}
export function loadFonts(text='日本語テロップ'){return Promise.allSettled(allFonts().map(({family:font})=>document.fonts.load(fontString({font,size:40}),text||'日本語テロップ')));}
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.ceil(w);c.height=Math.ceil(h);return c;};
export function crop(source){
 const {width:w,height:h}=source,data=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
 let minX=w,minY=h,maxX=-1,maxY=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>0){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 if(maxX<0)return canvas(24,24);
 if(minX===0||minY===0||maxX===w-1||maxY===h-1)throw Error('描画範囲を超えました。文字サイズ・影を小さくしてください。');
 const out=canvas(maxX-minX+25,maxY-minY+25);out.getContext('2d').drawImage(source,minX,minY,maxX-minX+1,maxY-minY+1,12,12,maxX-minX+1,maxY-minY+1);return out;
}
const position=e=>e.position||'outside';
// Widths stack only with preceding strokes on the same side of the glyph.
function strokeWidth(s,index){const e=s.edges[index];return s.edges.slice(0,index+1).reduce((n,x)=>n+(x.on&&position(x)===position(e)?x.width:0),0)*(position(e)==='center'?1:2);}
function extent(s){return s.edges.reduce((n,e,i)=>Math.max(n,e.on&&position(e)!=='inside'?strokeWidth(s,i)/2:0),0)*(s.lineJoin==='miter'?(s.miterLimit||2):1);}
function glyph(t){
 const s=t.style,pad=Math.ceil(extent(s)+s.size*.3+8),w=Math.ceil(t.width+pad*2),h=Math.ceil(t.ascent+t.descent+pad*2),x=pad,y=pad+t.ascent;
 const mask=canvas(w,h),mc=mask.getContext('2d');mc.font=fontString(s);mc.fillText(t.char,x,y);
 const out=canvas(w,h),ctx=out.getContext('2d');
 if(s.fillOn!==false){ctx.font=fontString(s);ctx.fillStyle=s.color;if(s.gradient){const g=ctx.createLinearGradient(0,pad,0,pad+t.ascent+t.descent);g.addColorStop(0,s.color);g.addColorStop(1,s.color2);ctx.fillStyle=g;}ctx.fillText(t.char,x,y);}
 const layer=canvas(w,h),lc=layer.getContext('2d');
 for(let i=2;i>=0;i--){const e=s.edges[i];if(!e.on||!e.width)continue;lc.clearRect(0,0,w,h);lc.font=fontString(s);lc.lineJoin=s.lineJoin||'round';lc.lineCap=s.lineCap||'butt';lc.miterLimit=s.miterLimit||2;lc.lineWidth=strokeWidth(s,i);lc.strokeStyle=e.color;lc.strokeText(t.char,x,y);
  if(position(e)!=='center'){lc.globalCompositeOperation=position(e)==='inside'?'destination-in':'destination-out';lc.drawImage(mask,0,0);lc.globalCompositeOperation='source-over';}
  ctx.drawImage(layer,0,0);
 }
 return {image:out,pad};
}
export function render(row,roles){
 const style=mergeStyle(roles[row.role],row.override),measure=canvas(1,1).getContext('2d');
 const makeLine=()=>({items:[],width:0,ascent:style.size*.85,descent:style.size*.2});const lines=[makeLine()];let effect=0,maxSize=style.size;
 for(const token of tokens(row,style)){
  if(token.char==='\n'){lines.push(makeLine());continue;}
  const s=token.style;measure.font=fontString(s);const m=measure.measureText(token.char),line=lines.at(-1),ascent=Math.max(s.size*.85,m.actualBoundingBoxAscent||0),descent=Math.max(s.size*.2,m.actualBoundingBoxDescent||0);
  line.items.push({...token,x:line.width,width:m.width,ascent,descent});line.width+=m.width;line.ascent=Math.max(line.ascent,ascent);line.descent=Math.max(line.descent,descent);
  maxSize=Math.max(maxSize,s.size);effect=Math.max(effect,extent(s)+(s.shadow.on?s.shadow.blur*4+s.shadow.distance:0),Math.abs(m.actualBoundingBoxLeft||0),Math.max(0,(m.actualBoundingBoxRight||0)-m.width));
 }
 const gap=Math.max(16,maxSize*.18+effect*.12),textW=Math.max(1,...lines.map(l=>l.width)),textH=lines.reduce((n,l)=>n+l.ascent+l.descent,0)+gap*(lines.length-1);
 const pad=style.box.on?style.box.padding:0,margin=Math.ceil(effect+maxSize*.3+style.box.border+32),w=Math.ceil(textW+pad*2+margin*2),h=Math.ceil(textH+pad*2+margin*2);
 if(w>16384||h>16384||w*h>24000000)throw Error('画像が大きすぎます。カードを分割するか、改行・文字サイズを調整してください。');
 const work=canvas(w,h),ctx=work.getContext('2d',{willReadFrequently:true}),foreground=canvas(w,h),fg=foreground.getContext('2d');let y=margin+pad;
 for(const line of lines){line.left=margin+pad+(style.align==='left'?0:style.align==='right'?textW-line.width:(textW-line.width)/2);line.top=y;y+=line.ascent+line.descent+gap;}
 if(style.box.on){const b=style.box,back=canvas(w,h),bc=back.getContext('2d');bc.fillStyle=b.color;bc.strokeStyle=b.borderColor;bc.lineWidth=b.border;
  const rectangles=b.mode==='line'?lines.filter(l=>l.items.length).map(l=>[l.left-pad,l.top-pad,l.width+pad*2,l.ascent+l.descent+pad*2]):[[margin,margin,textW+pad*2,textH+pad*2]];
  // One compound path avoids dark seams where translucent line boxes overlap.
  bc.beginPath();for(const r of rectangles)bc.roundRect(...r,b.radius);bc.fill();if(b.border>0)bc.stroke();ctx.save();ctx.globalAlpha=b.opacity;ctx.drawImage(back,0,0);ctx.restore();
 }
 for(const line of lines)for(const t of line.items){const {image,pad:gp}=glyph(t),s=t.style,x=line.left+t.x-gp,y=line.top+line.ascent-t.ascent-gp;
  if(s.shadow.on){ctx.save();ctx.shadowColor=s.shadow.color;ctx.shadowBlur=s.shadow.blur;ctx.shadowOffsetX=s.shadow.distance;ctx.shadowOffsetY=s.shadow.distance;ctx.drawImage(image,x,y);ctx.restore();}
  fg.drawImage(image,x,y);
 }
 ctx.drawImage(foreground,0,0);return crop(work);
}
