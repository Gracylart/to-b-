'use strict';
const path=require('node:path');
const {fork}=require('node:child_process');
const typed=value=>({...value,isFile:()=>value.kind==='file',isDirectory:()=>value.kind==='directory',isSymbolicLink:()=>value.kind==='link'});
// A timed-out promise does not cancel an underlying provider syscall. Recycle
// the process so blocked filesystem threads cannot starve future file events.
class FileMetadata{
 constructor({timeoutMs=2000,workerPath=path.join(__dirname,'file-metadata-worker.cjs')}={}){this.timeoutMs=timeoutMs;this.workerPath=workerPath;this.pending=new Map();this.next=0;this.closed=false;}
 start(){
  if(this.child)return this.child;
  const child=fork(this.workerPath,[],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','ignore','ipc']});this.child=child;child.unref();child.channel?.unref();
  child.on('message',message=>{
   const request=this.pending.get(message.id);if(!request||request.child!==child)return;
   this.pending.delete(message.id);clearTimeout(request.timer);
   if(message.error){const error=Error(message.error);error.code=message.code;request.reject(error);}else request.resolve(message.value);
  });
  child.on('error',error=>this.reset(child,error));
  child.on('exit',()=>this.reset(child,Error('文件元数据进程已结束')));
  return child;
 }
 reset(child,error){
  if(this.child===child)this.child=null;
  for(const [id,request]of this.pending)if(request.child===child){clearTimeout(request.timer);this.pending.delete(id);request.reject(error);}
  child.kill('SIGKILL');
 }
 request(action,target){
  if(this.closed)return Promise.reject(Error('文件索引已关闭'));
  return new Promise((resolve,reject)=>{
   const child=this.start(),id=++this.next;
   const timer=setTimeout(()=>this.reset(child,Error('目录或文件暂未响应，已重启元数据进程')),this.timeoutMs);
   this.pending.set(id,{resolve,reject,timer,child});
   child.send({id,action,target},error=>{if(error)this.reset(child,error);});
  });
 }
 realpath(target){return this.request('realpath',target);}
 async lstat(target){return typed(await this.request('lstat',target));}
 async stat(target){return typed(await this.request('stat',target));}
 async readdir(target){return (await this.request('readdir',target)).map(typed);}
 close(){this.closed=true;if(this.child)this.reset(this.child,Error('文件索引已关闭'));}
}
module.exports={FileMetadata};
