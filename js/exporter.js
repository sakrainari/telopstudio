export function toBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNGを生成できませんでした。')),'image/png'));}
export function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function savePNG(canvas,name){download(await toBlob(canvas),name);}
export function copyPNG(canvas){
 if(!window.isSecureContext||!navigator.clipboard?.write||!window.ClipboardItem)throw Error('この環境では画像コピーできません。HTTPSまたはlocalhostで開くか、PNG保存を使ってください。');
 return navigator.clipboard.write([new ClipboardItem({'image/png':toBlob(canvas)})]);
}
export function filename(row,index){const title=row.text.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'').trim().slice(0,24)||'テロップ';return `${String(index+1).padStart(3,'0')}_${row.role==='!'?'TITLE':row.role==='※'?'NOTE':row.role}_${title}.png`;}
export async function exportZIP(project,render,onProgress,selectedIds=null){
 if(!window.JSZip)throw Error('JSZipを読み込めませんでした。インターネット接続を確認して再読み込みしてください。');
 const entries=project.rows.map((row,index)=>({row,index})).filter(({row})=>!selectedIds||selectedIds.has(row.id));
 if(!entries.length)throw Error('書き出すテロップを選択してください。');
 const zip=new window.JSZip();
 for(let i=0;i<entries.length;i++){const {row,index}=entries[i];try{zip.file(filename(row,index),await toBlob(render(row,project.roles)));}catch(e){throw Error(`${index+1}枚目：${e.message}`);}onProgress(i+1,entries.length);await new Promise(r=>setTimeout(r,0));}
 download(await zip.generateAsync({type:'blob'}),`${project.name.replace(/[\\/:*?"<>|]/g,'_')||'telops'}${selectedIds?'_選択分':''}.zip`);
}
