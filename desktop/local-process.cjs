'use strict';
const {EventEmitter}=require('node:events');
function launchLocalProcess(entry,args=[],name='审核台文件服务'){
 if(process.versions.electron&&process.type==='browser'){
  const {utilityProcess}=require('electron');
  // Keep the application responsible for its own file services. Disclaiming
  // responsibility would give helpers separate macOS privacy prompts.
  const native=utilityProcess.fork(entry,args,{stdio:'ignore',serviceName:name,disclaim:false});
  const child=new EventEmitter();let exited=false,stop=false;
  const kill=()=>{if(native.pid&&!exited){try{process.kill(native.pid,'SIGKILL');}catch{native.kill();}}};
  native.on('spawn',()=>{if(stop)kill();child.emit('spawn');});
  native.on('message',value=>child.emit('message',value));
  native.on('error',(...args)=>child.emit('error',...args));
  native.on('exit',code=>{exited=true;child.emit('exit',code);});
  child.send=(message,callback)=>{try{native.postMessage(message);callback?.();}catch(error){callback?.(error);}};
  child.kill=()=>{stop=true;kill();};child.unref=()=>{};
  return child;
 }
 return require('node:child_process').fork(entry,args,{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','ignore','ipc']});
}
module.exports={launchLocalProcess};
