const splitAbsence=/(?<![\p{L}\p{N}])불[ \t]*참석(?=했|하|한|할|함|[ \t.,!?。]|$)/gu;
const koreanAbsence=/(?<![\p{L}\p{N}])불참(?:했|하|한|할|함|[ \t.,!?。]|$)/u;
const chineseAttendance=/(?:参加|出席|到会|到场|参会|列席)/u;
const chineseAbsence=/(?:缺席|缺阵|未到会|未到场|未参会|(?:没(?:有)?|未|不|拒绝|放弃|无法)[^。！？；，、]{0,6}(?:参加|出席|到会|到场|参会|列席))/u;
const content=/[\p{L}\p{N}]/u;

/** Repair a known ASR compound on the translation input only. */
export async function translateChecked(
 source:string,sourceLanguage:string,targetLanguage:string,translate:(prepared:string)=>Promise<string>
):Promise<string>{
 const koreanToChinese=sourceLanguage==='ko'&&/^zh(?:-|$)/.test(targetLanguage);
 const prepared=koreanToChinese?source.replace(splitAbsence,'불참'):source;
 const translated=await translate(prepared);
 if(content.test(source)&&!content.test(translated))throw new Error('译文仅包含标点或没有可读文字；已保留原文。');
 if(koreanToChinese&&koreanAbsence.test(prepared)&&chineseAttendance.test(translated)&&!chineseAbsence.test(translated)){
  throw new Error('译文可能丢失“不出席”的否定含义；已保留原文。');
 }
 return translated;
}
