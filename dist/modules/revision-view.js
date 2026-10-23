import {escapeHTML as esc} from './workspace.js';
export class RevisionView {
 constructor({desktop,notify,refresh}){Object.assign(this,{desktop,notify,refresh,records:[],loaded:false,busy:false,status:'',selected:null,key:''});try{this.config=JSON.parse(localStorage.getItem('review-model-config'))||{};}catch{this.config={};}this.config={...this.config,mode:'remote',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash'};}
 html(){const r=this.records.find(r=>r.id===this.selected)||this.records[0];if(r)this.selected=r.id;
 return `<div class="view revision-view"><div class="section-head"><h1>文案修订</h1><button class="section-link" data-action="scan-select">选择审核项目</button><span class="meta">DeepSeek</span></div>
 <details class="model-config"><summary>模型设置</summary><div class="field"><label for="modelName">模型</label><input id="modelName" value="${esc(this.config.model)}"></div><div class="field"><label for="modelKey">DeepSeek API Key</label><input id="modelKey" type="password" autocomplete="off" value="${esc(this.key)}"></div><p class="revision-note">修订时发送批注文字至 DeepSeek，密钥仅保留于当前会话。</p></details>
 ${r?`<section class="revision-document"><div class="section-head"><h2>${esc(r.name)}</h2><span class="meta">${r.pages} 页</span></div><div class="revision-toolbar"><button class="button" data-revision="original">原稿</button><button class="button" data-revision="annotated">查看结果 · ${r.issues} 条批注</button></div><details class="revision-findings"><summary>待确认 ${r.issues}</summary>${r.findings.map(f=>`<div class="report-item"><span class="meta">P${f.page} · ${esc(f.ruleName)}</span><p>${esc(f.message)}</p><p class="muted">${esc(f.suggestion)}</p></div>`).join('')||'<p class="muted">未发现规则问题</p>'}</details></section>`:''}
 <p class="revision-status" role="status">${esc(this.status)}</p><button class="button primary revision-run" data-revision="run" ${!r||this.busy?'disabled':''}>${this.busy?'处理中…':'一键修订'}</button>
 <section class="revision-history"><h2>修订记录</h2>${r?.revisions.length?r.revisions.slice().reverse().map(v=>`<button class="revision-record" data-version="${esc(v.file)}"><strong>${v.mode==='demo'?'演示修订':esc(v.model)}</strong><span>${v.applied.length} 处修订 · ${v.unresolved} 条仍需确认</span><small>${new Date(v.createdAt).toLocaleString('zh-CN')} ↗</small></button>`).join(''):'<p class="empty-state">修订版将自动存放于本地工作区</p>'}</section></div>`;
 }
 bind(){const root=document.querySelector('.revision-view');root.querySelectorAll('[data-revision]').forEach(b=>{b.disabled=this.busy||(b.dataset.revision==='run'&&!this.selected);b.onclick=()=>this.act(b.dataset.revision);});root.querySelectorAll('[data-version]').forEach(b=>b.onclick=()=>this.call('open',{id:this.selected,version:b.dataset.version}));
 const config=()=>{for(const [id,prop]of [['modelEndpoint','endpoint'],['modelName','model']])this.config[prop]=root.querySelector('#'+id)?.value.trim()||this.config[prop];this.key=root.querySelector('#modelKey')?.value||'';localStorage.setItem('review-model-config',JSON.stringify(this.config));};
 root.querySelectorAll('.model-config input').forEach(i=>i.onchange=config);if(root.querySelector('#revisionMode'))root.querySelector('#revisionMode').onchange=e=>{config();this.config.mode=e.target.value;localStorage.setItem('review-model-config',JSON.stringify(this.config));this.refresh();};
 const select=root.querySelector('#revisionDocument');if(select)select.onchange=e=>{this.selected=e.target.value;this.status='';this.refresh();};
 if(!this.loaded){this.loaded=true;this.load();}}
 async call(action,payload){if(!this.desktop?.pdf)throw Error('请在桌面应用中使用 PDF 工作区');return this.desktop.pdf(action,payload);}
 async load(){try{this.records=await this.call('list');this.refresh();}catch(e){this.status=e.message;this.refresh();}}
 async act(action){if(this.busy)return;this.busy=true;this.status=['run','import','sample'].includes(action)?'正在处理 PDF…':'';this.refresh();
 try{let record;if(action==='sample'||action==='import')record=await this.call(action);
 else if(action==='run')record=await this.call('revise',{id:this.selected,config:{...this.config,key:this.key}});
 else if(action==='folder')await this.call('folder');
 else await this.call('open',{id:this.selected,version:action==='original'?'original.pdf':'annotated.pdf'});
 if(record){this.selected=record.id;this.records=await this.call('list');this.status=action==='run'?'修订版已保存，请打开核对版式和待确认项。':'批注 PDF 已生成，可点击查看结果。';}
 }catch(e){this.status=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'');}finally{this.busy=false;this.refresh();}}
}
