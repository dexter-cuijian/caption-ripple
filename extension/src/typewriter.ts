/** Reveal only text already supplied by recognition; recover cleanly from revised hypotheses. */
export function typewriterStep(current:string,target:string):string{
 if(current===target)return target;
 const old=Array.from(current),next=Array.from(target);
 const reveal=(prefix:string[])=>prefix.concat(next[prefix.length]).join('');
 if(next.slice(0,old.length).join('')===current)return reveal(old);
 if(old.slice(0,next.length).join('')===target)return target;
 for(let removed=1;removed<old.length;removed++){
  const overlap=old.slice(removed);
  if(overlap.length<Math.ceil(old.length/2))break;
  if(next.slice(0,overlap.length).join('')===overlap.join(''))return reveal(overlap);
 }
 let common=0;while(common<old.length&&common<next.length&&old[common]===next[common])common++;
 if(common>=Math.ceil(old.length/2))return reveal(next.slice(0,common));
 return target;
}

/** A rolling viewport avoids clearing the whole line at fixed 28-character page boundaries. */
export function liveSubtitleText(raw:string):string{
 const text=raw.trim();
 if(/[\u3400-\u9fff]/u.test(text))return Array.from(text).slice(-42).join('');
 return text.split(/\s+/).slice(-18).join(' ');
}
