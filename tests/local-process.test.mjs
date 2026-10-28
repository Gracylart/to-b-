import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
test('packaged file services retain parent TCC responsibility and terminate only their owned process',async()=>{
 const native=new EventEmitter(),options=[],messages=[],killed=[];native.postMessage=value=>messages.push(value);native.kill=()=>{};
 const source=await readFile(new URL('../desktop/local-process.cjs',import.meta.url),'utf8'),module={exports:{}};
 vm.runInNewContext(source,{module,process:{versions:{electron:'44'},type:'browser',kill:pid=>killed.push(pid)},require:name=>{
  if(name==='node:events')return {EventEmitter};if(name==='electron')return {utilityProcess:{fork:(entry,args,config)=>{options.push(config);return native;}}};throw Error(name);
 }});
 const child=module.exports.launchLocalProcess('/app/service.cjs');assert.equal(options[0].disclaim,false);assert.equal(options[0].stdio,'ignore');
 child.send({id:1});assert.equal(messages[0].id,1);child.kill();assert.deepEqual(killed,[]);
 native.pid=321;native.emit('spawn');assert.deepEqual(killed,[321]);native.emit('exit',0);child.kill();assert.deepEqual(killed,[321]);
});
