const inserted=/[\s，。！？、；：,.!?;:…]/u;
const boundary=/[，。！？；,.!?;]/u;
const han=/\p{Script=Han}/u;
const clauseSize=text=>han.test(text)?Array.from(text.replace(/[\s，。！？、；：,.!?;:…]/gu,'')).length:text.trim().split(/\s+/u).filter(Boolean).length;
const commonPrefix=values=>{let first=values[0]??'',end=first.length;for(const value of values.slice(1)){let n=0;while(n<end&&n<value.length&&value[n]===first[n])n++;end=n;}return end;};

/** Only insert punctuation. Native letters, numbers, names and symbols must survive. */
function alignPunctuation(raw,output){
  if(typeof output!=='string')return null;
  let cursor=0,offset=0;const marks=[],positions=[];
  for(const char of output){
    while(cursor<raw.length&&/\s/u.test(raw[cursor])&&raw[cursor]!==char)cursor++;
    if(raw.startsWith(char,cursor))cursor+=char.length;
    else if(!inserted.test(char)||/[,.]/u.test(char)&&/\d/u.test(raw[cursor-1]??'')&&/\d/u.test(raw[cursor]??''))return null;
    offset+=char.length;
    positions.push({rawEnd:cursor,outputEnd:offset});
    if(boundary.test(char))marks.push({rawEnd:cursor,outputEnd:offset,char});
  }
  while(cursor<raw.length&&/\s/u.test(raw[cursor]))cursor++;
  return cursor===raw.length?{output,marks,positions}:null;
}

/** Logical source clauses; never feeds padding, resets or modifies acoustic input. */
export class StablePunctuation {
  constructor(punctuate,{stableMs=500,intervalMs=500,minTailChars=6,minClauseChars=10,minClauseWords=4,maxInputChars=512,contextChars=120,maxPunctuationMs=150,allowCommit=true,clock=()=>performance.now()}={}){
    Object.assign(this,{punctuate,stableMs,intervalMs,minTailChars,minClauseChars,minClauseWords,maxInputChars,contextChars,maxPunctuationMs,allowCommit,clock});this.reset();
  }
  reset(){this.committed='';this.observations=[];this.lastPunctAt=-Infinity;this.pendingStart=false;this.punctuationCode=null;this.punctuationMs=0;}
  update(raw,{audioMs=0,final=false}={}){
    raw=String(raw??'');
    if(!raw.startsWith(this.committed)){const error=new Error('Committed source prefix changed; reset capture or switch ASR profile');error.code='source_prefix_conflict';throw error;}
    const remaining=raw.slice(this.committed.length),logicalStarted=this.pendingStart;this.pendingStart=false;
    const base={text:remaining.trim(),rawSourceText:remaining,final:false,logicalStarted};
    if(!remaining){if(final)this.reset();return {...base,final,punctuationCode:this.punctuationCode,punctuationMs:this.punctuationMs};}
    this.observations.push({raw,audioMs});
    while(this.observations.length>1&&this.observations[1].audioMs<=audioMs-this.stableMs)this.observations.shift();
    if(this.observations.length>32)this.observations.shift();
    const stable=this.observations.length&&audioMs-this.observations[0].audioMs>=this.stableMs?commonPrefix(this.observations.map(x=>x.raw)):0;
    if(final||audioMs-this.lastPunctAt>=this.intervalMs&&stable>this.committed.length){
      this.lastPunctAt=audioMs;
      const context=Array.from(this.committed).slice(-this.contextChars).join('');
      const window=Array.from(remaining).slice(0,Math.max(1,this.maxInputChars-Array.from(context).length)).join('');
      const input=context+window,start=this.clock();
      let aligned;this.punctuationCode=null;
      try{aligned=alignPunctuation(input,this.punctuate(input));}catch{this.punctuationCode='punctuation_unavailable';}
      this.punctuationMs=this.clock()-start;
      if(this.punctuationMs>this.maxPunctuationMs)this.punctuationCode='punctuation_timeout';
      else if(!aligned)this.punctuationCode??='punctuation_changed_source';
      else{
        this.punctuationCode=null;
        const contextOffset=this.committed.length-context.length;
        // Model's trailing automatic period cannot establish an internal sentence.
        const eligible=aligned.marks.filter(mark=>{
          const end=contextOffset+mark.rawEnd,tail=raw.slice(end),clause=raw.slice(this.committed.length,end);
          if(/(?:百分|千分|万分)(?:之)?$/u.test(clause)||/^(?:之)[一二三四五六七八九十百千万零〇\d]/u.test(tail))return false;
          return end>this.committed.length&&end<=stable&&mark.rawEnd<input.length&&
            (han.test(raw)?Array.from(tail.trim()).length>=this.minTailChars:tail.trim().split(/\s+/u).length>=2)&&
            clauseSize(clause)>=(han.test(clause)?this.minClauseChars:this.minClauseWords)&&
            !(mark.char==='.'&&/\d/u.test(input[mark.rawEnd-1]??'')&&/\d/u.test(input[mark.rawEnd]??''));
        });
        if(!final&&this.allowCommit&&eligible.length){
          const mark=eligible[0],end=contextOffset+mark.rawEnd;
          const contextOutputEnd=context?Math.max(0,...aligned.positions.filter(point=>point.rawEnd<=context.length).map(point=>point.outputEnd)):0;
          const prefix=aligned.output.slice(contextOutputEnd,mark.outputEnd);
          const portion=raw.slice(this.committed.length,end),safe=alignPunctuation(portion,prefix);
          if(safe){this.committed=raw.slice(0,end);this.pendingStart=true;return {...base,text:safe.output.trim(),rawSourceText:portion,final:true,splitReason:'punctuation',punctuationMs:this.punctuationMs};}
          this.punctuationCode='punctuation_changed_source';
        }
        if(final&&window.length===remaining.length){
          // Natural final may include trailing punctuation; no unstable tail remains.
          const contextOutputEnd=context?Math.max(0,...aligned.positions.filter(point=>point.rawEnd<=context.length).map(point=>point.outputEnd)):0;
          const output=aligned.output.slice(contextOutputEnd);
          const safe=alignPunctuation(remaining,output);if(safe)base.text=safe.output.trim();
        }else if(final)this.punctuationCode='punctuation_backlog';
      }
    }
    const result={...base,final,splitReason:final?'silence':null,punctuationCode:this.punctuationCode,punctuationMs:this.punctuationMs};
    if(final)this.reset();return result;
  }
}
