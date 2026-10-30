import{expect,test}from'vitest';
import{typewriterStep,liveSubtitleText}from'../src/typewriter';

test('reveals a cumulative recognition update one Unicode character at a time',()=>{
 expect(typewriterStep('你好','你好世界')).toBe('你好世');
 expect(typewriterStep('你好世','你好世界')).toBe('你好世界');
 expect(typewriterStep('A','A😀B')).toBe('A😀');
});

test('keeps a rolling subtitle window moving without clearing it',()=>{
 expect(typewriterStep('一二三四','二三四五')).toBe('二三四五');
 expect(typewriterStep('他说明天','他说明天，继续')).toBe('他说明天，');
 expect(typewriterStep('旧话题','新话题')).toBe('新话题');
});

test('live text rolls one character at a time instead of jumping at fixed pages',()=>{
 const text='一二三四五六七八九十'.repeat(5);
 expect(liveSubtitleText(text)).toBe(Array.from(text).slice(-42).join(''));
 expect(liveSubtitleText(`${text}甲`)).toBe(Array.from(`${text}甲`).slice(-42).join(''));
 expect(liveSubtitleText(`${text}甲`)).not.toBe('甲');
});
