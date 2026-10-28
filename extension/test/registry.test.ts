import{expect,test}from'vitest';
import{VideoRegistry}from'../src/registry';
const video=(id:string,paused=false,area=500)=>({id,paused,area,currentTime:1,url:'',title:'',live:false,playbackRate:1,observedAt:0});
test('expired iframe target loses manual selection and falls back to live root candidate',()=>{
 const r=new VideoRegistry();r.report(7,[video('iframe',false,10000)],0);r.report(0,[video('root')],2000);
 expect(r.choose('7:iframe',true,2000)?.id).toBe('iframe');
 r.report(0,[video('root')],4000);expect(r.choose('7:iframe',true,4000)?.id).toBe('root');
});
test('paused last video removal explicitly produces undefined viewport target',()=>{
 const r=new VideoRegistry();r.report(0,[video('last',true)],0);expect(r.choose('',false,0)?.paused).toBe(true);
 r.report(0,[],1000);expect(r.choose('0:last',true,1000)).toBeUndefined();
});
