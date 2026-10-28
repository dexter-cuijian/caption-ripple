/** Explicit, observed ASR name corrections. Keep the original hypothesis in sourceRaw. */
const chineseNames:ReadonlyArray<readonly [string,string]>=[['讲万安','蒋万安']];

export function correctRecognizedNames<T extends {sourceText:string;sourceLanguage?:string;sourceRaw?:string}>(event:T):T&{sourceRaw:string}{
 const raw=event.sourceRaw??event.sourceText;
 if(event.sourceLanguage&&event.sourceLanguage!=='zh'&&event.sourceLanguage!=='auto')return{...event,sourceRaw:raw};
 let corrected=event.sourceText;
 for(const[heard,name]of chineseNames)corrected=corrected.replaceAll(heard,name);
 return{...event,sourceRaw:raw,sourceText:corrected};
}
