import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,rename,unlink,symlink,readFile,rm,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const require=createRequire(import.meta.url);
const {ProjectFiles,named,excerpt,extractInProcess}=require('../desktop/project-files.cjs');
const catalog=[{code:'R501P',name:'便携风扇'},{code:'R521P',name:'桌面台灯'}];
async function fixture(t,extra={}){const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'review-files-')));const source=path.join(root,'source');await mkdir(source);const lib=await new ProjectFiles({directory:path.join(root,'cache'),defaultRoots:[{path:source,label:'测试目录'}],pollMs:0,debounceMs:30,...extra}).init();lib.setCatalog(catalog);t.after(async()=>{await lib.close();await rm(root,{recursive:true,force:true});});return {root,source,lib};}
const waitFor=async predicate=>{for(let n=0;n<80;n++){if(predicate())return;await new Promise(r=>setTimeout(r,40));}assert.fail('文件监听未在时限内更新');};

test('filename rules identify project/product/material/version and preserve borrowed ownership',()=>{
 const f=named('/data/R501P/R501P-便携风扇-彩盒-变更02.pdf','/data',catalog);
 assert.equal(f.projectCode,'R501P');assert.equal(f.product,'便携风扇');assert.equal(f.material,'彩盒');assert.equal(f.version,'变更02');assert.equal(f.state,'linked');
 for(const suffix of ['-变更-02','（变更02）','-Rev-A'])assert.equal(named('/data/R501P/R501P-便携风扇-彩盒'+suffix+'.pdf','/data',catalog).material,'彩盒');
 const borrowed=named('/data/R501P/借用/R521P-桌面台灯-警示贴.pdf','/data',catalog);
 assert.equal(borrowed.projectCode,'R521P');assert.equal(borrowed.borrowed,true);assert.deepEqual(borrowed.linkedCodes,['R501P']);assert.equal(borrowed.conflict,false);
 const conflict=named('/data/R501P/R521P-台灯-说明书.pdf','/data',catalog);assert.equal(conflict.state,'pending');assert.equal(conflict.conflict,true);
 const date=named('/data/2026-10-27-会议.pdf','/data',catalog);assert.equal(date.projectCode,'');
 for(const title of ['01-论文-说明.pdf','A4-版面-稿件.pdf','23451-1024x1024-图.png'])assert.equal(named('/data/'+title,'/data',catalog).projectCode,'');
 assert.equal(named('/data/R501P-便携风扇-物料确认-打样.xlsx','/data',catalog).stage,'打样');
 assert.equal(named('/data/R501P-便携风扇-物料确认.xlsx','/data',catalog).stage,'');
});
test('recursive indexing opens real files without moving them; rename retains manual assignment and deletion reconciles',async t=>{
 const {source,lib}=await fixture(t);const file=path.join(source,'彩盒终稿.pdf');await writeFile(file,'fixture');await lib.scan();let record=lib.snapshot().files[0];assert.equal(record.state,'pending');await lib.assign(record.id,'R501P');
 const moved=path.join(source,'彩盒改名.pdf');await rename(file,moved);await lib.scan();record=lib.snapshot().files[0];assert.equal(record.state,'linked');assert.equal(record.projectCode,'R501P');assert.equal(await lib.resolve(record.id),moved);assert.equal(await readFile(moved,'utf8'),'fixture');
 await unlink(moved);await lib.scan();assert.equal(lib.snapshot().files.length,0);await assert.rejects(lib.resolve(record.id),/移除/);
});
test('watcher discovers new files and ignores temporary Excel files and symlinks',async t=>{
 const {root,source,lib}=await fixture(t);const outside=path.join(root,'secret.pdf');await writeFile(outside,'outside');await symlink(outside,path.join(source,'R501P-风扇-链接.pdf'));await writeFile(path.join(source,'~$BOM.xlsx'),'temp');
 const file=path.join(source,'R501P-便携风扇-说明书.pdf');await writeFile(file,'document');await waitFor(()=>lib.snapshot().files.some(f=>f.path===file));assert.equal(lib.snapshot().files.length,1);
 const record=lib.snapshot().files[0];await unlink(file);await symlink(outside,file);await assert.rejects(lib.resolve(record.id),/类型|目录/);
});
test('model associations require a real known-project match in the original document',async t=>{
 const model={state:'ready',classify:async()=>({projectCode:'R521P',product:'台灯',material:'彩盒',stage:'DVT',kind:'material',evidence:'模型猜测'})};
 const {source,lib}=await fixture(t,{model,extract:async()=>({text:'无项目号的未知文件',note:''})});await writeFile(path.join(source,'终稿.pdf'),'data');await lib.scan();await waitFor(()=>!lib.modelBusy);assert.equal(lib.snapshot().files[0].state,'pending');
 lib.extract=async()=>({text:'项目 R501PX SAMPLE',note:''});model.classify=async()=>({projectCode:'R501P',product:'便携风扇',material:'彩盒',stage:'MP',kind:'material',evidence:'R501P'});lib.retryPending(true);await waitFor(()=>!lib.modelBusy);assert.equal(lib.snapshot().files[0].state,'pending');
 lib.extract=async()=>({text:'项目 R501P 便携风扇 DVT SAMPLE',note:''});lib.retryPending(true);await waitFor(()=>!lib.modelBusy);assert.equal(lib.snapshot().files[0].state,'linked');assert.equal(lib.snapshot().files[0].method,'model');assert.notEqual(lib.snapshot().files[0].stage,'MP');assert.notEqual(lib.snapshot().files[0].material,'彩盒');
});
test('a late model response cannot override a manual confirmation',async t=>{
 let complete;const model={state:'ready',classify:()=>new Promise(r=>{complete=r;})};const {source,lib}=await fixture(t,{model,extract:async()=>({text:'R501P R521P',note:''})});await writeFile(path.join(source,'未知.pdf'),'fixture');await lib.scan();await waitFor(()=>Boolean(complete));const f=lib.snapshot().files[0];await lib.assign(f.id,'R501P');complete({projectCode:'R521P',product:'台灯',material:'彩盒',stage:'',kind:'material',evidence:'R521P'});await waitFor(()=>!lib.modelBusy);assert.equal(lib.snapshot().files[0].projectCode,'R501P');
});
test('unchanged unresolved model results are cached instead of re-running on every launch',async t=>{
 let calls=0;const model={state:'ready',classify:async()=>{calls++;return {projectCode:'',product:'',material:'',stage:'',kind:'unknown',evidence:''};}};
 const {source,lib}=await fixture(t,{model,extract:async()=>({text:'无法确定的文件',note:''})});await writeFile(path.join(source,'未命名.pdf'),'fixture');await lib.scan();await waitFor(()=>!lib.modelBusy);assert.equal(calls,1);lib.retryPending();await waitFor(()=>!lib.modelBusy);assert.equal(calls,1);lib.retryPending(true);await waitFor(()=>!lib.modelBusy);assert.equal(calls,2);
});
test('sample review projects alone do not cause unrelated desktop files to run through the model',async t=>{
 let calls=0;const model={state:'ready',classify:async()=>{calls++;return {projectCode:'',product:'',material:'',stage:'',kind:'unknown',evidence:''};}};
 const {source,lib}=await fixture(t,{model,extract:async()=>({text:'unknown',note:''})});lib.setCatalog(catalog.map(p=>({...p,example:true})));
 await writeFile(path.join(source,'未命名.pdf'),'fixture');await lib.scan();await waitFor(()=>!lib.modelBusy);assert.equal(calls,0);
 await writeFile(path.join(source,'R501P-便携风扇-彩盒.pdf'),'fixture');await lib.scan();await waitFor(()=>!lib.modelBusy);assert.equal(calls,1);
});
test('Excel stage/content extraction reads real cells and does not evaluate formulas',async t=>{
 const {source}=await fixture(t);const XLSX=require('xlsx');const sheet=XLSX.utils.aoa_to_sheet([['项目号','阶段','物料'],['R501P','DVT','彩盒']]);sheet.D1={f:'HYPERLINK("https://invalid.invalid","ignored")',v:'cached',t:'s'};const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'打样记录');const file=path.join(source,'物料表.xlsx');XLSX.writeFile(book,file);const result=await excerpt({path:file,ext:'.xlsx'});assert.match(result.text,/R501P/);assert.match(result.text,/DVT/);assert.match(result.text,/打样记录/);assert.doesNotMatch(result.text,/HYPERLINK/);
});
test('PDF text extraction reads an actual PDF',async t=>{
 const {source}=await fixture(t);const {PDFDocument}=require('pdf-lib');const doc=await PDFDocument.create();doc.addPage().drawText('Project R501P - packaging');const file=path.join(source,'document.pdf');await writeFile(file,await doc.save());const result=await extractInProcess({path:file,ext:'.pdf'});assert.match(result.text,/R501P/);const controller=new AbortController();controller.abort();await assert.rejects(extractInProcess({path:file,ext:'.pdf'},{signal:controller.signal}),/停止文件提取/);
});

test('native event ingestion updates a file while a background scan is still pending',async t=>{
 const {source,lib}=await fixture(t);clearTimeout(lib.timer);
 let finish;lib.currentScan=new Promise(resolve=>{finish=resolve;});lib.scanning=true;
 const file=path.join(source,'R501P-便携风扇-事件验收.pdf');await writeFile(file,'data');
 await lib.applyEvents(lib.roots[0],[{type:'create',path:file}]);
 assert.equal(lib.snapshot().files.find(f=>f.path===file)?.projectCode,'R501P');
 await lib.applyEvents(lib.roots[0],[{type:'delete',path:file}]);
 assert.equal(lib.snapshot().files.find(f=>f.path===file),undefined);
 lib.scanning=false;finish();
});
test('overlapping root events retain the more specific project source',async t=>{
 const {source,lib}=await fixture(t);const sub=path.join(source,'project');await mkdir(sub);
 const file=path.join(sub,'R501P-便携风扇-来源.pdf');await writeFile(file,'data');await lib.addRoot(sub,'项目总目录');
 const record=lib.snapshot().files.find(f=>f.path===file);const projectRoot=lib.roots.find(r=>r.path===sub);
 assert.equal(record.sourceId,projectRoot.id);await lib.applyEvents(lib.roots[0],[{type:'update',path:file}]);
 assert.equal(lib.snapshot().files.find(f=>f.path===file).sourceId,projectRoot.id);
});

test('denied root permissions pause recurring scans and explicit re-selection re-enables the existing root',async t=>{
 const {source,lib}=await fixture(t);const root=lib.roots[0];
 assert.equal(lib.permissionDenied(root,{code:'EPERM',message:'Operation not permitted'}),true);
 assert.equal(root.enabled,false);assert.equal(root.permissionRequired,true);
 await lib.addRoot(source);assert.equal(lib.roots.length,1);assert.equal(root.enabled,true);assert.equal(root.permissionRequired,false);
});

test('newly discovered file events are classified before an older desktop backlog',async t=>{
 const {source,lib}=await fixture(t,{model:{state:'stopped'}});const old=path.join(source,'历史文档.pdf');await writeFile(old,'old');await lib.scan();
 const newest=path.join(source,'最新文档.pdf');await writeFile(newest,'new');await lib.applyEvents(lib.roots[0],[{type:'create',path:newest}]);
 const record=lib.snapshot().files.find(file=>file.path===newest);assert.equal(lib.modelQueue[0].id,record.id);
});

test('a scan during model inference cannot discard a valid association on the refreshed file record',async t=>{
 let complete;const model={state:'ready',classify:()=>new Promise(resolve=>{complete=resolve;})};
 const {source,lib}=await fixture(t,{model,extract:async()=>({text:'Project R501P packaging',note:''})});
 const file=path.join(source,'无编号文件.pdf');await writeFile(file,'fixture');await lib.scan();await waitFor(()=>Boolean(complete));
 await lib.scan();complete({projectCode:'R501P',product:'便携风扇',material:'packaging',stage:'',kind:'material',evidence:'Project R501P'});
 await waitFor(()=>!lib.modelBusy);assert.equal(lib.snapshot().files.find(record=>record.path===file).state,'linked');assert.equal(lib.snapshot().files.find(record=>record.path===file).projectCode,'R501P');
});
