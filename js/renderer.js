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
 const s=t.style,pad=Math.ceil(extent(s)+Math.max(s.size*.3,t.overhang||0)+8),w=Math.ceil(t.width+pad*2),h=Math.ceil(t.ascent+t.descent+pad*2),x=pad,y=pad+t.ascent;
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
// Geometry is separate from paint: shadows never alter text spacing or box layout.
export function layout(row,roles){
 const style=mergeStyle(roles[row.role],row.override),measure=canvas(1,1).getContext('2d');
 const makeLine=()=>({items:[],width:0,ascent:style.size*.85,descent:style.size*.2});const lines=[makeLine()];let effect=0;
 for(const token of tokens(row,style)){
  if(token.char==='\n'){lines.push(makeLine());continue;}
  const s=token.style;measure.font=fontString(s);const m=measure.measureText(token.char),line=lines.at(-1),prev=line.items.at(-1);
  const x=prev?prev.x+Math.max(1,prev.width+(prev.style.letterSpacing||0)):0;
  const ascent=Math.max(s.size*.85,m.actualBoundingBoxAscent||0),descent=Math.max(s.size*.2,m.actualBoundingBoxDescent||0),overhang=Math.max(Math.abs(m.actualBoundingBoxLeft||0),(m.actualBoundingBoxRight||0)-m.width);
  line.items.push({...token,x,width:m.width,ascent,descent,overhang});line.width=Math.max(line.width,x+m.width);line.ascent=Math.max(line.ascent,ascent);line.descent=Math.max(line.descent,descent);
  effect=Math.max(effect,extent(s)+(s.shadow.on?s.shadow.blur*4+s.shadow.distance:0)+overhang+s.size*.3);
 }
 const gap=style.lineGap??24;let y=0;
 for(const line of lines){line.top=y;line.height=line.ascent+line.descent;y+=Math.max(1,line.height+gap);}
 const textW=Math.max(1,...lines.map(l=>l.width)),textH=Math.max(1,...lines.map(l=>l.top+l.height));
 const b=style.box,padding={top:b.padTop??b.padding,right:b.padRight??b.padding,bottom:b.padBottom??b.padding,left:b.padLeft??b.padding};
 const ax={left:0,center:.5,right:1}[b.alignX]??.5,ay={top:0,center:.5,bottom:1}[b.alignY]??.5,align={left:0,center:.5,right:1}[style.align]??.5;
 const rectangles=[];
 if(!b.on){for(const line of lines)line.left=(textW-line.width)*align;}
 else if(b.mode==='line'){
  const widths=lines.map(l=>b.sizeMode==='fixed'?b.width:l.width+padding.left+padding.right),heights=lines.map(l=>b.sizeMode==='fixed'?b.height:l.height+padding.top+padding.bottom),blockW=Math.max(...widths);let top=0;
  lines.forEach((l,i)=>{const w=widths[i],h=heights[i],left=(blockW-w)*align;if(l.items.length)rectangles.push([left,top,w,h]);l.left=left+padding.left+(w-padding.left-padding.right-l.width)*ax+(b.offsetX||0);l.top=top+padding.top+(h-padding.top-padding.bottom-l.height)*ay+(b.offsetY||0);top+=Math.max(1,h+gap);});
 }else{
  const w=b.sizeMode==='fixed'?b.width:textW+padding.left+padding.right,h=b.sizeMode==='fixed'?b.height:textH+padding.top+padding.bottom;
  rectangles.push([0,0,w,h]);const x=padding.left+(w-padding.left-padding.right-textW)*ax+(b.offsetX||0),y=padding.top+(h-padding.top-padding.bottom-textH)*ay+(b.offsetY||0);
  for(const line of lines){line.left=x+(textW-line.width)*align;line.top+=y;}
 }
 let minX=0,minY=0,maxX=1,maxY=1;
 for(const l of lines){minX=Math.min(minX,l.left);minY=Math.min(minY,l.top);maxX=Math.max(maxX,l.left+l.width);maxY=Math.max(maxY,l.top+l.height);}
 for(const [x,y,w,h] of rectangles){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+w);maxY=Math.max(maxY,y+h);}
 const margin=Math.ceil(effect+b.border+32),width=Math.ceil(maxX-minX+margin*2),height=Math.ceil(maxY-minY+margin*2);
 if(width>16384||height>16384||width*height>24000000)throw Error('画像が大きすぎます。カードを分割するか、サイズ・間隔を調整してください。');
 return {style,lines,rectangles,width,height,shiftX:margin-minX,shiftY:margin-minY};
}
export function render(row,roles){
 const plan=layout(row,roles),{style,lines,rectangles,width:w,height:h,shiftX,shiftY}=plan;
 const work=canvas(w,h),ctx=work.getContext('2d',{willReadFrequently:true}),foreground=canvas(w,h),fg=foreground.getContext('2d');
 if(style.box.on){const b=style.box,back=canvas(w,h),bc=back.getContext('2d');bc.fillStyle=b.color;bc.strokeStyle=b.borderColor;bc.lineWidth=b.border;
  bc.beginPath();for(const [x,y,width,height] of rectangles)bc.roundRect(x+shiftX,y+shiftY,width,height,b.radius);bc.fill();if(b.border>0)bc.stroke();ctx.save();ctx.globalAlpha=b.opacity;ctx.drawImage(back,0,0);ctx.restore();
 }
 for(const line of lines)for(const t of line.items){const {image,pad:gp}=glyph(t),s=t.style,x=shiftX+line.left+t.x-gp,y=shiftY+line.top+line.ascent-t.ascent-gp;
  if(s.shadow.on&&(s.shadow.opacity??1)>0){const a=(s.shadow.angle??45)*Math.PI/180;ctx.save();const hex=s.shadow.color;ctx.shadowColor=`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${s.shadow.opacity??1})`;ctx.shadowBlur=s.shadow.blur;ctx.shadowOffsetX=s.shadow.distance*Math.cos(a);ctx.shadowOffsetY=s.shadow.distance*Math.sin(a);ctx.drawImage(image,x,y);ctx.restore();}
  fg.drawImage(image,x,y);
 }
 ctx.drawImage(foreground,0,0);return crop(work);
}
