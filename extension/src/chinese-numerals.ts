const digits:Record<string,number>={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
const units:Record<string,number>={十:10,百:100,千:1000,万:10000};

function arabicNumber(value:string):number|null{
 if(!/[十百千万]/u.test(value)){
  const parsed=Array.from(value).map(char=>digits[char]);
  return parsed.every(digit=>digit!==undefined)?Number(parsed.join('')):null;
 }
 let total=0,group=0,digit=0;
 for(const char of value){
  if(char in digits){digit=digits[char];continue;}
  const unit=units[char];if(!unit)return null;
  if(unit===10000){total+=(group+digit)*unit;group=0;digit=0;continue;}
  group+=(digit||1)*unit;digit=0;
 }
 return total+group+digit;
}

/** Format spoken Chinese numbers only when a following unit makes the span unambiguous. */
export function normalizeChineseNumerals(text:string):string{
 return text.replace(/[零〇一二两三四五六七八九十百千万]+(?=年代|年|人|座|个|位|款|公尺|公顷|米|公里|盘|张|名|岁)/gu,value=>{
  const number=arabicNumber(value);return number===null?value:String(number);
 });
}
