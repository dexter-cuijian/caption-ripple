const marker='ZXQ8ZXQ';
const incompleteEnglish=/\b(?:a|an|the|of|to|for|from|with|in|on|at|by|and|or|but|who|whom|whose|which|that)\.?$/iu;

interface ContextSpan {
 sourceLanguage:string;targetLanguage:string;sourceText:string;engine?:string;splitReason?:string;start?:number;end?:number;
}

export function continuationInput(previous:ContextSpan,current:ContextSpan):string|undefined{
 if(previous.engine!=='sherpa-onnx/wasm-sensevoice-small-int8'||current.engine!==previous.engine||previous.splitReason!=='max-duration')return;
 if(previous.sourceLanguage!=='en'||current.sourceLanguage!=='en'||previous.targetLanguage!=='zh'||current.targetLanguage!=='zh')return;
 const gap=(current.start??NaN)-(previous.end??NaN);
 if(!Number.isFinite(gap)||gap<-.15||gap>.8)return;
 const left=previous.sourceText.trim(),right=current.sourceText.trim();
 if(!right||left.length+right.length>500||left.includes(marker)||right.includes(marker)||!incompleteEnglish.test(left))return;
 return `${left.replace(/\.$/u,'')} ${marker} ${right}`;
}

export function splitContextTranslation(text:string):[string,string]|undefined{
 const parts=text.split(marker).map(part=>part.trim());
 if(parts.length!==2||parts.some(part=>!/[\p{L}\p{N}]/u.test(part)))return;
 return [parts[0],parts[1]];
}
