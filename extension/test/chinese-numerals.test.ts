import {describe,expect,test} from 'vitest';
import {normalizeChineseNumerals} from '../src/chinese-numerals';

describe('Chinese numeral formatting',()=>{
 test('formats counters, years and ordinals without changing surrounding words',()=>{
  expect(normalizeChineseNumerals('约有四十人，奥克兰跨越两座海港，最受欢迎的海滩位于三个区域。')).toBe('约有40人，奥克兰跨越2座海港，最受欢迎的海滩位于3个区域。');
  expect(normalizeChineseNumerals('一九七八年的协议，第十五位，第一千款，海拔四千八百九十二公尺。')).toBe('1978年的协议，第15位，第1000款，海拔4892公尺。');
 });
 test('leaves ordinary words and ambiguous standalone numerals alone',()=>{
  expect(normalizeChineseNumerals('一方面，这是十一。十三号')).toBe('一方面，这是十一。十三号');
 });
});
