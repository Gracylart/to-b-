import {RevisionView} from './modules/revision-view.js';
import {BLUE_PALETTE,enabledRuleIds,ruleGroups,matrixGroups,matrixCount,TEAM_ROLES} from './modules/review-model.js';
import {RULES,analyzeDocument} from './modules/audit-engine.js';
import {loadWorkspace,saveWorkspace,escapeHTML as esc,newId,formatDate,timelinePosition} from './modules/workspace.js';
import {WorkflowVisual} from './modules/workflow-visual.js';

const $=id=>document.getElementById(id),desktop=window.reviewDesktop;
if(desktop?.isDesktop)document.documentElement.classList.add('desktop');
if(!desktop&&new URLSearchParams(location.search).get('preview')==='desktop')document.documentElement.classList.add('desktop-preview');
let workspace=loadWorkspace(),view='home',expanded=workspace.selectedProject,bomFilter='all',queueFilter='all';
let visual=null,job=null,jobTimer=null,toastTimer=null,timelineOffset=0,queueExpanded=false,planEditing=false;
let uiPrefs;
try{uiPrefs={theme:'dark',sidebarCollapsed:false,...JSON.parse(localStorage.getItem('review-studio-ui'))};}catch{uiPrefs={theme:'dark',sidebarCollapsed:false};}
const revision=new RevisionView({desktop,notify,refresh:()=>{if(view==='revision')render();}});
const reducedSystem=matchMedia('(prefers-reduced-motion: reduce)');
const colors=BLUE_PALETTE;
const currentMatrices=()=>matrixGroups(currentRules(),job&&view==='review'?job.matrixCount:selectedProject().matrixCount);
const currentRules=()=>job&&view==='review'?job.enabledRules:enabledRuleIds(selectedProject().enabledRules);
const selectedProject=()=>workspace.projects.find(p=>p.id===workspace.selectedProject)||workspace.projects[0];
const jobProject=()=>workspace.projects.find(p=>p.id===job?.projectId)||selectedProject();
const activeJob=()=>job&&['running','paused'].includes(job.status);
const reducedMotion=()=>workspace.settings.reducedMotion||reducedSystem.matches;
const icon=(name,cls='')=>`<img class="${cls}" src="assets/figma/${name}.svg" alt="">`;
const button=(label,action,cls='')=>`<button class="button ${cls}" data-action="${action}">${label}</button>`;
function saveUI(){localStorage.setItem('review-studio-ui',JSON.stringify(uiPrefs));}
function applyUI(){
  document.documentElement.dataset.theme=uiPrefs.theme==='light'?'light':'dark';
  $('shell').classList.toggle('sidebar-collapsed',Boolean(uiPrefs.sidebarCollapsed));
  $('studioSidebar').inert=false;
  $('collapseSidebar').setAttribute('aria-expanded',String(!uiPrefs.sidebarCollapsed));
  $('collapseSidebar').setAttribute('aria-label',uiPrefs.sidebarCollapsed?'展开侧边栏':'收起侧边栏');
  $('collapseSidebar').title=uiPrefs.sidebarCollapsed?'展开侧栏':'收起侧栏';
  $('revealSidebar').setAttribute('aria-expanded',String(!uiPrefs.sidebarCollapsed));
  document.querySelector('meta[name="theme-color"]').content=uiPrefs.theme==='light'?'#edf3f9':'#0d0e10';
}
function notify(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
function persist(){try{saveWorkspace(workspace);}catch{notify('本机存储空间不足，本次改动暂未保存。');}}
function setView(next){
  if(!['home','project','review','revision'].includes(next))return;
  if(next==='review'&&job?.status==='complete')next='revision';
  if(next==='revision')revision.loaded=false;
  view=next;render();
}
function selectProject(id){if(workspace.projects.some(p=>p.id===id)){workspace.selectedProject=id;expanded=id;persist();setView('project');}}
function setFooter(){
  $('reviewDot').hidden=!activeJob();
}
function renderSideTree(){
  const p=selectedProject(),active=view==='revision'?'revision':view;
  const paths={home:'m3 10 9-7 9 7v10H3zM9 20v-7h6v7',project:'m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',review:'M8 4H5v17h14V4h-3M8 3h8v4H8zM8 14l3 3 5-6',revision:'M14 4H5v16h14v-9M12 12l8-8 2 2-8 8-3 1z',import:'M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6',rules:'M8 3h8v4H8zM8 5H5v16h14V5h-3M9 11h6M9 15h6',file:'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h4'};
  const glyph=name=>`<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
  const item=(label,target,meta='')=>`<button class="side-item" data-view="${target}" title="${label}" aria-label="${label}" ${active===target?'aria-current="page"':''}>${glyph(target)}<span class="tree-label">${label}</span>${target==='review'?'<span id="reviewDot" class="tab-dot" hidden></span>':''}${meta?`<span class="tree-meta">${meta}</span>`:''}</button>`;
  const projectColors=['#4e8cf5','#c758da','#38bb71','#ed8b38'];
  const projectGlyphs=['M4 4h16v16H4zM4 9h16M8 6h1m3 0h1','M5 3h14v15H9l-4 3V3ZM8 7h8M8 11h8M8 15h5','M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z','M4 4h16v16H4zM8 9v6M12 7v10M16 10v4'];
  const projects=workspace.projects.map((project,index)=>{
    const open=(uiPrefs.openProjects||[]).includes(project.id);
    return `<div class="nav-project"><div class="nav-project-row"><button class="side-item" data-project-open="${esc(project.id)}" title="${esc(project.name)}" aria-label="${esc(project.name)}" ${view==='project'&&project.id===p.id?'aria-current="page"':''}><span class="project-glyph" style="--project-color:${projectColors[index%projectColors.length]}"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${projectGlyphs[index%projectGlyphs.length]}"/></svg></span><span class="tree-label">${esc(project.code)}</span></button><button class="project-disclosure" data-nav-project="${esc(project.id)}" aria-label="${open?'收起':'展开'} ${esc(project.code)} 文档" aria-expanded="${open}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg></button></div><div class="project-children" ${open?'':'hidden'}>${project.documents.map(d=>`<button data-document="${esc(d.id)}" data-project="${esc(project.id)}" title="${esc(d.name)}"><span>${esc(d.name.replace(project.code+'-',''))}</span></button>`).join('')}</div></div>`;
  }).join('');
  const group=(id,label,contents,action='')=>{const closed=(uiPrefs.closedGroups||[]).includes(id);return `<section class="side-group ${closed?'group-closed':''}" data-nav-group="${id}"><div class="side-group-title"><button class="group-toggle" data-nav-section="${id}" aria-expanded="${!closed}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg><span>${label}</span></button>${action}</div><div class="side-group-content">${contents}</div></section>`;};
  const resource=(label,action,name)=>`<button class="side-item" data-action="${action}" aria-label="${label}" title="${label}">${glyph(name)}<span class="tree-label">${label}</span></button>`;
  $('sideTree').innerHTML=`<section class="side-group primary-navigation">${item('项目总览','home')}${item('批注与修订','revision')}${resource('导入文案','import','import')}${item('审核流程','review')}</section>${group('workspace','工作区',item('当前项目','project')+resource('审核规范','rules','rules'))}${group('projects','项目',projects,'<button data-action="new-project" aria-label="新建项目" title="新建项目">＋</button>')}`;
  const labels={home:'总览',project:p.name,review:'审核流程',revision:'批注与修订'};
  $('breadcrumb').innerHTML=`<b>${esc(labels[view])}</b>`;
}
function showCommand(){
  openDialog('快速查找',`<div class="field command-field"><input id="commandInput" aria-label="搜索项目或文档" placeholder="搜索项目、文档或功能…" autocomplete="off"></div><div id="commandResults" class="command-results"></div>`);
  const entries=[...['home','project','review','revision'].map((target,i)=>({label:['项目总览','当前项目','审核流程','批注与修订'][i],detail:'工作区',run:()=>setView(target)})),...workspace.projects.flatMap(p=>[{label:p.code,detail:p.name,run:()=>selectProject(p.id)},...p.documents.map(d=>({label:d.name,detail:p.code+' · '+(d.code||'文档'),run:()=>showDocument(d.id,p.id)}))])];
  entries.push({label:'设置',detail:'工作区设置',run:showSettings},{label:'切换主题',detail:'深色 / 浅色',run:()=>{uiPrefs.theme=uiPrefs.theme==='light'?'dark':'light';saveUI();applyUI();visual?.measure();}});
  let matches=[];
  const update=()=>{const q=$('commandInput').value.trim().toLocaleLowerCase();matches=entries.filter(e=>(e.label+' '+e.detail).toLocaleLowerCase().includes(q)).slice(0,16);$('commandResults').innerHTML=matches.length?matches.map((e,i)=>`<button data-command-index="${i}"><strong>${esc(e.label)}</strong><span>${esc(e.detail)}</span></button>`).join(''):'<div class="empty-state">没有找到匹配的项目或文档</div>';};
  const choose=i=>{if(matches[i]){closeDialog();matches[i].run();}};
  $('commandInput').oninput=update;
  $('commandInput').onkeydown=e=>{if(!e.isComposing&&e.key==='Enter'){e.preventDefault();choose(0);}};
  $('commandResults').onclick=e=>{const b=e.target.closest('[data-command-index]');if(b)choose(Number(b.dataset.commandIndex));};
  update();$('commandInput').focus();
}
function render(){
  visual?.destroy();visual=null;
  $('viewRoot').innerHTML=view==='home'?homeHTML():view==='project'?projectHTML():view==='revision'?revision.html():reviewHTML();
  $('viewRoot').scrollTop=0;renderSideTree();setFooter();if(view==='revision')revision.bind();
  if(view==='review'){bindQueueDrag();visual=new WorkflowVisual($('workflow'),{reducedMotion:reducedMotion(),groups:currentMatrices()});updateReview();}
}
function homeHTML(){
  const realHistory=workspace.history.filter(h=>!h.example);
  const hasReal=realHistory.length>0;
  const activityEnd=new Date();activityEnd.setHours(12,0,0,0);activityEnd.setDate(activityEnd.getDate()+6-activityEnd.getDay());
  const activityStart=new Date(activityEnd);activityStart.setDate(activityEnd.getDate()-195);
  const daily=new Map();for(const h of realHistory){const key=new Date(h.date).toLocaleDateString('sv-SE');daily.set(key,(daily.get(key)||0)+h.total);}
  const totalDocs=realHistory.reduce((n,h)=>n+h.total,0),passed=realHistory.reduce((n,h)=>n+h.clean,0);
  const avg=hasReal?(realHistory.reduce((n,h)=>n+h.elapsed,0)/Math.max(1,totalDocs)/1000).toFixed(1)+'s':'—';
  const metrics=[['平均耗时',avg],['通过率',hasReal?Math.round(passed/Math.max(1,totalDocs)*100)+'%':'—'],['已校文档',String(totalDocs)],['审核项目',hasReal?String(new Set(realHistory.map(h=>h.projectId)).size):'0']];
  return `<div class="view home-view">
    <div class="home-intro">项目总览 </div>
    <dl class="metrics">${metrics.map(([k,v])=>`<div class="metric"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="rule"></div>
    <section aria-label="审核活动"><div class="section-head"><h2>活动</h2><span class="meta">${hasReal?'本地累计 '+totalDocs+' 文件':'尚无真实审核记录'} ${icon('a-icon-trends')}</span></div>
      <div class="heatmap" aria-label="最近 28 周审核活动">${Array.from({length:196},(_,i)=>{const day=new Date(activityStart);day.setDate(day.getDate()+i);const key=day.toLocaleDateString('sv-SE'),count=daily.get(key)||0;const intensity=count?Math.min(.95,.3+count/20):.05;return `<span class="heat-cell" style="--intensity:${intensity.toFixed(2)}" title="${key} · ${count} 份"></span>`;}).join('')}</div>
      <div class="heat-months">${Array.from({length:7},(_,i)=>{const d=new Date(activityEnd.getFullYear(),activityEnd.getMonth()-6+i,1);return `<span>${d.getMonth()+1}月</span>`;}).join('')}</div>
    </section><div class="rule"></div>
    <section><div class="section-head"><h2>过往项目</h2><button class="section-link" data-action="new-project">＋ 新项目</button></div>
      <div class="project-list past-projects">${workspace.projects.map(p=>`<div class="project-group ${expanded===p.id?'expanded':''}"><button class="project-summary" data-expand="${esc(p.id)}" aria-expanded="${expanded===p.id}">${icon('a-icon-claude')}<span>${esc(p.code)}</span><span class="project-stage">${esc(p.phase)}_${formatDate(p.due)}</span><span class="chevron">${expanded===p.id?'−':'＋'}</span></button>
        <div class="project-docs">${p.documents.slice(0,7).map(d=>`<button class="mini-doc" data-copy-code="${esc(d.code||'')}" title="点击复制料号"><span class="doc-name">${esc(d.name)}</span><span class="doc-code">${esc(d.code||'LOCAL')}</span></button>`).join('')}<button class="mini-doc" data-project-open="${esc(p.id)}"><span class="mint">查看项目详情</span><span>→</span></button></div></div>`).join('')}</div>
    </section>
    <section class="planning"><div class="section-head"><h2>项目规划</h2><div class="week-nav"><button data-action="plan-edit">${planEditing?'完成':'编辑日期'}</button><button data-action="timeline-prev" aria-label="上一周">‹</button><span class="tiny mono muted">24 天</span><button data-action="timeline-next" aria-label="下一周">›</button></div></div>${timelineHTML()}<div class="legend"><span><i style="color:var(--mint)"></i> 阶段计划</span><span>│ 今日</span><span style="margin-left:auto">${workspace.projects.length} 项目</span></div></section>
    <div class="home-actions">${button('＋ 导入文案','import','grow')}${button('开始审核 →','start-project','primary grow')}</div>
  </div>`;
}
function timelineHTML(){
  if(planEditing)return `<div class="plan-editor"><div class="plan-edit-head"><span>项目</span><span>开始日期</span><span>结束日期</span></div>${workspace.projects.map(p=>`<div class="plan-edit-row" data-plan-row="${esc(p.id)}"><span title="${esc(p.name)}">${esc(p.code)}</span><input type="date" aria-label="${esc(p.code)} 开始日期" data-plan-field="start" value="${esc(p.start)}" required><input type="date" aria-label="${esc(p.code)} 结束日期" data-plan-field="due" value="${esc(p.due)}" required></div>`).join('')}</div>`;

  const base=new Date('2026-10-20T12:00:00');base.setDate(base.getDate()+timelineOffset*7);const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const rangeStart=iso(base),labels=Array.from({length:5},(_,i)=>{const d=new Date(base);d.setDate(d.getDate()+i*6);return `${d.getMonth()+1}/${d.getDate()}`;});
  const now=new Date(),today=(new Date(now.getFullYear(),now.getMonth(),now.getDate(),12)-base)/86400000/24;
  return `<div class="gantt"><div class="gantt-axis">${labels.map(x=>`<span>${x}</span>`).join('')}</div>${workspace.projects.map((p,i)=>{const pos=timelinePosition(p.start,p.due,rangeStart);return `<div class="gantt-row"><button class="gantt-label" data-project-open="${esc(p.id)}" title="${esc(p.name)}">${esc(p.code)}</button><div class="gantt-track">${pos?`<button class="gantt-bar" data-plan="${esc(p.id)}" style="--start:${pos.start}%;--length:${pos.length}%;--bar:${colors[i%4]}" title="${esc(p.code)} · ${esc(p.start)} 至 ${esc(p.due)}"><span>${esc(p.phase)}</span></button>`:''}</div></div>`;}).join('')}${today>=0&&today<=1?`<div class="gantt-today" style="--today:${today}"></div>`:''}</div>`;
}
function projectHTML(){
  const p=selectedProject(),docs=p.documents.filter(d=>bomFilter==='all'||d.status!=='reviewed');
  return `<div class="view project-view">
    <div class="project-heading"><button class="project-switch" data-action="project-prev" aria-label="上一个项目"><span class="triangle left"></span></button><h1 title="${esc(p.name)}">${esc(p.name)}</h1><button class="project-switch" data-action="project-next" aria-label="下一个项目"><span class="triangle right"></span></button></div>
<details class="project-members" open><summary>项目成员 <span class="meta">${(p.members||[]).length}</span><span class="member-toggle"></span></summary><section><div class="section-head"><span></span><button class="section-link" data-action="members">管理</button></div><div class="members role-members">${[...new Set([...TEAM_ROLES,...(p.members||[]).map(m=>m.role)])].map(role=>{const members=(p.members||[]).filter(m=>m.role===role);return `<div class="team-role"><span class="role-name">${esc(role)}</span><div class="role-people">${members.length?members.map(m=>`<span class="person-chip" title="${esc(m.name)}">${esc(m.name)}</span>`).join(''):'<span class="unassigned">—</span>'}</div></div>`;}).join('')}</div></section></details>
    <dl class="project-meta"><div><dt>PDM 网址</dt><dd><button class="text-button" data-action="project-settings">${p.pdmUrl?'已关联 · 编辑':'待关联 ↗'}</button></dd></div><div><dt>项目文档</dt><dd>${p.documents.length} 份</dd></div><div><dt>上市区域</dt><dd><button class="meta-select" data-action="project-settings">${esc(p.region)} <span>⌄</span></button></dd></div><div><dt>语种</dt><dd><button class="meta-select" data-action="project-settings">${esc(p.language)} <span>⌄</span></button></dd></div></dl>
    <div class="project-stages">${['T0','DVT','PVT','MP'].map(stage=>`<button class="${p.phase===stage?'current':''}" data-stage="${stage}" title="查看阶段计划"><i></i><span>${stage}${stage===p.phase?'_'+formatDate(p.due):''}</span></button>`).join('')}</div>
    <details class="material-section" data-section="bom" open><summary>BOM <span class="material-toggle" aria-hidden="true"></span></summary><section><div class="section-head"><h2>物料</h2><button class="section-link" data-action="add-bom">＋ 添加</button><div class="bom-tools"><button data-bom-filter="all" class="${bomFilter==='all'?'active':''}">全部 ${p.documents.length}</button><button data-bom-filter="pending" class="${bomFilter==='pending'?'active':''}">待审核 ${p.documents.filter(d=>d.status!=='reviewed').length}</button></div></div>
      <div class="bom-list">${docs.length?docs.map(d=>`<button class="bom-row ${d.status==='reviewed'?'':'pending'}" data-copy-code="${esc(d.code||'')}" title="点击复制料号"><span class="status-square"></span><span class="bom-name">${esc(d.name)}</span><span class="bom-code">${esc(d.code==='LOCAL'?'待编码':d.code||'待编码')}</span></button>`).join(''):'<div class="empty-state">当前项目的文档已全部检查</div>'}</div>
      
    </section></details><div class="rule"></div>
    <details class="material-section" data-section="sku" open><summary>SKU <span class="material-toggle" aria-hidden="true"></span></summary><section><div class="section-head"><h2>版本</h2><span class="meta">${(p.skus||[]).length} 版本</span></div><table class="table"><thead><tr><th>版本</th><th>区域</th><th>语种</th><th>物料</th></tr></thead><tbody>${(p.skus||[]).map(s=>`<tr><td title="${esc(s.name)}">${esc(s.name)}</td><td>${esc(s.region)}</td><td>${esc(s.language)}</td><td>${esc(s.materials)}</td></tr>`).join('')}</tbody></table></section></details>
    <div class="delivery-line"><span>下一次交付</span><strong>${esc(p.phase)} · ${esc(p.due)}</strong></div>
    <div class="project-actions">${button('项目资料','project-settings')}${button('审核本项目 →','start-project','primary')}</div>
  </div>`;
}
function reviewHTML(){
  const p=job?jobProject():selectedProject(),groups=ruleGroups(currentRules()),matrices=currentMatrices();
  return `<div class="view review-view"><div class="review-project"><div class="field"><label for="scanProject">审核项目</label><select id="scanProject" ${activeJob()?'disabled':''}>${workspace.projects.map(x=>`<option value="${esc(x.id)}" ${x.id===workspace.selectedProject?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><span class="status-pill" id="runBadge" data-status="idle"><i class="dot"></i><span>未开始</span></span></div>
    <div class="review-summary"><div><span>已检查</span><strong><b id="doneCount">0</b><small id="totalCount">/ ${p.documents.length}</small></strong></div><div><span>规则通过</span><strong id="passCount">0</strong></div><div><span>待修订</span><strong id="issueCount">0</strong></div></div>
    <section class="workflow" id="workflow"><div class="flow-heading"><button class="rule-config-link" data-action="rules">审核规范 <span>${currentRules().length}</span> <span aria-hidden="true">⚙</span></button></div>
      <div class="flow-workspace"><div class="source-panel"><div class="source-heading"><span class="source-name" id="currentDocument">扫描记录</span><span id="currentStep">0/0</span></div><div class="source-viewport" aria-label="实时扫描代码"><div class="source-feed"></div></div></div>
      <div class="agent-groups" data-group-count="${matrices.length}">${matrices.map(g=>`<div class="agent-group"><div class="agent-grid" style="--cols:${g.cols};--rows:${g.rows};--node:${g.color}">${Array.from({length:g.rows},(_,row)=>Array.from({length:g.cols},(_,col)=>`<i class="agent-cell" data-group="${g.index}" data-row="${row}" data-col="${col}" title="${esc(RULES.find(r=>r.id===g.ids[row%g.ids.length])?.name||'未启用')} · ${['读取','定位','检查','复核','汇总'].slice(5-g.cols)[col]}"></i>`).join('')).join('')}</div><span class="agent-label">${g.short} <span>${g.ids.length}</span></span></div>`).join('')}</div>
      </div><div class="flow-transfer" aria-hidden="true"></div>
      <div class="rule-bars">${groups.map((g,i)=>`<div class="rule-bar" ${g.ids.length?'':'hidden'}><span>${g.name}</span><div class="bar-track"><div class="bar-fill" id="ruleBar${i}" style="--bar:${g.color};width:0%"></div></div><span class="rule-count" id="ruleCount${i}">0/0</span></div>`).join('')}</div>
      <canvas class="flow-canvas" aria-hidden="true"></canvas>

    </section>
    <section hidden class="queue-section ${queueExpanded?'expanded':''}" id="queuePanel"><button class="queue-grip" id="queueGrip" aria-label="${queueExpanded?'收起待确认':'展开待确认'}" aria-expanded="${queueExpanded}" aria-controls="findings"><i></i><span>${queueExpanded?'下拉收起':'上拉展开'}</span></button><div class="section-head"><h2>待确认 <span class="faint small" id="queueTotal">0</span></h2><div class="queue-tabs"><button data-queue-filter="all" class="${queueFilter==='all'?'selected':''}">全部</button><button data-queue-filter="error" class="${queueFilter==='error'?'selected':''}">错误</button><button data-queue-filter="warning" class="${queueFilter==='warning'?'selected':''}">提示</button></div></div><div class="finding-list" id="findings"></div></section>
    <div class="review-controls"><div class="progress-meta"><span id="progressLabel">等待开始</span><span id="progressPercent">0%</span></div><div class="progress-track" role="progressbar" aria-label="审核进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progressTrack"><div class="progress-fill" id="progressFill"></div></div>
      <div class="review-buttons" id="reviewButtons"></div><div class="review-source" id="reviewSource">LOCAL RULE CHECK · 文案仅在本机处理</div>
    </div>
  </div>`;
}
function reviewCounts(){const results=[...(job?.results||[])];if(job?.pending&&job.documents[job.processed])results.push({document:job.documents[job.processed],analysis:job.pending});return{issues:results.reduce((n,r)=>n+r.analysis.findings.length,0),passed:results.reduce((n,r)=>n+r.analysis.summary.passed,0),findings:results.flatMap(r=>r.analysis.findings.map(f=>({...f,documentId:r.document.id,filename:r.document.name})))};}
function updateReview(){
  const counts=reviewCounts();setFooter();
  if(view!=='review')return;
  const p=job?jobProject():selectedProject(),total=job?.documents.length??p.documents.filter(d=>d.text.trim()).length,done=job?.processed||0;
  const fraction=job?.status==='complete'?1:job?Math.min(1,job.tick/(Math.max(1,total)*job.enabledRules.length)):0;
  const badge={idle:'未开始',running:'扫描中',paused:'已暂停',complete:'已完成',cancelled:'已停止'}[job?.status||'idle'];
  $('runBadge').dataset.status=job?.status||'idle';$('runBadge').querySelector('span').textContent=badge;
  $('doneCount').textContent=String(done);$('totalCount').textContent='/ '+total;
  $('passCount').textContent=counts.passed;$('issueCount').textContent=counts.issues;
  const current=job?.documents.find(d=>d.id===job.currentDocumentId)||job?.documents[0];
  $('currentStep').textContent=job?.tick?`${Math.min(Math.ceil(job.tick/job.enabledRules.length),total)}/${total}`:`${total} 份`;
  visual?.setState({running:job?.status==='running',progress:fraction,status:job?.status||'idle',reducedMotion:reducedMotion()});
  visual?.setSource(current,job?.status||'idle');
  visual?.setLogs(job?.logs||[]);
  $('queueTotal').textContent=counts.issues>120?counts.issues+' · 显示前120项':counts.issues;
  const findings=counts.findings.filter(f=>queueFilter==='all'||f.severity===queueFilter);
  const findingHTML=findings.length?findings.slice(0,120).map((f,i)=>`<button class="finding ${f.severity}" data-finding="${esc(f.id)}" data-finding-document="${esc(f.documentId)}"><i class="finding-marker"></i><span class="finding-content"><span class="finding-title">${esc(f.message)}</span><span class="finding-meta" style="display:block">${esc(f.filename)} · ${esc(f.ruleName)}</span></span><span class="finding-line">L${f.line}</span></button>`).join(''):`<div class="empty-state">${job?.status==='complete'?'<span class="checkmark">✓</span>未发现问题':job?.status==='running'?'正在检查…':'等待开始'}</div>`;
  if($('findings').innerHTML!==findingHTML){const scroll=$('findings').scrollTop;$('findings').innerHTML=findingHTML;$('findings').scrollTop=scroll;}
  const groups=ruleGroups(currentRules()).map(g=>g.ids);
  const totals=groups.map(g=>total*g.length),checked=groups.map(g=>(job?.results||[]).reduce((n,r)=>n+r.analysis.rules.filter(rule=>g.includes(rule.id)).length,0)+(job?.pending?.rules.filter(rule=>g.includes(rule.id)).length||0));
  visual?.setChecks(checked,totals);
  const elapsed=job?elapsedMs():0,secs=Math.floor(elapsed/1000),clock=`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
  $('progressLabel').textContent=job?.status==='complete'?`已完成 · ${clock}`:job?.status==='paused'?`已暂停 · ${clock}`:job?.status==='cancelled'?'已停止':job?`${job.currentRule||'准备检查'} · ${clock}`:'等待开始';
  $('progressPercent').textContent=Math.floor(fraction*100)+'%';$('progressFill').style.width=fraction*100+'%';$('progressTrack').setAttribute('aria-valuenow',String(Math.floor(fraction*100)));
  const stateKey=job?.status||'idle';if($('reviewButtons').dataset.state!==stateKey){$('reviewButtons').dataset.state=stateKey;$('reviewButtons').innerHTML=stateKey==='running'?button('Ⅱ 暂停','pause')+button('停止','stop'):stateKey==='paused'?button('▶ 继续','resume','primary')+button('停止','stop'):['complete','cancelled'].includes(stateKey)?button('进入修订','to-revision'):button('＋ 导入','import')+button(p.documents.filter(d=>d.text.trim()).every(d=>d.example)?'演示审核 →':'开始审核 →','start-project','primary');}
  $('reviewSource').textContent=job?.example?'示例演练':'本地预检';
}
function elapsedMs(){if(!job)return 0;return job.elapsed+(job.status==='running'?performance.now()-job.resumedAt:0);}
function log(level,text,detail={}){const ms=elapsedMs();job.logs.push({...detail,time:`${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`,level,text});if(job.logs.length>150)job.logs.shift();}
function notifyDesktop(){const counts=reviewCounts();desktop?.updateStatus({state:job?.status==='cancelled'?'idle':job?.status||'idle',progress:job?Math.round(job.tick/Math.max(1,job.documents.length*job.enabledRules.length)*100):0,issues:counts.issues});}
function beginRun(projectId,documents,forceExample=null){
  if(!documents.length){notify('先添加一份文案，再开始审核。');return;}
  if(activeJob()){notify('当前审核尚未结束，可先暂停或停止。');setView('review');return;}
  clearInterval(jobTimer);
  documents=documents.filter(d=>d.text.trim());
  if(!documents.length){notify('请先为 BOM 物料添加文案。');return;}
  const enabledRules=enabledRuleIds(workspace.projects.find(p=>p.id===projectId)?.enabledRules);
  if(!enabledRules.length){notify('请至少启用一项审核规范。');return;}
  const example=forceExample??documents.every(d=>d.example);
  job={projectId,enabledRules,matrixCount:matrixCount(workspace.projects.find(p=>p.id===projectId)?.matrixCount),projectName:workspace.projects.find(p=>p.id===projectId)?.name||'',documents:documents.map(d=>({...d})),example,status:'running',processed:0,tick:0,results:[],logs:[],elapsed:0,resumedAt:performance.now(),startedAt:new Date().toISOString()};
  log('init',`${documents.length} 份文案 · ${enabledRules.length} 项规范`);log('info',example?'示例演练开始，方块按检查阶段推进。':'文案已载入本机内存，不上传服务器。');
  setView('review');notifyDesktop();scheduleRun();
}
function scheduleRun(){clearInterval(jobTimer);jobTimer=setInterval(tick,job.example?260:65);}
function tick(){
  if(job?.status!=='running')return;
  const d=job.documents[job.processed];
  if(!d){finishRun();return;}
  const index=job.tick%job.enabledRules.length,id=job.enabledRules[index];
  if(index===0)job.pending={rules:[],findings:[],summary:{passed:0}};
  const result=analyzeDocument(d.text,{filename:d.filename||d.name,projectName:job.projectName,enabledRules:[id]});
  job.pending.rules.push(...result.rules);job.pending.findings.push(...result.findings);job.pending.summary.passed+=result.summary.passed;
  job.currentRule=RULES.find(r=>r.id===id)?.name||id;
  job.currentDocumentId=d.id;
  log('scan',`check(${JSON.stringify(d.filename||d.name)}, ${JSON.stringify(id)}) // ${result.findings.length} findings`,{id:job.tick,rule:id,filename:d.filename||d.name,findings:result.findings.length});
  if(index===job.enabledRules.length-1){job.results.push({document:d,analysis:job.pending});job.processed++;job.pending=null;}

  job.tick++;updateReview();
  notifyDesktop();if(job.processed===job.documents.length)finishRun();
}
async function finishRun(){
  clearInterval(jobTimer);jobTimer=null;if(!job||job.status==='complete')return;
  job.elapsed=elapsedMs();job.status='complete';log('pass','全部规则执行完成 · report ready · exit 0');
  const p=jobProject();for(const r of job.results){const doc=p.documents.find(d=>d.id===r.document.id);if(doc&&doc.text===r.document.text&&doc.name===r.document.name&&p.name===job.projectName){doc.status='reviewed';doc.lastReviewedAt=new Date().toISOString();doc.lastIssueCount=r.analysis.findings.length;}}
  const actual=job.results.filter(r=>!r.document.example);
  workspace.history.push({id:newId('run'),projectId:p.id,example:!actual.length,total:actual.length,clean:actual.filter(r=>!r.analysis.findings.length).length,issues:actual.reduce((n,r)=>n+r.analysis.findings.length,0),elapsed:job.elapsed*actual.length/Math.max(1,job.results.length),date:new Date().toISOString()});workspace.history=workspace.history.slice(-50);persist();updateReview();notifyDesktop();
  setView('revision');revision.busy=true;revision.status='正在生成批注 PDF…';render();
  try{const record=await desktop.pdf('report',{name:job.projectName,results:job.results});revision.selected=record.id;revision.records=await desktop.pdf('list');revision.status='扫描完成，可开始修订';}catch(e){revision.status=e.message;}finally{revision.busy=false;if(view==='revision')render();}
}
function pauseRun(){if(job?.status!=='running')return;job.elapsed=elapsedMs();job.status='paused';clearInterval(jobTimer);jobTimer=null;log('info','检查已暂停，当前结果已保留。');updateReview();notifyDesktop();}
function resumeRun(){if(job?.status!=='paused')return;job.resumedAt=performance.now();job.status='running';log('info','继续从当前文案执行。');scheduleRun();updateReview();notifyDesktop();}
function stopRun(){if(!activeJob())return;job.elapsed=elapsedMs();job.status='cancelled';clearInterval(jobTimer);jobTimer=null;log('info','审核已停止，已完成的检查结果可导出。');updateReview();notifyDesktop();}
function openDialog(title,html){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();}
function closeDialog(){$('dialog').close();}
function showDocument(id,projectId){
  const p=workspace.projects.find(p=>p.id===projectId),d=p?.documents.find(d=>d.id===id);if(!d)return;
  openDialog(d.name,`<p class="small muted" style="margin-bottom:10px">${esc(d.code||'LOCAL')} · ${d.example?'示例文案':'本地文案'}</p><div class="document-preview" id="documentText"></div><div class="dialog-actions"><button class="button" data-edit-document="${esc(d.id)}" data-project="${esc(p.id)}">编辑文案</button><button class="button primary" ${d.text.trim()?'':'disabled'} data-review-document="${esc(d.id)}" data-project="${esc(p.id)}">审核此文案 →</button></div>`);$('documentText').textContent=d.text||'尚未添加文案';
}
function editDocument(id,projectId){
  const p=workspace.projects.find(p=>p.id===projectId),d=p?.documents.find(d=>d.id===id);if(!d)return;
  openDialog('编辑文案',`<form id="editDocumentForm"><div class="field"><label for="editDocName">文档名称</label><input id="editDocName" maxlength="100" required></div><div class="field"><label for="editDocCode">物料编码</label><input id="editDocCode" maxlength="60"></div><div class="field"><label for="editDocText">文案正文</label><textarea id="editDocText" maxlength="200000" required></textarea></div><div class="dialog-actions"><button class="button primary" type="submit">保存文案</button></div></form>`);$('editDocCode').value=d.code==='LOCAL'?'':d.code||'';$('editDocName').value=d.name;$('editDocText').value=d.text;
  $('editDocumentForm').onsubmit=e=>{e.preventDefault();d.name=$('editDocName').value.trim();d.code=$('editDocCode').value.trim()||'LOCAL';d.text=$('editDocText').value;d.example=false;d.status='pending';persist();closeDialog();render();notify('文案已保存到本机。');};
}
function addBom(){
  const p=selectedProject();
  openDialog('添加 BOM',`<form id="bomForm"><div class="field"><label for="bomName">物料名称</label><input id="bomName" maxlength="100" placeholder="例如：国内版-包装标贴" required></div><div class="field"><label for="bomCode">物料编码</label><input id="bomCode" maxlength="60" placeholder="可稍后补充"></div><div class="field"><label for="bomText">文案（选填）</label><textarea id="bomText" maxlength="200000" placeholder="有文案后即可审核"></textarea></div><div class="dialog-actions"><button class="button primary" type="submit">添加物料</button></div></form>`);
  $('bomForm').onsubmit=e=>{e.preventDefault();const name=$('bomName').value.trim();if(!name)return;const text=$('bomText').value;p.documents.push({id:newId('doc'),name,filename:name+'.txt',code:$('bomCode').value.trim()||'LOCAL',text,example:false,status:'pending',createdAt:new Date().toISOString()});bomFilter='all';persist();closeDialog();render();notify('BOM 已添加');};
}
function editMembers(){
  const p=selectedProject(),roles=[...new Set([...TEAM_ROLES,...(p.members||[]).map(m=>m.role)])];
  openDialog('项目成员',`<form id="membersForm"><p class="field-hint">同一角色可填写多人，用逗号分隔。</p>${roles.map((role,i)=>`<div class="member-field"><label for="team${i}">${esc(role)}</label><input id="team${i}" maxlength="500" value="${esc((p.members||[]).filter(m=>m.role===role).map(m=>m.name).join('，'))}" placeholder="姓名"></div>`).join('')}<div class="dialog-actions"><button class="button primary" type="submit">保存成员</button></div></form>`);
  $('membersForm').onsubmit=e=>{e.preventDefault();p.members=roles.flatMap((role,i)=>[...new Set($('team'+i).value.split(/[,，、;；\n]+/).map(n=>n.trim()).filter(Boolean))].map(name=>({name,role,initials:name.slice(0,1),color:colors[i%4]})));persist();closeDialog();render();};
}
function editRules(){
  const p=job&&view==='review'?jobProject():selectedProject(),ids=enabledRuleIds(p.enabledRules);
  openDialog('审核规范',`<form id="rulesForm"><p class="field-hint">4 组固定 5×5 方阵，扫描频率随文件与启用规范变化。${activeJob()?'本轮使用开始时的配置，修改将在下次审核生效。':''}</p>${ruleGroups().map(g=>`<fieldset class="rule-fieldset"><legend>${g.name}</legend>${g.ids.map(id=>{const r=RULES.find(r=>r.id===id);return `<label class="rule-option"><input type="checkbox" name="rule" value="${id}" ${ids.includes(id)?'checked':''}><span>${r.name}<small>${r.description}</small></span></label>`;}).join('')}</fieldset>`).join('')}<div class="dialog-actions"><button class="button primary" type="submit">保存规范</button></div></form>`);
  $('rulesForm').onsubmit=e=>{e.preventDefault();const ids=[...$('rulesForm').querySelectorAll('input:checked')].map(input=>input.value);if(!ids.length){notify('请至少保留一项规范');return;}p.enabledRules=ids;p.matrixCount=4;persist();closeDialog();if(!activeJob()){job=null;render();}else notify('已保存，下次审核生效');};
}
function importDialog(){
  if(activeJob()){notify('请先完成或停止当前审核，再添加并审核新文案。');setView('review');return;}
  openDialog('添加待审核文案',`<form id="importForm"><div class="field"><label for="importProject">所属项目</label><select id="importProject">${workspace.projects.map(p=>`<option value="${esc(p.id)}"${p.id===workspace.selectedProject?' selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label for="importName">文档名称</label><input id="importName" placeholder="例如：国内版-快速指南" maxlength="100" required></div><div class="field"><label for="importText">粘贴文案</label><textarea id="importText" placeholder="在这里粘贴要检查的文案…" maxlength="200000" required></textarea></div><p class="small faint">支持 UTF-8 文本、Markdown、CSV、JSON。单文件最大 2 MB。</p><div class="dialog-actions">${button('选择文件','pick-files')}<button type="submit" class="button primary">添加并审核 →</button></div></form>`);
  $('importForm').onsubmit=e=>{e.preventDefault();const p=workspace.projects.find(p=>p.id===$('importProject').value);const name=$('importName').value.trim(),text=$('importText').value;if(!name||!text.trim())return;const d={id:newId('doc'),name,filename:name+'.txt',code:'LOCAL',text,example:false,status:'pending',createdAt:new Date().toISOString()};p.documents.push(d);workspace.selectedProject=p.id;persist();closeDialog();beginRun(p.id,[d],false);};
}
async function readFiles(files){
  if(activeJob()){notify('请先完成或停止当前审核，再导入文件。');return;}
  const p=workspace.projects.find(p=>p.id===$('importProject')?.value)||selectedProject(),added=[],skipped=[];
  for(const file of files){
    if(!/\.(txt|md|csv|json)$/i.test(file.name)||file.size>2*1024*1024){skipped.push(file.name);continue;}
    try {const bytes=await file.arrayBuffer();const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!text.trim()||text.includes('\0'))throw new Error('不是有效文本');
      const d={id:newId('doc'),name:file.name.replace(/\.[^.]+$/,''),filename:file.name,code:'LOCAL',text,example:false,status:'pending',createdAt:new Date().toISOString()};p.documents.push(d);added.push(d);
    }catch{skipped.push(file.name);}
  }
  if(added.length){workspace.selectedProject=p.id;persist();closeDialog();beginRun(p.id,added,false);}
  if(skipped.length)notify(`${skipped.length} 份文件未导入：请使用有效 UTF-8 文本，且不超过 2 MB。`);
}
function choiceSelect(id,label,value,options){
  const choices=[...new Set([value,...options].filter(Boolean))];return `<select id="${id}" aria-label="${label}">${choices.map(v=>`<option value="${esc(v)}"${v===value?' selected':''}>${esc(v)}</option>`).join('')}</select>`;
}
function setQueueExpanded(expanded){
  queueExpanded=expanded;const panel=$('queuePanel'),grip=$('queueGrip');if(!panel)return;
  panel.classList.toggle('expanded',expanded);grip.setAttribute('aria-expanded',String(expanded));grip.setAttribute('aria-label',expanded?'收起待确认':'展开待确认');grip.querySelector('span').textContent=expanded?'下拉收起':'上拉展开';
}
function bindQueueDrag(){
  const grip=$('queueGrip');let start=null,suppressClick=false;
  grip.onpointerdown=e=>{start=e.clientY;suppressClick=false;grip.setPointerCapture(e.pointerId);};
  grip.onpointerup=e=>{if(start===null)return;const delta=e.clientY-start;start=null;if(Math.abs(delta)>22){setQueueExpanded(delta<0);suppressClick=true;}};
  grip.onpointercancel=()=>{start=null;};
  grip.onclick=()=>{if(suppressClick){suppressClick=false;return;}setQueueExpanded(!queueExpanded);};
  grip.onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setQueueExpanded(e.key==='ArrowUp');}};
}
function projectSettings(){
  const p=selectedProject();
  openDialog('项目资料',`<form id="projectForm"><div class="field"><label for="projectName">项目名称</label><input id="projectName" maxlength="80" required></div><div class="field"><label for="projectRegion">上市区域 / 语种</label><div class="row">${choiceSelect('projectRegion','上市区域',p.region,['中国大陆','中国香港 / 澳门','中国台湾','欧洲','北美','日本','韩国','东南亚','中东','澳大利亚 / 新西兰','乌克兰','全球'])}${choiceSelect('projectLanguage','语种',p.language,['简体中文','繁体中文','EN','DE','FR','ES','IT','PT','JA','KO','AR','UK','EN / 中文','EN / DE / FR','多语种'])}</div></div><div class="field"><label for="projectPdm">PDM 地址</label><input id="projectPdm" type="url" placeholder="https://…" maxlength="2000"><small>仅保存项目网址，不读取 PDM 数据。</small></div><div class="dialog-actions"><button class="button primary" type="submit">保存项目</button></div></form>`);
  $('projectName').value=p.name;$('projectRegion').value=p.region;$('projectLanguage').value=p.language;$('projectPdm').value=p.pdmUrl||'';
  $('projectForm').onsubmit=e=>{e.preventDefault();const url=$('projectPdm').value.trim();if(url&&!/^https:\/\//i.test(url)){notify('PDM 地址需要以 https:// 开头。');return;}p.name=$('projectName').value.trim();p.region=$('projectRegion').value.trim();p.language=$('projectLanguage').value.trim();p.pdmUrl=url;persist();closeDialog();render();};
}
function newProjectDialog(){
  openDialog('新建项目',`<form id="newProjectForm"><div class="field"><label for="newName">项目名称</label><input id="newName" required maxlength="60" placeholder="例如：R601P 新产品"></div><div class="field"><label for="newCode">项目简称</label><input id="newCode" required maxlength="18" placeholder="R601P"></div><div class="field"><label for="newDue">计划交付日期</label><input type="date" id="newDue" required value="${new Date(Date.now()+21*86400000).toLocaleDateString('sv-SE')}"></div><div class="dialog-actions"><button class="button primary" type="submit">创建项目</button></div></form>`);
  $('newProjectForm').onsubmit=e=>{e.preventDefault();const p={id:newId('project'),createdAt:new Date().toISOString(),name:$('newName').value.trim(),code:$('newCode').value.trim(),due:$('newDue').value,start:new Date().toLocaleDateString('sv-SE'),phase:'T0',region:'待填写',language:'待填写',color:'#7ebeff',documents:[],skus:[],members:[],example:false,pdmUrl:''};workspace.projects.push(p);workspace.selectedProject=p.id;persist();closeDialog();setView('project');};
}
function editPlan(){planEditing=true;setView('home');}
function finishPlanEdit(){
  const rows=[...document.querySelectorAll('[data-plan-row]')];
  const changes=rows.map(row=>({p:workspace.projects.find(p=>p.id===row.dataset.planRow),start:row.querySelector('[data-plan-field="start"]'),due:row.querySelector('[data-plan-field="due"]')}));
  for(const c of changes){if(!c.start.reportValidity()||!c.due.reportValidity())return false;if(c.due.value<c.start.value){notify('结束日期不能早于开始日期');c.due.focus();return false;}}
  for(const c of changes){c.p.start=c.start.value;c.p.due=c.due.value;}persist();return true;
}
async function showReport(){
  if(!job?.results.length){notify('完成第一份文案检查后即可查看结果。');return;}
  if(!desktop?.pdf){notify('PDF 批注请在桌面应用中查看');return;}
  try{
    if(!job.pdfRecord||job.pdfCount!==job.results.length){job.pdfRecord=await desktop.pdf('report',{name:job.projectName,results:job.results});job.pdfCount=job.results.length;}
    await desktop.pdf('open',{id:job.pdfRecord.id,version:'annotated.pdf'});
  }catch(error){notify(error.message);}

}
function showFinding(id,documentId){
  const r=job?.results.find(r=>r.document.id===documentId),f=r?.analysis.findings.find(f=>f.id===id);if(!f)return;
  openDialog(f.ruleName,`<div class="dialog-copy"><p class="${f.severity==='error'?'error':'warning'}">${esc(f.message)}</p><p class="tiny faint">${esc(r.document.name)} · 第 ${f.line} 行</p><div class="document-preview" style="margin:10px 0">${esc(f.excerpt)}</div><p class="mint">${esc(f.suggestion)}</p></div><div class="dialog-actions"><button class="button primary" data-edit-document="${esc(documentId)}" data-project="${esc(job.projectId)}">编辑原文</button>${button('全部结果','report')}</div>`);
}

async function showSettings(){
  const prefs=desktop?await desktop.getPreferences():null;
  openDialog('审核台设置',`<div class="setting-row"><div>减少动态效果<small>关闭粒子飞行与方块闪烁</small></div><input id="reduceMotion" type="checkbox" aria-label="减少动态效果"${workspace.settings.reducedMotion?' checked':''}></div>${desktop?`<div class="setting-row"><div>固定窗口<small>保持在其他窗口前方</small></div><input id="pinSetting" type="checkbox" aria-label="固定窗口"${prefs.pinned?' checked':''}></div><div class="setting-row"><div>登录时启动<small>只启动菜单栏入口</small></div><input id="loginSetting" type="checkbox" aria-label="登录时启动"${prefs.launchAtLogin?' checked':''}></div>`:''}<div class="settings-note">审核采用 ${RULES.length} 项本地确定性规则，支持文本输入和导入。项目、SKU、成员和历史统计中的初始内容为示例。修订页可配置模型接口；未接入 PDM 或团队账号。</div><div class="rule"></div><div class="stack small"><a href="https://github.com/Gracylart/to-b-" target="_blank" rel="noreferrer">项目源代码 ↗</a><a href="https://github.com/Javis603/token-monitor" target="_blank" rel="noreferrer">菜单栏形态参考 · Token Monitor ↗</a>${desktop?'':'<a href="reference/index.html" target="_blank">原始粒子动效演示 ↗</a>'}</div>`);
  $('reduceMotion').onchange=e=>{workspace.settings.reducedMotion=e.target.checked;persist();visual?.setState({running:job?.status==='running',progress:job?job.tick/(job.documents.length*job.enabledRules.length):0,status:job?.status||'idle',reducedMotion:reducedMotion()});};
  if(desktop){$('pinSetting').onchange=async e=>{const p=await desktop.setPinned(e.target.checked);$('pinWindow').setAttribute('aria-pressed',String(p.pinned));};$('loginSetting').onchange=async e=>{const p=await desktop.setPreferences({launchAtLogin:e.target.checked});e.target.checked=p.launchAtLogin;};}
}
const actions={
  'scan-select':()=>{job=null;setView('review');},
  'to-revision':()=>setView('revision'),
  'import':importDialog,'pick-files':()=>{$('fileInput').value='';$('fileInput').click();},
  'new-project':newProjectDialog,'project-settings':projectSettings,'add-bom':addBom,'members':editMembers,'rules':editRules,
  'start-project':()=>{const p=selectedProject();beginRun(p.id,p.documents);},
  'project-prev':()=>{const i=workspace.projects.findIndex(p=>p.id===workspace.selectedProject);selectProject(workspace.projects[(i-1+workspace.projects.length)%workspace.projects.length].id);},
  'project-next':()=>{const i=workspace.projects.findIndex(p=>p.id===workspace.selectedProject);selectProject(workspace.projects[(i+1)%workspace.projects.length].id);},
  'plan-edit':()=>{if(planEditing&&!finishPlanEdit())return;planEditing=!planEditing;render();},
  'timeline-prev':()=>{if(planEditing&&!finishPlanEdit())return;timelineOffset--;render();},'timeline-next':()=>{if(planEditing&&!finishPlanEdit())return;timelineOffset++;render();},
  pause:pauseRun,resume:resumeRun,stop:stopRun,report:showReport,
  replay:()=>{if(job){const p=jobProject(),ids=new Set(job.documents.map(d=>d.id));beginRun(p.id,p.documents.filter(d=>ids.has(d.id)));}},
  'close-dialog':closeDialog,
};
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.navSection){const ids=new Set(uiPrefs.closedGroups||[]);ids.has(b.dataset.navSection)?ids.delete(b.dataset.navSection):ids.add(b.dataset.navSection);uiPrefs.closedGroups=[...ids];saveUI();renderSideTree();setFooter();document.querySelector(`[data-nav-section="${b.dataset.navSection}"]`)?.focus();return;}
  if(b.dataset.navProject){const ids=new Set(uiPrefs.openProjects||[]);ids.has(b.dataset.navProject)?ids.delete(b.dataset.navProject):ids.add(b.dataset.navProject);uiPrefs.openProjects=[...ids];saveUI();renderSideTree();setFooter();document.querySelector(`[data-nav-project="${b.dataset.navProject}"]`)?.focus();return;}
  if(b.dataset.copyCode!==undefined){
    const code=b.dataset.copyCode;
    if(!/^\d+$/.test(code))return;
    (desktop?.copyCode?desktop.copyCode(code):navigator.clipboard.writeText(code)).catch(()=>{});
    return;
  }
  if(b.dataset.view){setView(b.dataset.view);return;}
  if(b.dataset.action){actions[b.dataset.action]?.();return;}
  if(b.dataset.expand){expanded=expanded===b.dataset.expand?null:b.dataset.expand;render();return;}
  if(b.dataset.projectOpen){selectProject(b.dataset.projectOpen);return;}
  if(b.dataset.document){showDocument(b.dataset.document,b.dataset.project);return;}
  if(b.dataset.editDocument){editDocument(b.dataset.editDocument,b.dataset.project);return;}
  if(b.dataset.reviewDocument){const p=workspace.projects.find(p=>p.id===b.dataset.project);closeDialog();beginRun(p.id,p.documents.filter(d=>d.id===b.dataset.reviewDocument));return;}
  if(b.dataset.bomFilter){bomFilter=b.dataset.bomFilter;render();return;}
  if(b.dataset.queueFilter){queueFilter=b.dataset.queueFilter;document.querySelectorAll('[data-queue-filter]').forEach(x=>x.classList.toggle('selected',x.dataset.queueFilter===queueFilter));updateReview();return;}
  if(b.dataset.finding){showFinding(b.dataset.finding,b.dataset.findingDocument);return;}
  if(b.dataset.plan){editPlan(b.dataset.plan);return;}
  if(b.dataset.stage){editPlan(selectedProject().id);}
});
document.addEventListener('change',e=>{if(e.target.id==='scanProject'){workspace.selectedProject=e.target.value;job=null;persist();render();}if(e.target.matches('[data-plan-field]'))finishPlanEdit();});
$('closeDialog').onclick=closeDialog;
$('openCommand').onclick=showCommand;
$('collapseSidebar').onclick=()=>{uiPrefs.sidebarCollapsed=!uiPrefs.sidebarCollapsed;saveUI();applyUI();$('collapseSidebar').focus();};
$('revealSidebar').onclick=()=>{uiPrefs.sidebarCollapsed=false;saveUI();applyUI();$('collapseSidebar').focus();};
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
$('fileInput').onchange=e=>readFiles([...e.target.files]);
if(desktop)desktop.onNavigate(next=>next==='settings'?showSettings():setView(next));
document.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229)return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!$('dialog').open)showCommand();return;}if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable||$('dialog').open)return;if(e.key==='/'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();showCommand();return;}if(e.code==='Space'&&view==='review'&&activeJob()){e.preventDefault();job.status==='running'?pauseRun():resumeRun();}if(view==='review'&&queueExpanded&&e.key==='Escape'){setQueueExpanded(false);e.stopPropagation();}
if(view==='project'&&e.key==='ArrowLeft')actions['project-prev']();if(view==='project'&&e.key==='ArrowRight')actions['project-next']();});
reducedSystem.addEventListener('change',()=>{if(view==='review')updateReview();});
applyUI();render();
