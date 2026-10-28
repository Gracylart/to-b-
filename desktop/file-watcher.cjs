'use strict';
const {root,skip}=JSON.parse(process.argv[2]);
const watcher=require('@parcel/watcher');
const ipc=require('./process-ipc.cjs');
function send(value){ipc.send(value);}
ipc.onDisconnect(()=>process.exit(0));
// FSEvents watches a directory tree without synchronously opening every child
// directory. Keep the native backend in a disposable process as file providers
// may stall even an OS subscription during mounting or reconnecting.
watcher.subscribe(root,(error,events)=>error?send({error:error.message,code:error.code}):send({events}),{
 backend:process.platform==='darwin'?'fs-events':undefined,
 ignore:[...skip.map(name=>`**/${name}/**`),'**/.*','**/.*/*','**/*.app/**','**/*.bundle/**','**/*.photoslibrary/**']
}).then(()=>send({ready:true})).catch(error=>send({error:error.message,code:error.code}));
