'use strict';
// Runs real Electron utility processes without creating windows or touching user
// documents. Node-only tests cannot catch PDF.js runtime detection differences.
const {app}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {PDFDocument}=require('pdf-lib');
const XLSX=require('xlsx');
const {extractInProcess,ProjectFiles}=require('../desktop/project-files.cjs');
app.whenReady().then(async()=>{
 app.dock?.hide();let directory,library;
 try{
  directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'studio-file-services-')));const source=path.join(directory,'source');await fs.mkdir(source);
  const doc=await PDFDocument.create();doc.addPage().drawText('Project QA2710 DVT packaging acceptance only');
  const pdf=path.join(source,'document.pdf');await fs.writeFile(pdf,await doc.save());
  const text=await extractInProcess({path:pdf,ext:'.pdf'});assert.match(text.text,/QA2710/);
  const sheet=path.join(source,'stage.xlsx'),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Project','Stage'],['QA2710','DVT']]),'Stage');XLSX.writeFile(book,sheet);
  assert.match((await extractInProcess({path:sheet,ext:'.xlsx'})).text,/DVT/);
  library=await new ProjectFiles({directory:path.join(directory,'cache'),defaultRoots:[{path:source,label:'服务验收'}],pollMs:0,debounceMs:50}).init();
  library.setCatalog([{code:'QA2710',name:'归集验收'}]);await library.scan();
  const newFile=path.join(source,'QA2710-Package-Label.txt');await fs.writeFile(newFile,'acceptance only');
  for(let attempt=0;attempt<40&&!library.snapshot().files.some(file=>file.path===newFile);attempt++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(library.snapshot().files.find(file=>file.path===newFile)?.projectCode,'QA2710');
  if(process.argv.includes('--with-model')){
   const {LocalFileModel}=require('../desktop/local-file-model.cjs');const model=new LocalFileModel(path.join(app.getPath('appData'),'文案审核台 · Studio'));
   assert.equal((await model.status()).state,'ready');const result=await model.classify({name:'document.pdf',relativePath:'document.pdf'},[{code:'QA2710',name:'归集验收'}],text.text);assert.equal(result.projectCode,'QA2710');
   library.model=model;library.retryPending(true);await library.scan();
   for(let attempt=0;attempt<200&&library.snapshot().files.find(file=>file.path===pdf)?.state!=='linked';attempt++)await new Promise(resolve=>setTimeout(resolve,100));
   assert.equal(library.snapshot().files.find(file=>file.path===pdf)?.projectCode,'QA2710');
   console.log('Electron utility PDF, Excel, filesystem events and local model association passed.');
  }else console.log('Electron utility PDF, Excel and filesystem events passed.');
 }finally{await library?.close();if(directory)await fs.rm(directory,{recursive:true,force:true});}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
