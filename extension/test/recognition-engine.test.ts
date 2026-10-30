import {expect,test} from 'vitest';
import {defaults,requiresCompanionToken} from '../src/shared';

test('browser recognition starts without a local companion token',()=>{
 expect(defaults.recognitionEngine).toBe('browser');
 expect(requiresCompanionToken(defaults)).toBe(false);
 expect(requiresCompanionToken({...defaults,recognitionEngine:'companion'})).toBe(true);
});
