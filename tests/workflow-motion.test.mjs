import test from 'node:test';
import assert from 'node:assert/strict';
import {ruleGroups,matrixGroups,fileCadence} from '../dist/modules/review-model.js';
import {WorkflowVisual} from '../dist/modules/workflow-visual.js';

function fixture(groups=matrixGroups()){
  let raf=0;
  globalThis.requestAnimationFrame=()=>++raf;globalThis.cancelAnimationFrame=()=>{};globalThis.devicePixelRatio=1;
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  const element=()=>({style:{},textContent:'',offsetWidth:10,children:[],classList:{toggle(){},add(){},remove(){}},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},getBoundingClientRect(){return {left:0,top:0,width:10,height:10};}});
  globalThis.document={hidden:false,addEventListener(){},removeEventListener(){},createElement:element};
  const nodes=groups.flatMap(g=>Array.from({length:g.rows},(_,row)=>Array.from({length:g.cols},(_,col)=>({...element(),dataset:{group:String(g.index),row:String(row),col:String(col)}}))).flat()),tracks=Array.from({length:4},element),fills=Array.from({length:4},element),counts=Array.from({length:4},element);
  const ctx={setTransform(){},clearRect(){},fillRect(){}};
  const single={'canvas':{getContext:()=>ctx},'.source-panel':element(),'.source-viewport':element(),'.source-state':element(),'.source-name':element(),'.source-feed':element()};
  const root={...element(),querySelector:s=>single[s],querySelectorAll:s=>({'.agent-cell':nodes,'.bar-track':tracks,'.bar-fill':fills,'.rule-count':counts}[s])};
  return {visual:new WorkflowVisual(root,{groups}),single};
}
test('groups use visibly unequal rates and variable bursts',()=>{
  const {visual:v}=fixture();v.setState({running:true,status:'running'});
  let maxParticles=0;for(let t=0;t<=10000;t+=16){v.frame(t);maxParticles=Math.max(maxParticles,v.particles.length);}
  assert.ok(v.serial[3]>v.serial[0]*2);assert.ok(v.serial[1]>v.serial[2]);assert.ok(maxParticles>15);
  assert.equal(new Set(v.serial).size,4);v.destroy();
});
test('pause freezes every flight and resume does not jump over paused wall time',()=>{
  const {visual:v}=fixture();v.setState({running:true,status:'running'});for(let t=0;t<700;t+=16)v.frame(t);
  const before=v.clock,positions=JSON.stringify(v.particles);v.setState({running:false,status:'paused'});v.frame(50000);
  assert.equal(v.clock,before);assert.equal(JSON.stringify(v.particles),positions);
  v.setState({running:true,status:'running'});v.frame(51000);assert.equal(v.clock,before);v.frame(51016);assert.equal(v.clock,before+16);v.destroy();
});
test('actual counts advance on landing and finish at exact checked totals',()=>{
  const {visual:v}=fixture();v.setState({running:true,status:'running'});v.setChecks([1,2,2,3],[1,2,2,3]);
  assert.deepEqual(v.values,[0,0,0,0]);v.frame(0);v.frame(16);assert.deepEqual(v.values,[0,0,0,0]);
  v.setState({running:false,status:'complete',progress:1});for(let t=32;t<1500;t+=16)v.frame(t);
  assert.deepEqual(v.values,[1,2,2,3]);assert.deepEqual(v.landings,[]);v.destroy();
});
test('reduced motion settles queued checks without particles or request loops',()=>{
  const {visual:v}=fixture();v.setState({running:true,status:'running'});v.setChecks([1,2,2,3],[1,2,2,3]);v.frame(0);
  v.setState({running:true,status:'running',reducedMotion:true});assert.deepEqual(v.values,[1,2,2,3]);assert.equal(v.particles.length,0);assert.equal(v.loops.length,0);v.destroy();
});
test('input preview treats markup as text and bounds the number of rendered rows',()=>{
  const {visual:v,single}=fixture();v.setSource({id:'test',name:'copy',text:'<img src=x onerror=alert(1)>\nhello'},'running');
  assert.equal(single['.source-feed'].children.length,7);assert.equal(single['.source-feed'].children[0].children[1].textContent,'<img src=x onerror=alert(1)>');v.destroy();
});

test('disabled rules change matrix density and remove whole groups; disabled groups never emit',()=>{
  const groups=matrixGroups(['project-name','unit-spacing'],2),{visual:v}=fixture(groups);
  assert.deepEqual(groups.map(g=>g.ids.length),[1,1]);assert.equal(v.nodes.length,32);
  v.setState({running:true,status:'running'});for(let t=0;t<3000;t+=16)v.frame(t);
  assert.equal(v.serial.length,2);assert.ok(v.serial.every(n=>n>0));assert.ok(v.particles.every(p=>[0,2].includes(p.g)));v.destroy();
});
test('file content changes per-rule cadence and source text fragments at the top',()=>{
  const groups=ruleGroups(),plain={id:'a',name:'a',text:'简单的介绍文案'},numeric={id:'b',name:'b',text:'65W 3000mAh 100V 50Hz 21kg 45mm TODO'};
  assert.notDeepEqual(fileCadence(plain,groups[2]),fileCadence(numeric,groups[2]));
  assert.ok(fileCadence(numeric,groups[2]).burst>fileCadence(plain,groups[2]).burst);
  const {visual:v}=fixture();v.setSource(numeric);v.setState({running:true,status:'running'});v.paintSource(1);
  const pieces=v.particles.filter(p=>p.dissolve);assert.ok(pieces.length>=8);assert.ok(pieces.every(p=>p.incoming));
  const old=v.profiles;v.setSource(plain);assert.notDeepEqual(v.profiles,old);v.destroy();
});

test('matrix density remains full and never exceeds five by five',()=>{const groups=ruleGroups();assert.deepEqual(groups.map(g=>[g.rows,g.cols]),[[4,4],[4,5],[4,5],[5,5]]);for(const group of groups){assert.ok(group.rows<=5&&group.cols<=5);assert.ok(group.rows*group.cols>=16);} });

test('one through eight matrices share enabled rules without exceeding 5x5',()=>{for(let count=1;count<=8;count++){const groups=matrixGroups(undefined,count);assert.equal(groups.length,count);assert.ok(groups.every(g=>g.rows<=5&&g.cols<=5));assert.deepEqual([...new Set(groups.flatMap(g=>g.ids))].sort(),ruleGroups().flatMap(g=>g.ids).sort());const {visual:v}=fixture(groups);v.setState({running:true,status:'running'});for(let t=0;t<1600;t+=16)v.frame(t);assert.ok(v.serial.every(n=>n>0));v.destroy();}});

test('each bar and its landing destination use its own completion total',()=>{
  const {visual:v}=fixture();v.setChecks([0,0,0,0],[7,14,14,21]);v.setState({running:true,status:'running'});
  v.setChecks([7,14,7,21],[7,14,14,21]);
  const checkpoints=v.particles.filter(p=>p.checkpoint);
  assert.deepEqual(checkpoints.map(p=>p.to.x),[10,10,5,10]);
  v.setState({running:false,status:'complete',progress:1});for(let t=0;t<1500;t+=16)v.frame(t);
  assert.deepEqual(v.fills.map(fill=>fill.style.width),['100%','100%','50%','100%']);
  v.setChecks([7,14,14,21],[7,14,14,21]);assert.ok(v.fills.every(fill=>fill.style.width==='100%'));v.destroy();
});
