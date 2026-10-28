'use strict';
const port=process.parentPort;
module.exports={
 connected:()=>!!port||!!process.connected,
 send:value=>{if(port)port.postMessage(value);else if(process.connected)process.send(value);},
 onMessage:callback=>port?port.on('message',event=>callback(event.data)):process.on('message',callback),
 onDisconnect:callback=>port?port.on('close',callback):process.on('disconnect',callback)
};
