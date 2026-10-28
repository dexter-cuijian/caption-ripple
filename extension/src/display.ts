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
