export function errorRate(reference,hypothesis,unit='char') {
  const tokenize=text=>{
    const normalized=text.normalize('NFKC').toLowerCase();
    return unit==='word' ? normalized.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)??[] : Array.from(normalized.replace(/[\p{P}\p{Z}\s]/gu,''));
  };
  const a=tokenize(reference),b=tokenize(hypothesis);
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const row=[i];
    for(let j=1;j<=b.length;j++)row.push(Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1)));
    previous=row;
  }
  const edits=previous[b.length];
  return {edits,units:a.length,rate:a.length?edits/a.length:null};
}
