process.send({type:'ready'});
process.on('message',message=>{
 if(message.type==='audio')process.kill(process.pid,'SIGKILL');
 else if(message.type==='echo')process.send({type:'echo',samples:message.samples});
 else if(message.type==='shutdown')process.exit(0);
});
