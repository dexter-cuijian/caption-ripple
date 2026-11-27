const recognizedAbsence=/(?<![\p{L}\p{N}])불[ \t]*참석석?(?=했|하|한|할|함|[ \t.,!?。]|$)/gu;
const koreanAbsence=/(?<![\p{L}\p{N}])불참(?:했|하|한|할|함|[ \t.,!?。]|$)/u;
const chineseAttendance=/(?:参加|出席|到会|到场|参会|列席)/u;
const chineseAbsence=/(?:缺席|缺阵|未到会|未到场|未参会|(?:没(?:有)?|未|不|拒绝|放弃|无法)[^。！？；，、]{0,6}(?:参加|出席|到会|到场|参会|列席))/u;
const content=/[\p{L}\p{N}]/u;
const koreanNumberUnits:Record<string,number>={천:1000,백:100,십:10};
const mixedKoreanCount=/(?<![\p{L}\p{N}.,+-])[0-9영일이삼사오육칠팔구십백천]+(?=[ \t]*(?:명|위|가지))/gu;
const gluedHouseholdCount=/\b(family of)(\d+)(?=$|[\s.,!?;:])/giu;

function canonicalKoreanCount(value:string):string{
 if(!/[0-9]/u.test(value)||!/[십백천]/u.test(value))return value;
 const number=(text:string)=>/^[0-9]+$/u.test(text)?Number(text):text.length===1?'영일이삼사오육칠팔구'.indexOf(text):-1;
 const parts=value.split(/([십백천])/u);
 let previousUnit=Infinity,total=0;
 for(let index=1;index<parts.length;index+=2){
  const unit=koreanNumberUnits[parts[index]],count=parts[index-1]?number(parts[index-1]):1;
  if(unit>=previousUnit||count<1||count>9)return value;
  total+=count*unit;
  previousUnit=unit;
 }
 const tail=parts.at(-1)??'';
 const remainder=tail?number(tail):0;
 return remainder>=0&&remainder<previousUnit?String(total+remainder):value;
}

/** Normalize verified recognition formats on the translation input only. */
export async function translateChecked(
 source:string,sourceLanguage:string,targetLanguage:string,translate:(prepared:string)=>Promise<string>
):Promise<string>{
 const toChinese=/^zh(?:-|$)/.test(targetLanguage),koreanToChinese=sourceLanguage==='ko'&&toChinese;
 let prepared=source;
 if(koreanToChinese)prepared=source.replace(recognizedAbsence,'불참').replace(mixedKoreanCount,canonicalKoreanCount);
 if(sourceLanguage==='en'&&toChinese)prepared=source.replace(gluedHouseholdCount,'$1 $2');
 const translated=await translate(prepared);
 if(content.test(source)&&!content.test(translated))throw new Error('译文仅包含标点或没有可读文字；已保留原文。');
 if(koreanToChinese&&koreanAbsence.test(prepared)&&chineseAttendance.test(translated)&&!chineseAbsence.test(translated)){
  throw new Error('译文可能丢失“不出席”的否定含义；已保留原文。');
 }
 return translated;
}
