'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
process.on('disconnect',()=>process.exit(0));
const kind=stat=>stat.isSymbolicLink()?'link':stat.isDirectory()?'directory':stat.isFile()?'file':'other';
process.on('message',async({id,action,target})=>{
 try{
  if(!path.isAbsolute(target)||!['realpath','lstat','stat','readdir'].includes(action))throw Error('无效元数据请求');
  let value;
  if(action==='realpath')value=await fs.realpath(target);
  else if(action==='readdir')value=(await fs.readdir(target,{withFileTypes:true})).map(entry=>({name:entry.name,kind:kind(entry)}));
  else{const stat=await fs[action](target);value={kind:kind(stat),size:stat.size,mtimeMs:stat.mtimeMs,birthtimeMs:stat.birthtimeMs,dev:stat.dev,ino:stat.ino};}
  if(process.connected)process.send({id,value});
 }catch(error){if(process.connected)process.send({id,error:error.message,code:error.code});}
});
