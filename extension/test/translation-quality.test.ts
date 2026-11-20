import {expect,test,vi} from 'vitest';
import {translateChecked} from '../src/translation-quality';

test('prepares a split Korean absence phrase without changing the saved source',async()=>{
 const original='중앙 정부를 무시한 주 대표들은 대부분 회의에 불 참석했습니다.';
 const translate=vi.fn(async(input:string)=>input.includes('불참했습니다')?'多数州代表没有出席会议。':'多数州代表出席了会议。');
 await expect(translateChecked(original,'ko','zh',translate)).resolves.toBe('多数州代表没有出席会议。');
 expect(translate).toHaveBeenCalledWith('중앙 정부를 무시한 주 대표들은 대부분 회의에 불참했습니다.');
 expect(original).toContain('불 참석했습니다');
});

test('does not return a confirmed Korean absence as positive attendance',async()=>{
 await expect(translateChecked('대표는 회의에 불참석했습니다.','ko','zh',async()=> '代表出席了会议。')).rejects.toThrow('否定');
 await expect(translateChecked('그는 회의에 불참했습니다.','ko','zh',async()=> '他未能出席会议。')).resolves.toBe('他未能出席会议。');
 await expect(translateChecked('그는 회의에 불참했습니다.','ko','zh',async()=> '他在会议上缺席。')).resolves.toBe('他在会议上缺席。');
 await expect(translateChecked('그는 회의에 참석했습니다.','ko','zh',async()=> '他出席了会议。')).resolves.toBe('他出席了会议。');
});

test('a punctuation-only result never replaces readable source text',async()=>{
 await expect(translateChecked('有。','en','zh',async()=> '。。')).rejects.toThrow('仅包含标点');
});
