import {RULES} from './audit-engine.js';
export const BLUE_PALETTE=['#7ebeff','#67cce3','#9baef7','#a0d8fa'];
export const RULE_GROUPS=[
  {name:'术语一致',short:'术语',ids:['project-name']},
  {name:'格式规范',short:'格式',ids:['extra-spaces','punctuation']},
  {name:'参数校验',short:'参数',ids:['placeholders','unit-spacing']},
  {name:'文字检查',short:'文字',ids:['repeated-words','absolute-claims','empty-document']},
];
export function enabledRuleIds(value){return Array.isArray(value)?[...new Set(value)].filter(id=>RULES.some(r=>r.id===id)):RULES.map(r=>r.id);}
export function ruleGroups(ids){
  const enabled=enabledRuleIds(ids);
  return RULE_GROUPS.map((g,index)=>{const active=g.ids.filter(id=>enabled.includes(id)),count=active.length;
    return {...g,index,color:BLUE_PALETTE[index],ids:active,cols:count>1?5:4,rows:count?Math.min(5,3+Math.ceil(count/2)):0};
  });
}
export function matrixCount(value){return Number.isInteger(value)?Math.min(8,Math.max(1,value)):4;}
export function matrixGroups(ids,count=4){
  const categories=ruleGroups(ids).filter(g=>g.ids.length),rules=categories.flatMap(g=>g.ids);if(!rules.length)return [];
  const total=matrixCount(count),buckets=Array.from({length:total},()=>[]);
  // Keep category blocks together where possible, then distribute additional lanes.
  if(total>=categories.length){categories.forEach((g,i)=>buckets[i].push(...g.ids));for(let i=categories.length;i<total;i++)buckets[i].push(...categories[(i-categories.length)%categories.length].ids);}
  else categories.forEach((g,i)=>buckets[i%total].push(...g.ids));
  return buckets.map((ids,index)=>{const category=RULE_GROUPS.findIndex(g=>g.ids.includes(ids[0])),kinds=RULE_GROUPS.filter(g=>g.ids.some(id=>ids.includes(id)));
    return {ids,index,category,color:BLUE_PALETTE[category],short:kinds.length>1?'综合':RULE_GROUPS[category].short,cols:ids.length>1?5:4,rows:Math.min(5,3+Math.ceil(ids.length/2))};
  });
}
// Workload drives visual cadence only; all enabled checks still run exactly once.
export function fileCadence(doc,group){
  const text=String(doc?.text||''),length=Math.max(1,text.length);
  const features=[(text.match(/[A-Z][A-Z\d-]{1,}/g)||[]).length,(text.match(/[，。！？,.;:()（）\n]/g)||[]).length,(text.match(/\d+(?:\.\d+)?|TODO|TBD|\{\{/g)||[]).length,(text.match(/[\u4e00-\u9fff]|\b[A-Za-z]+\b/g)||[]).length/12];
  const seed=[...(doc?.filename||doc?.name||'')].reduce((n,c)=>(n*31+c.codePointAt(0))%997,0);
  const density=Math.min(4,.25+features[group.category??group.index]/Math.sqrt(length)*2.5);
  const category=group.category??group.index,base=[920,390,670,225][category];
  return {gap:Math.max(150,base/(.65+density*.28)*(0.8+((seed+group.index*19)%31)/50)),burst:Math.min(4,Math.max(1,Math.ceil(density*.7+group.ids.length*.35))),duration:Math.max(450,1080-density*105),seed};
}
export const TEAM_ROLES=['项目','结构','ID','区域','策划','包装','文案','产品'];
export function sampleMembers(){return TEAM_ROLES.flatMap((role,i)=>Array.from({length:role==='区域'?3:role==='结构'||role==='包装'?2:1},(_,n)=>({name:role==='文案'?'Gracy':`${role}${n+1}`,initials:role==='文案'?'G':role.slice(0,1),role,color:BLUE_PALETTE[i%4]})));}
