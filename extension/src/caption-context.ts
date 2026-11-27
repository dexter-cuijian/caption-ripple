const marker='ZXQ8ZXQ';
const incompleteEnglish=/\b(?:a|an|the|of|to|for|from|with|in|on|at|by|and|or|but|who|whom|whose|which|that)\.?$/iu;

const shortReply=/^(?:yeah|yep|yes|no|nope|okay|ok|right|uh|um|well|hmm|mm-hmm)[.!?…]*$/iu;
const comparisonLead=/(?:^|(?<=[.!?]\s))(For (?:millions|thousands|many|some|most) like (?:\d{1,3}[ -]year[ -]old )?\p{Lu}[\p{L}'’-]+(?: \p{Lu}[\p{L}'’-]+){0,3})(?:\s*,?\s+(who)(?:\s*,?\s+(like(?: (?:many|most|some)(?: \p{Lu}\p{L}+s)?)?))?)?[.,]?$/u;
const comparisonTail=/^(?:([Ll]ike) )?((?:[Mm]any|[Mm]ost|[Ss]ome) [\p{L}'’-]+(?: [\p{L}'’-]+){0,3}?),?\s+((?:goes by|uses|lives|works|speaks|has|wears)\b[^.!?]*?)[.,]\s+((?:[Tt]his|[Tt]hat|[Tt]hese|[Tt]hose)\s+[^.!?]+\.)(.*)$/u;

interface ContextSpan {
 sourceLanguage:string;targetLanguage:string;sourceText:string;engine?:string;splitReason?:string;start?:number;end?:number;
}

export function continuationInput(previous:ContextSpan,current:ContextSpan):string|undefined{
 if(previous.engine!=='sherpa-onnx/wasm-sensevoice-small-int8'||current.engine!==previous.engine||previous.splitReason!=='max-duration')return;
 if(previous.sourceLanguage!=='en'||current.sourceLanguage!=='en'||previous.targetLanguage!=='zh'||current.targetLanguage!=='zh')return;
 const gap=(current.start??NaN)-(previous.end??NaN);
 if(!Number.isFinite(gap)||gap<-.15||gap>.8)return;
 const left=previous.sourceText.trim(),right=current.sourceText.trim();
 if(!right||shortReply.test(right)||left.length+right.length>500||left.includes(marker)||right.includes(marker))return;
 const lead=comparisonLead.exec(left);
 const continued=lead?.[3]&&!/^[Ll]ike\s/u.test(right)?`${lead[3]} ${right}`:right;
 const tail=lead&&comparisonTail.exec(continued);
 if(lead&&tail){
  const [,like,group,description,main,rest]=tail;
  // Without “like”, require a retained “who” and a plural group followed by the singular naming verb.
  const omittedLike=lead[2]&&/^[Mm]any \p{Lu}\p{L}+s$/u.test(group)&&/^goes by (?:just one|only one|a single|one) name$/u.test(description);
  if(like||omittedLike){
   return `${left.slice(0,lead.index)}${lead[1]}, ${main[0].toLowerCase()+main.slice(1)} ${marker} Like ${group[0].toLowerCase()+group.slice(1)}, this person ${description}.${rest}`;
  }
 }
 if(!incompleteEnglish.test(left))return;
 return `${left.replace(/\.$/u,'')} ${marker} ${right}`;
}

const textUnits=(text:string)=>[...text.matchAll(/[\p{L}\p{N}]/gu)].length;

export function splitContextTranslation(text:string,input:string):[string,string]|undefined{
 const parts=text.split(marker).map(part=>part.trim());
 if(parts.length!==2)return;
 const source=input.split(marker).map(textUnits),target=parts.map(textUnits);
 if(source.length!==2||source.some(count=>!count)||target.some(count=>!count))return;
 const sourceTotal=source[0]+source[1],targetTotal=target[0]+target[1];
 // A preserved marker does not guarantee alignment when the target language reorders a clause.
 if(target.some((count,index)=>count/targetTotal<(source[index]/sourceTotal)/2))return;
 return [parts[0],parts[1]];
}
