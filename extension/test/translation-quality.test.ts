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

test('keeps the negation when recognition repeats the last syllable of attendance',async()=>{
 const original='중앙정부를 무시한 주 대표들은 대부분 회의에 불 참석석했습니다.';
 const translate=vi.fn(async(input:string)=>input.includes('불참했습니다')?'大多数州代表缺席了会议。':'大多数州代表出席了会议。');
 await expect(translateChecked(original,'ko','zh',translate)).resolves.toBe('大多数州代表缺席了会议。');
 expect(translate).toHaveBeenCalledWith('중앙정부를 무시한 주 대표들은 대부분 회의에 불참했습니다.');
 await expect(translateChecked(original,'ko','zh',async()=> '大多数州代表出席了会议。')).rejects.toThrow('否定');
 await expect(translateChecked('그는 회의에 참석석했습니다.','ko','zh',async input=>input)).resolves.toBe('그는 회의에 참석석했습니다.');
});

test('a punctuation-only result never replaces readable source text',async()=>{
 await expect(translateChecked('有。','en','zh',async()=> '。。')).rejects.toThrow('仅包含标点');
});

test('canonicalizes mixed Korean counts before Chinese translation',async()=>{
 const raw='백16명의 선수 중 3십6명이 기록을 냈고, 이십4위를 차지했다.';
 const translate=vi.fn(async(input:string)=>input);
 await expect(translateChecked(raw,'ko','zh',translate)).resolves.toBe('116명의 선수 중 36명이 기록을 냈고, 24위를 차지했다.');
 await expect(translateChecked('시료는 5십육가지다. 12십명이 아니다. 이미 36명과 삼십육명이 있었다.','ko','zh',translate))
  .resolves.toBe('시료는 56가지다. 12십명이 아니다. 이미 36명과 삼십육명이 있었다.');
 await expect(translateChecked(raw,'ko','en',translate)).resolves.toBe(raw);
});

test('separates a glued English household count before Chinese translation',async()=>{
 const raw='She cares for a family of7. The account family of7_x remains valid.';
 const translate=vi.fn(async(input:string)=>input);
 await expect(translateChecked(raw,'en','zh',translate))
  .resolves.toBe('She cares for a family of 7. The account family of7_x remains valid.');
 await expect(translateChecked(raw,'en','ja',translate)).resolves.toBe(raw);
});
