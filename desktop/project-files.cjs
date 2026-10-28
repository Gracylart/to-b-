'use strict';
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const {Worker}=require('node:worker_threads');
const SUPPORTED=new Set(['.pdf','.xlsx','.xls','.xlsm','.csv','.tsv','.txt','.md','.ai','.svg','.png','.jpg','.jpeg','.webp']);
const SHEETS=new Set(['.xlsx','.xls','.xlsm','.csv','.tsv']);
const SKIP=new Set(['node_modules','.git','Library','release','dist','.Trash','.cache']);
const codeKey=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').toUpperCase();
const isCode=s=>/^(?:[A-Za-z]{1,8}\d{2,12}[A-Za-z0-9]{0,5}|\d{6,12})$/.test(s||'')&&!/^(?:IMG|DSC|SCREENSHOT)\d+/i.test(s);
const inside=(root,target)=>{const rel=path.relative(root,target);return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep));};
const uid=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,24);
function named(file,root,catalog=[]) {
  const relativePath=path.relative(root,file),name=path.basename(file),ext=path.extname(name).toLowerCase();
  const stem=name.slice(0,-ext.length),parts=stem.replace(/[–—－]/g,'-').split(/[-_]+/).map(s=>s.trim()).filter(Boolean);
  const lookup=new Map(catalog.filter(p=>p.source!=='discovered'||isCode(p.code)).map(p=>[codeKey(p.code),p]));
  const folders=path.dirname(file).split(path.sep).filter(Boolean),borrowed=folders.some(s=>/^(借用|借用料|borrowed?)$/i.test(s));
  const folderCodes=folders.filter(s=>lookup.has(codeKey(s))||isCode(s));
  const folderCode=folderCodes.at(-1)||'';
  const dated=/^(?:19|20)\d{2}[-_]\d{1,2}[-_]\d{1,2}/.test(stem);
  const fileCode=!dated&&(lookup.has(codeKey(parts[0]))||(parts.length>=3&&isCode(parts[0])))?parts[0]:'';
  const conflict=Boolean(fileCode&&folderCode&&codeKey(fileCode)!==codeKey(folderCode)&&!borrowed);
  const owner=codeKey(fileCode||folderCode),known=lookup.get(owner);
  const versionMatch=stem.match(/(?:[-_\s(（]|^)((?:变更|修改|修订|更改|REV|VER|V)[-_\s]*[A-Za-z0-9.]+|初稿|终稿|定稿|打样稿)[)）]?\s*$/i);
  const version=versionMatch?.[1]||'';
  const unversioned=versionMatch?stem.slice(0,versionMatch.index):stem;
  const baseParts=unversioned.replace(/[–—－]/g,'-').split(/[-_]+/).map(s=>s.trim()).filter(Boolean);
  const cleanParts=fileCode?baseParts.slice(1):baseParts;
  const product=fileCode&&cleanParts.length>1?cleanParts[0]:(known?.name||'');
  const material=(fileCode&&cleanParts.length>1?cleanParts.slice(1):cleanParts).join('-')||stem;
  const stageToken=[...parts].reverse().find(s=>/^(立项|打样|量产|试产|设计|送审|确认|EVT|DVT|PVT|MP|T0)(?:阶段|稿|版)?$/i.test(s));
  const stage=stageToken?.replace(/阶段$|稿$|版$/,'').toUpperCase()||'';
  return {name,ext,relativePath,projectCode:owner,product,material,version,stage,kind:SHEETS.has(ext)?'sheet':'material',borrowed,linkedCodes:borrowed&&folderCode&&codeKey(folderCode)!==owner?[codeKey(folderCode)]:[],state:conflict?'pending':owner?'linked':'pending',method:owner?'filename':'unresolved',reason:conflict?'文件名项目号与所在文件夹冲突':owner?'项目号与目录规则匹配':'缺少可确认的项目号',conflict};
}
async function excerpt(file) {
  const stat=await fsp.stat(file.path);if(stat.size>25*1024*1024)return {text:'',note:'超过内容提取上限，保留文件名归集'};
  if(file.ext==='.pdf'){
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task=pdfjs.getDocument({data:new Uint8Array(await fsp.readFile(file.path)),useSystemFonts:true,isEvalSupported:false,disableFontFace:true});
    try{const doc=await task.promise;let text='';for(let n=1;n<=Math.min(3,doc.numPages)&&text.length<6000;n++){const page=await doc.getPage(n);const content=await page.getTextContent();text+=content.items.map(x=>x.str||'').join(' ')+'\n';}return {text:text.slice(0,6000),note:text.trim()?'':'扫描稿或无可提取文字，需 OCR'};}finally{await task.destroy();}
  }
  if(SHEETS.has(file.ext)){
    const XLSX=require('xlsx');const workbook=XLSX.read(await fsp.readFile(file.path),{type:'buffer',sheetRows:30,cellFormula:false,cellHTML:false,bookVBA:false});
    return {text:workbook.SheetNames.slice(0,3).map(n=>n+'\n'+XLSX.utils.sheet_to_csv(workbook.Sheets[n])).join('\n').slice(0,6000),note:''};
  }
  if(['.txt','.md'].includes(file.ext))return {text:(await fsp.readFile(file.path,'utf8')).slice(0,6000),note:''};
  return {text:'',note:'仅按文件名识别'};
}
function extractInWorker(file){return new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(__dirname,'file-extractor.cjs'),{workerData:{path:file.path,ext:file.ext}});let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(Error('文件内容提取超时')),25000);
  worker.once('message',data=>data.error?finish(Error(data.error)):finish(null,data));worker.once('error',error=>finish(error));worker.once('exit',code=>{if(!settled)finish(Error('文件提取进程提前结束：'+code));});
});}
class ProjectFiles extends EventEmitter {
  constructor({directory,defaultRoots=[],model=null,pollMs=45000,debounceMs=800,maxFiles=15000,extract=extractInWorker}){
    super();this.directory=directory;this.cache=path.join(directory,'project-files.json');this.defaultRoots=defaultRoots;this.model=model;this.pollMs=pollMs;this.debounceMs=debounceMs;this.maxFiles=maxFiles;this.extract=extract;
    this.roots=[];this.files=new Map();this.catalog=[];this.manual={};this.watchers=[];this.errors=[];this.scanning=false;this.again=false;this.closed=false;this.revision=0;this.modelBusy=false;this.modelQueue=[];this.timer=null;this.saveTimer=null;this.lastScan=null;
  }
  async init(){
    await fsp.mkdir(this.directory,{recursive:true});let data={};try{data=JSON.parse(await fsp.readFile(this.cache,'utf8'));}catch{}
    this.catalog=data.version===2&&Array.isArray(data.catalog)?data.catalog:[];this.manual=data.manual&&typeof data.manual==='object'?data.manual:{};
    const saved=Array.isArray(data.roots)?data.roots:this.defaultRoots;
    for(const r of saved){try{const real=await fsp.realpath(r.path);if((await fsp.stat(real)).isDirectory()&&!this.roots.some(x=>x.path===real))this.roots.push({id:uid(real),path:real,label:String(r.label||path.basename(real)).slice(0,100),enabled:r.enabled!==false});}catch(e){if(typeof r.path==='string'&&path.isAbsolute(r.path)&&!this.roots.some(x=>x.path===r.path))this.roots.push({id:uid(r.path),path:r.path,label:String(r.label||path.basename(r.path)).slice(0,100),enabled:r.enabled!==false});this.errors.push({source:r.label,error:'目录暂不可访问'});}}
    if(data.version===2&&Array.isArray(data.files))for(const f of data.files)if(f&&typeof f.path==='string'&&this.roots.some(r=>inside(r.path,f.path))){if(!['立项','设计','打样','送审','确认','试产','量产','EVT','DVT','PVT','MP','T0'].includes(f.stage))f.stage='';this.files.set(f.id,f);}
    this.watch();return this;
  }
  setCatalog(projects){
    if(!Array.isArray(projects)||projects.length>1000)throw Error('项目列表无效');
    const next=projects.filter(p=>p&&typeof p.code==='string'&&typeof p.name==='string').map(p=>({code:codeKey(p.code).slice(0,40),name:p.name.slice(0,120),source:'workspace'}));
    const merged=new Map(this.catalog.map(p=>[p.code,p]));for(const p of next)merged.set(p.code,p);
    if(JSON.stringify([...merged.values()])===JSON.stringify(this.catalog))return;
    this.catalog=[...merged.values()];this.retryPending(true);this.schedule();this.changed();
  }
  async addRoot(directory,label){const real=await fsp.realpath(directory);if(!(await fsp.stat(real)).isDirectory())throw Error('请选择文件夹');if(!this.roots.some(r=>r.path===real))this.roots.push({id:uid(real),path:real,label:label||path.basename(real),enabled:true});this.watch();this.changed();await this.scan();return this.snapshot();}
  async toggleRoot(id,enabled){const r=this.roots.find(r=>r.id===id);if(!r||typeof enabled!=='boolean')throw Error('来源设置无效');r.enabled=enabled;this.watch();await this.scan();this.changed();return this.snapshot();}
  watch(){
    this.watchers.forEach(w=>w.close());this.watchers=[];
    for(const r of this.roots.filter(r=>r.enabled)){try{const watcher=fs.watch(r.path,{recursive:true},(_type,name)=>{if(!name||!String(name).split(path.sep).some(p=>p.startsWith('.')||SKIP.has(p)))this.schedule();});watcher.on('error',e=>{this.errors.push({source:r.label,error:e.message});this.changed();});this.watchers.push(watcher);}catch(e){this.errors.push({source:r.label,error:e.message});}}
    clearInterval(this.interval);if(this.pollMs)this.interval=setInterval(()=>this.schedule(),this.pollMs);this.interval?.unref();
  }
  schedule(){if(this.closed)return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.scan().catch(e=>{this.errors.push({error:e.message});this.changed();}),this.debounceMs);this.timer.unref?.();}
  changed(){if(this.closed)return;this.revision++;this.emit('change',{revision:this.revision,scanning:this.scanning});clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.save().catch(e=>this.emit('storage-error',e.message)),300);this.saveTimer.unref?.();}
  save(){const data=JSON.stringify({version:2,roots:this.roots,catalog:this.catalog,manual:this.manual,files:[...this.files.values()]});this.saving=(this.saving||Promise.resolve()).catch(()=>{}).then(async()=>{const temp=this.cache+'.tmp';await fsp.writeFile(temp,data,{mode:0o600});await fsp.rename(temp,this.cache);});return this.saving;}
  async scan(){
    if(this.closed)return;if(this.scanning){this.again=true;return this.currentScan;}
    this.scanning=true;this.errors=[];this.changed();
    this.currentScan=this._scan().finally(()=>{this.scanning=false;this.lastScan=new Date().toISOString();this.changed();if(this.again){this.again=false;this.schedule();}this.processModel();});return this.currentScan;
  }
  async _scan(){
    const seen=new Set(),failedRoots=new Set();let visited=0,limited=false;
    for(const root of this.roots.filter(r=>r.enabled).sort((a,b)=>b.path.length-a.path.length)){
      try{if(await fsp.realpath(root.path)!==root.path)throw Error('目录指向已改变，请重新选择');}catch(e){failedRoots.add(root.id);this.errors.push({source:root.label,error:e.code||e.message});continue;}
      const stack=[{path:root.path,depth:0}];
      while(stack.length&&!this.closed){const current=stack.pop();let entries;try{entries=await fsp.readdir(current.path,{withFileTypes:true});}catch(e){failedRoots.add(root.id);this.errors.push({source:root.label,path:current.path,error:e.code||e.message});continue;}
        for(const entry of entries){if(entry.name.startsWith('.')||entry.name.startsWith('~$')||SKIP.has(entry.name)||entry.isSymbolicLink())continue;
          const target=path.join(current.path,entry.name);
          if(entry.isDirectory()){if(current.depth<14&&!/\.(app|bundle|photoslibrary)$/i.test(entry.name))stack.push({path:target,depth:current.depth+1});continue;}
          if(!entry.isFile()||!SUPPORTED.has(path.extname(entry.name).toLowerCase()))continue;
          if(++visited>this.maxFiles){limited=true;break;}
          try{const stat=await fsp.stat(target);const id=uid(`${stat.dev}:${stat.ino}:${stat.birthtimeMs}`);if(seen.has(id))continue;seen.add(id);
            const signature=`${stat.size}:${stat.mtimeMs}`,previous=this.files.get(id),parsed=named(target,root.path,this.catalog);
            const same=previous&&previous.signature===signature&&previous.path===target;
            let file={...parsed,id,path:target,sourceId:root.id,source:root.label,size:stat.size,mtime:stat.mtimeMs,signature,indexedAt:new Date().toISOString()};
            if(same&&(previous.method==='model'||previous.stageMethod==='model')&&!parsed.conflict&&(previous.state==='linked'||parsed.state!=='linked'))file={...previous,path:target,sourceId:root.id,source:root.label};
            if(parsed.projectCode&&!this.catalog.some(p=>p.code===parsed.projectCode))this.catalog.push({code:parsed.projectCode,name:parsed.product||parsed.projectCode,source:'discovered'});
            if(this.manual[id])file={...file,...this.manual[id],method:'manual',reason:'手动确认的归属'};
            this.files.set(id,file);
            if(!same&&!file.conflict&&(file.state==='pending'||(file.kind==='sheet'&&!file.stage)))this.modelQueue.push({id,signature});
          }catch(e){this.errors.push({source:root.label,path:target,error:e.code||e.message});}
          if(visited%100===0)await new Promise(r=>setImmediate(r));
        }
        if(limited)break;
      }
      if(limited)break;
    }
    if(!limited)for(const[id,file]of this.files)if(!seen.has(id)&&!failedRoots.has(file.sourceId))this.files.delete(id);
    if(limited)this.errors.push({error:`本轮扫描达到 ${this.maxFiles} 份文件上限，请缩小监听目录`});
    this.modelQueue=this.modelQueue.filter((item,i,a)=>a.findIndex(x=>x.id===item.id&&x.signature===item.signature)===i).sort((a,b)=>(this.files.get(b.id)?.mtime||0)-(this.files.get(a.id)?.mtime||0));
  }
  async processModel(){
    if(this.closed||this.modelBusy||!this.model||this.model.state!=='ready')return;
    this.modelBusy=true;this.changed();
    try{while(this.modelQueue.length&&!this.closed){const item=this.modelQueue.shift(),file=this.files.get(item.id);if(!file||file.signature!==item.signature||(file.state!=='pending'&&!(file.kind==='sheet'&&!file.stage))||file.conflict||this.manual[file.id])continue;
      // The extractor never executes document scripts, formulas, or macros.
      try{await this.resolve(file.id);const extracted=await this.extract(file);if(this.closed)break;file.contentNote=extracted.note;
        const result=await this.model.classify(file,this.catalog,extracted.text);
        if(this.closed||this.files.get(file.id)?.signature!==item.signature||this.manual[file.id])continue;
        const code=codeKey(result.projectCode),candidate=this.catalog.find(p=>p.code===code);
        const evidence=(file.name+' '+file.relativePath+' '+extracted.text).toUpperCase();
        const verified=candidate&&(evidence.includes(code)||(candidate.name.length>=3&&evidence.includes(candidate.name.toUpperCase())));
        const stage=result.stage&&evidence.includes(result.stage.toUpperCase())?result.stage:'';
        const material=result.material&&evidence.includes(result.material.toUpperCase())?result.material:file.material;
        if(file.state==='linked'){if(!file.stage){file.stage=stage;file.stageMethod='model';}file.contentNote=extracted.note;}
        else if(verified){Object.assign(file,{projectCode:code,product:candidate.name,material,stage:stage||file.stage,state:'linked',method:'model',reason:'文件名或文字与项目 '+code+' 的编号或名称匹配'});}
        else if(result.kind==='unrelated'&&!file.projectCode){Object.assign(file,{state:'ignored',method:'model',reason:result.evidence.slice(0,300)||'未发现项目关联'});}
        else {file.suggestedCode=candidate?.code||'';file.reason=candidate?'模型建议 '+candidate.code+'，但文件中缺少可核对的项目号或产品名':'模型未找到可验证的项目归属';file.method='model';}
      }catch(e){file.reason='内容识别未完成：'+e.message;}
      this.changed();
    }}finally{this.modelBusy=false;this.changed();}
  }
  retryPending(force=false){for(const file of this.files.values())if(file.state==='pending'&&!file.conflict&&(force||file.method!=='model'))this.modelQueue.push({id:file.id,signature:file.signature});this.processModel();}
  snapshot(){return {revision:this.revision,scanning:this.scanning,modelBusy:this.modelBusy,queued:this.modelQueue.length,lastScan:this.lastScan,roots:this.roots,errors:this.errors.slice(-12),projects:this.catalog,files:[...this.files.values()].filter(f=>this.roots.some(r=>r.enabled&&r.id===f.sourceId)),model:{state:this.model?.state||'stopped',model:this.model?.constructor?.name==='LocalFileModel'?'qwen3:0.6b':''}};}
  async resolve(id){
    const file=this.files.get(id);if(!file)throw Error('文件已移除，请重新扫描');
    const stat=await fsp.lstat(file.path);if(!stat.isFile()||stat.isSymbolicLink()||!SUPPORTED.has(path.extname(file.path).toLowerCase()))throw Error('不能打开此文件类型');
    const real=await fsp.realpath(file.path);if(!this.roots.some(r=>r.enabled&&inside(r.path,real)))throw Error('文件已不在监听目录内');return real;
  }
  async assign(id,code){await this.resolve(id);const file=this.files.get(id),project=this.catalog.find(p=>p.code===codeKey(code));if(!project)throw Error('请选择已有项目');
    const value={state:'linked',projectCode:project.code,product:project.name};this.manual[id]={...this.manual[id],...value};Object.assign(file,value,{method:'manual',reason:'手动确认的归属'});this.changed();await this.save();return this.snapshot();}
  async linkBorrowed(id,code){await this.resolve(id);const file=this.files.get(id);if(!file.borrowed||!this.catalog.some(p=>p.code===codeKey(code)))throw Error('借用关系无效');const value={linkedCodes:[...new Set([...file.linkedCodes,codeKey(code)])]};this.manual[id]={...this.manual[id],...value};Object.assign(file,value);this.changed();await this.save();return this.snapshot();}
  async close(){this.closed=true;clearInterval(this.interval);clearTimeout(this.timer);clearTimeout(this.saveTimer);this.watchers.forEach(w=>w.close());await this.currentScan?.catch(()=>{});await this.save();}
}
module.exports={ProjectFiles,named,excerpt,extractInWorker,inside,SUPPORTED};
