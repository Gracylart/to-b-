import {enabledRuleIds,sampleMembers,matrixCount} from './review-model.js';
import { SAMPLE_DOCUMENTS } from './audit-engine.js';
import {normalizeSkin} from './appearance.js';

export const STORAGE_KEY = 'review-desk-workspace-v1';
const names = ['滚筒拆装标贴', '黄板箱', '基站铭牌', '快速指南', '说明书', '销售标贴', '主机铭牌'];
const codes = ['04170700033972','04170200003754','04170600002408','04170500010919','04170500010921','04170600033973','04170600002407'];
export function createWorkspace() {
  const createdAt = new Date().toISOString();
  const projects = [
    {id:'r501p',code:'R501P',name:'R501P-S60 Pro Max',region:'中国大陆',language:'简体中文',phase:'PVT',due:'2026-11-05',start:'2026-10-16',color:'#f3ce68',count:7},
    {id:'r521p',code:'R521P',name:'R521P',region:'欧洲',language:'EN / DE / FR',phase:'DVT',due:'2026-11-09',start:'2026-10-23',color:'#a48af0',count:5},
    {id:'e2',code:'E2 Station',name:'E2 Station',region:'全球',language:'EN / 中文',phase:'MP',due:'2026-10-23',start:'2026-10-12',color:'#6adeb1',count:3},
    {id:'ua',code:'乌克兰标贴',name:'乌克兰标贴',region:'乌克兰',language:'UK',phase:'MP',due:'2026-10-29',start:'2026-10-20',color:'#73bdf5',count:2},
  ].map((p, i) => {
    const sample = SAMPLE_DOCUMENTS.find(d=>d.projectName===p.name) || SAMPLE_DOCUMENTS[2];
    return {
      ...p, example:true, pdmUrl:'',createdAt,
      members:sampleMembers(),enabledRules:enabledRuleIds(),
      skus:[{name:p.code+'-CN',region:'中国',language:'简体中文',materials:p.count},{name:p.code+'-EU',region:'欧洲',language:'EN / DE',materials:p.count+3},{name:p.code+'-UA',region:'乌克兰',language:'UK',materials:p.count}],
      documents:Array.from({length:p.count},(_,n)=>({id:`${p.id}-doc-${n}`,name:`${p.code}-${i===0?'国内版-':''}${names[n]}`,code:codes[n],text:sample.text,example:true,status:n>3?'reviewed':'pending',filename:`${p.code}-${names[n]}.txt`,createdAt})),
    };
  });
  return {version:1,projects,history:[],selectedProject:'r501p',settings:{reducedMotion:false,skin:'apple'},createdAt};
}

const record = value => value && typeof value === 'object' && !Array.isArray(value);
const string = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const count = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const color = value => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value || '') ? value : '#b7ead4';
const timestamp = (value, fallback) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fallback;
function calendarTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

export function loadWorkspace(storage=localStorage) {
  try {
    const value=JSON.parse(storage.getItem(STORAGE_KEY));
    if(value?.version!==1 || !Array.isArray(value.projects)||!value.projects.length) return createWorkspace();
    const createdAt=timestamp(value.createdAt,new Date().toISOString()),projectIds=new Set();
    const projects=value.projects.flatMap(p=>{
      if(!record(p)||typeof p.id!=='string'||!p.id||projectIds.has(p.id)||typeof p.name!=='string'||!Array.isArray(p.documents))return [];
      projectIds.add(p.id);
      const projectCreatedAt=timestamp(p.createdAt,createdAt),documentIds=new Set();
      const documents=p.documents.flatMap(d=>{
        if(!record(d)||typeof d.id!=='string'||!d.id||documentIds.has(d.id)||typeof d.text!=='string')return [];
        documentIds.add(d.id);
        return [{...d,name:string(d.name,string(d.filename,'未命名文案')),filename:string(d.filename,string(d.name,'文案')+'.txt'),code:string(d.code,'LOCAL'),example:d.example===true,status:d.status==='reviewed'?'reviewed':'pending',lastIssueCount:count(d.lastIssueCount),createdAt:timestamp(d.createdAt,projectCreatedAt)}];
      });
      return [{...p,documents,enabledRules:enabledRuleIds(p.enabledRules),matrixCount:matrixCount(p.matrixCount),code:string(p.code,p.name),region:string(p.region,'待填写'),language:string(p.language,'待填写'),phase:['T0','DVT','PVT','MP'].includes(p.phase)?p.phase:'T0',color:color(p.color),pdmUrl:string(p.pdmUrl),start:string(p.start),due:string(p.due),example:p.example===true,createdAt:projectCreatedAt,
        skus:(Array.isArray(p.skus)?p.skus:[]).filter(record).map(s=>({...s,name:string(s.name),region:string(s.region),language:string(s.language),materials:count(s.materials)})),
        members:(p.example===true&&p.members?.length===3&&p.members[0]?.role==='文案 / 负责人'?sampleMembers():(Array.isArray(p.members)?p.members:[])).filter(record).map(m=>({...m,name:string(m.name),initials:string(m.initials,'?'),role:string(m.role),color:color(m.color)})),
      }];
    });
    if(!projects.length)return createWorkspace();
    const history=(Array.isArray(value.history)?value.history:[]).filter(h=>record(h)&&typeof h.projectId==='string'&&Number.isFinite(h.total)&&h.total>=0&&Number.isFinite(h.clean)&&h.clean>=0&&Number.isFinite(h.elapsed)&&h.elapsed>=0&&typeof h.date==='string'&&Number.isFinite(Date.parse(h.date))).slice(-50).map(h=>({...h,total:count(h.total),clean:Math.min(count(h.total),count(h.clean)),issues:count(h.issues),example:h.example===true}));
    return {...value,projects,history,createdAt,settings:{reducedMotion:value.settings?.reducedMotion===true,skin:normalizeSkin(value.settings?.skin)},selectedProject:projectIds.has(value.selectedProject)?value.selectedProject:projects[0].id};
  } catch {return createWorkspace();}
}
export function saveWorkspace(workspace,storage=localStorage) {
  storage.setItem(STORAGE_KEY,JSON.stringify(workspace));
}
export function escapeHTML(value) {
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function newId(prefix='item') {return `${prefix}-${crypto.randomUUID()}`;}
export function formatDate(date) {
  if(!Number.isFinite(calendarTime(date)))return '待定';
  const [,m,d]=date.split('-');return `${Number(m)}.${Number(d)}`;
}
export function timelinePosition(start,end,rangeStart,days=24) {
  if(!Number.isFinite(days)||days<=0)return null;
  const base=calendarTime(rangeStart);
  const toDay=value=>(calendarTime(value)-base)/86400000;
  const first=toDay(start),last=toDay(end);
  if(!Number.isFinite(first)||!Number.isFinite(last)||last<first||last<0||first>=days)return null;
  const from=Math.max(0,Math.min(days,first));
  const to=Math.max(from,Math.min(days,last));
  const position=from/days*100;
  return {start:position,length:Math.min(100-position,Math.max(2,(to-from)/days*100))};
}
