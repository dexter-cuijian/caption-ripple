/** Display-only stable pages. Raw ASR is retained verbatim in history; these are not acoustic boundaries. */
export function subtitlePage(raw:string){
 const sentences:string[]=[];let start=0;const chars=Array.from(raw);
 for(let i=0;i<chars.length;i++)if(/[。！？!?]/.test(chars[i])||(chars[i]==='.'&&/\s/.test(chars[i+1]??''))){sentences.push(chars.slice(start,i+1).join(''));start=i+1;}
 if(start<chars.length)sentences.push(chars.slice(start).join(''));
 const pages:string[]=[];
 for(const sentence of sentences){const text=sentence.trim();if(!text)continue;
 if(/[\u3400-\u9fff]/.test(text)){const characters=Array.from(text);for(let offset=0;offset<characters.length;offset+=28)pages.push(characters.slice(offset,offset+28).join(''));}
 else{const words=text.split(/\s+/);for(let offset=0;offset<words.length;offset+=12)pages.push(words.slice(offset,offset+12).join(' '));}}
 return{text:pages.at(-1)??'',index:Math.max(0,pages.length-1),count:pages.length};
}
/** Conservative display-only cleanup. Raw interim hypotheses remain unchanged in storage. */
function internalCommas(text:string){
 if(!/[\u3400-\u9fff]/u.test(text))return text;
 const connectors=text.replace(/所以|不过|但是|因此|然后|因为/gu,(marker,index:number,input:string)=>{
  const before=input.slice(0,index),after=input.slice(index+marker.length);
  const boundary=Math.max(...['，','。','！','？','；',',',';'].map(mark=>before.lastIndexOf(mark)));
  return !/[，。！？；,;]$/u.test(before)&&Array.from(before.slice(boundary+1)).length>=8&&Array.from(after).length>=4?`，${marker}`:marker;
 });
 return connectors.replace(/呢/gu,(particle,index:number,input:string)=>{
  const before=input.slice(0,index),after=input.slice(index+1);
  const boundary=Math.max(...['，','。','！','？','；',',',';'].map(mark=>before.lastIndexOf(mark)));
  return !/^[，。！？；,;]/u.test(after)&&Array.from(before.slice(boundary+1)).length>=8&&Array.from(after).length>=4?`${particle}，`:particle;
 });
}
export function displaySource(raw:string,phase:string,splitReason?:string){
 const letters=raw.match(/[a-z]/gi)??[];
 if(letters.length>=8&&letters.every(letter=>letter===letter.toUpperCase()))raw=raw.toLowerCase().replace(/\bi\b/g,'I').replace(/(^|[.!?]\s+)([a-z])/g,(_match,prefix:string,letter:string)=>prefix+letter.toUpperCase());
 if(phase!=='final')return internalCommas(raw);
 let text=raw.replace(/(^|[，。！？、\s])(?:嗯|啊)(?=[，。！？、\s]|$)/gu,'$1').replace(/(^|[，。！？、\s])(?:[嗯啊][\s，、]*){2,}(?=[，。！？、\s]|$)/gu,'$1').replace(/^[，、\s]+|[，、\s]+$/gu,'').replace(/[，、]{2,}/g,'，');
 text=internalCommas(text);
 if(text&&!/[。！？!?，,.;；]$/.test(text))text+=/[\u3400-\u9fff]/.test(text)?(splitReason==='silence'?'。':'，'):(splitReason==='silence'?'.':',');return text;
}
