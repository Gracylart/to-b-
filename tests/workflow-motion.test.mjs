import test from 'node:test';
import assert from 'node:assert/strict';
import {ruleGroups,matrixGroups,fileCadence} from '../dist/modules/review-model.js';
import {WorkflowVisual} from '../dist/modules/workflow-visual.js';

function fixture(groups=matrixGroups()){
  let raf=0;
  globalThis.requestAnimationFrame=()=>++raf;globalThis.cancelAnimationFrame=()=>{};globalThis.devicePixelRatio=1;
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  const rect=(top=0,height=10,width=10)=>({left:0,top,width,height,bottom:top+height,right:width});
  const element=()=>({style:{},textContent:'',offsetWidth:10,children:[],classList:{toggle(){},add(){},remove(){}},
    append(...items){for(const item of items){item.parentNode=this;this.children.push(item);}},
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(item=>item!==this);},
    setAttribute(name,value){this[name]=value;},replaceChildren(){this.children=[];},
    getBoundingClientRect(){
      if(this.kind==='viewport')return rect(50,96,210);
      if(this.kind==='feed'){const height=this.children.length*24,offset=Number(this.style.transform?.match(/translate3d\(0,([\d.-]+)px/)?.[1]||0);return rect(146-height+offset,height,210);}
      if(this.parentNode?.kind==='feed')return rect(this.parentNode.getBoundingClientRect().top+this.parentNode.children.indexOf(this)*24,24,210);
      return rect();
    }});
  globalThis.document={hidden:false,addEventListener(){},removeEventListener(){},createElement:element};
  const nodes=groups.flatMap(g=>Array.from({length:g.rows},(_,row)=>Array.from({length:g.cols},(_,col)=>({...element(),dataset:{group:String(g.index),row:String(row),col:String(col)}}))).flat()),tracks=Array.from({length:4},element),fills=Array.from({length:4},element),counts=Array.from({length:4},element);
  const ctx={setTransform(){},clearRect(){},fillRect(){}};
  const single={'canvas':{getContext:()=>ctx},'.source-panel':element(),'.source-viewport':element(),'.source-state':element(),'.source-name':element(),'.source-feed':element()};
  single['.source-feed'].kind='feed';single['.source-viewport'].kind='viewport';
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
test('code stream never exposes document content and bounds rendered rows',()=>{
  const {visual:v,single}=fixture();v.setSource({id:'test',name:'copy',text:'<img src=x onerror=alert(1)>\nhello'},'running');
  assert.equal(single['.source-feed'].children.length,0);v.setState({running:true,status:'running'});v.setLogs([{time:'00:01',level:'scan',text:'check("file", "units")'}]);assert.equal(single['.source-feed'].children.length,1);v.paintSource(40);assert.equal(single['.source-feed'].children.length,1);v.destroy();
});

test('disabled categories retain equal grids but never emit',()=>{
  const groups=matrixGroups(['project-name','unit-spacing'],2),{visual:v}=fixture(groups);
  assert.deepEqual(groups.map(g=>g.ids.length),[1,0,1,0]);assert.equal(v.nodes.length,100);
  v.setState({running:true,status:'running'});for(let t=0;t<3000;t+=16)v.frame(t);
  assert.equal(v.serial.length,4);assert.ok(v.serial[0]>0&&v.serial[2]>0);assert.equal(v.serial[1],0);assert.equal(v.serial[3],0);assert.ok(v.particles.every(p=>[0,2].includes(p.g)));v.destroy();
});
test('file content changes per-rule cadence and source text fragments at the top',()=>{
  const groups=ruleGroups(),plain={id:'a',name:'a',text:'简单的介绍文案'},numeric={id:'b',name:'b',text:'65W 3000mAh 100V 50Hz 21kg 45mm TODO'};
  assert.notDeepEqual(fileCadence(plain,groups[2]),fileCadence(numeric,groups[2]));
  assert.ok(fileCadence(numeric,groups[2]).burst>fileCadence(plain,groups[2]).burst);
  const {visual:v}=fixture();v.setSource(numeric);v.setState({running:true,status:'running'});
  const logs=[];for(let i=0;i<9;i++){
    logs.push({id:i,time:'00:01',level:'scan',text:'check '+i});v.setLogs(logs);
    for(let t=i*350;t<(i+1)*350;t+=16)v.frame(t);
  }
  const pieces=v.particles.filter(p=>p.dissolve);assert.ok(pieces.length>=8);assert.ok(pieces.every(p=>p.incoming));
  const old=v.profiles;v.setSource(plain);assert.notDeepEqual(v.profiles,old);v.destroy();
});

test('matrix density remains full and never exceeds five by five',()=>{const groups=ruleGroups();assert.deepEqual(groups.map(g=>[g.rows,g.cols]),[[4,4],[4,5],[4,5],[5,5]]);for(const group of groups){assert.ok(group.rows<=5&&group.cols<=5);assert.ok(group.rows*group.cols>=16);} });

test('legacy matrix preferences normalize to four equal 5x5 groups',()=>{for(let count=1;count<=9;count++){const groups=matrixGroups(undefined,count);assert.equal(groups.length,4);assert.ok(groups.every(g=>g.rows===5&&g.cols===5));assert.deepEqual([...new Set(groups.flatMap(g=>g.ids))].sort(),ruleGroups().flatMap(g=>g.ids).sort());const {visual:v}=fixture(groups);v.setState({running:true,status:'running'});for(let t=0;t<1600;t+=16)v.frame(t);assert.ok(v.serial.every(n=>n>0));v.destroy();}});

test('each bar and its landing destination use its own completion total',()=>{
  const {visual:v}=fixture();v.setChecks([0,0,0,0],[7,14,14,21]);v.setState({running:true,status:'running'});
  v.setChecks([7,14,7,21],[7,14,14,21]);
  const checkpoints=v.particles.filter(p=>p.checkpoint);
  assert.deepEqual(checkpoints.map(p=>p.to.x),[10,10,5,10]);
  v.setState({running:false,status:'complete',progress:1});for(let t=0;t<1500;t+=16)v.frame(t);
  assert.deepEqual(v.fills.map(fill=>fill.style.width),['100%','100%','50%','100%']);
  v.setChecks([7,14,14,21],[7,14,14,21]);assert.ok(v.fills.every(fill=>fill.style.width==='100%'));v.destroy();
});

test('raw logs cannot replace the scrolling code with document text',()=>{const {visual:v,single}=fixture();v.setSource({id:'x',text:'private source text'});v.setLogs([{time:'00:00',level:'info',text:'<script>private log</script>'}]);const rows=single['.source-feed'].children;assert.equal(rows.length,0);assert.ok(rows.every(r=>!r.children[0].textContent.includes('private')));v.destroy();});


test('stream retains old DOM nodes and coalesces fast scan events without restarting their entry',()=>{
  const {visual:v,single}=fixture();v.setState({running:true,status:'running'});
  const event=i=>({id:i,time:'00:01',level:'scan',rule:'unit-spacing',text:`check file ${i}`,findings:i%2});
  v.setLogs([event(0)]);const first=single['.source-feed'].children[0],born=v.streamRows.get('0').born;
  v.setLogs([event(0),event(1)]);v.setLogs([event(0),event(1),event(2)]);
  assert.equal(single['.source-feed'].children.length,1);
  for(let t=0;t<260;t+=16)v.frame(t);
  assert.equal(single['.source-feed'].children.length,3);assert.equal(single['.source-feed'].children[0],first);
  assert.equal(v.streamRows.get('0').born,born);assert.equal(first.children[0].textContent,'check("unit-spacing")');
  assert.equal(first.children[1].textContent,'✓');v.destroy();
});

test('paused stream freezes entry, displacement and pending events; resume keeps its position',()=>{
  const {visual:v,single}=fixture();v.setState({running:true,status:'running'});v.setLogs([{id:0,time:'00:00',level:'scan',text:'check("units")'}]);
  v.frame(0);v.frame(16);const row=single['.source-feed'].children[0],before={offset:v.streamOffset,opacity:row.style.opacity,clock:v.clock};
  v.setState({running:false,status:'paused'});v.frame(10000);
  assert.equal(v.streamOffset,before.offset);assert.equal(row.style.opacity,before.opacity);assert.equal(v.clock,before.clock);
  v.setState({running:true,status:'running'});v.frame(11000);assert.equal(v.streamOffset,before.offset);v.frame(11016);assert.ok(v.streamOffset<before.offset);v.destroy();
});

test('reduced motion settles stream and bounds it to twelve genuine event rows',()=>{
  const {visual:v,single}=fixture();v.setState({running:true,status:'running'});
  const logs=Array.from({length:50},(_,i)=>({id:i,time:'00:01',level:'scan',text:'check '+i}));v.setLogs(logs);
  v.setState({running:true,status:'running',reducedMotion:true});
  assert.equal(single['.source-feed'].children.length,12);assert.equal(single['.source-feed'].children[0].children[0].textContent,'check 38');
  assert.equal(v.streamOffset,0);assert.ok(single['.source-feed'].children.every(row=>row.style.filter===''));
  v.setState({running:false,status:'idle',reducedMotion:true});assert.equal(single['.source-feed'].children.length,0);v.destroy();
});

test('no outgoing text particles are fabricated while all rows still fit in the viewport',()=>{
  const {visual:v}=fixture();v.setState({running:true,status:'running'});
  for(let i=0;i<3;i++){v.setLogs(Array.from({length:i+1},(_,id)=>({id,time:'00:01',level:'scan',text:'check '+id})));for(let t=i*500;t<(i+1)*500;t+=16)v.frame(t);}
  assert.equal(v.particles.filter(p=>p.dissolve).length,0);v.destroy();
});
