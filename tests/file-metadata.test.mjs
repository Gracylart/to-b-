import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {FileMetadata}=require('../desktop/file-metadata.cjs');
test('a stalled metadata process is killed and a later query starts a healthy process',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'review-metadata-'));const worker=path.join(dir,'worker.cjs'),flag=path.join(dir,'started');
 const realWorker=require.resolve('../desktop/file-metadata-worker.cjs');
 await writeFile(worker,`const fs=require('node:fs');if(!fs.existsSync(${JSON.stringify(flag)})){fs.writeFileSync(${JSON.stringify(flag)},'');setInterval(()=>{},1000);}else require(${JSON.stringify(realWorker)});`);
 const metadata=new FileMetadata({timeoutMs:500,workerPath:worker});t.after(async()=>{metadata.close();await rm(dir,{recursive:true,force:true});});
 await assert.rejects(metadata.lstat(worker),/暂未响应/);
 assert.equal((await metadata.lstat(worker)).isFile(),true);
 assert.equal((await metadata.readdir(dir)).find(entry=>entry.name==='worker.cjs').isFile(),true);
 const pending=metadata.lstat(worker);metadata.close();await assert.rejects(pending,/已关闭/);
});
