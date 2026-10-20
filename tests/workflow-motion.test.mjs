import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkflowVisual} from '../dist/modules/workflow-visual.js';

function fixture(){
  let raf=0;
  globalThis.requestAnimationFrame=()=>++raf;globalThis.cancelAnimationFrame=()=>{};globalThis.devicePixelRatio=1;
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  const element=()=>({style:{},textContent:'',offsetWidth:10,children:[],classList:{toggle(){},add(){},remove(){}},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},getBoundingClientRect(){return {left:0,top:0,width:10,height:10};}});
  globalThis.document={hidden:false,addEventListener(){},removeEventListener(){},createElement:element};
  const nodes=Array.from({length:64},element),tracks=Array.from({length:4},element),fills=Array.from({length:4},element),counts=Array.from({length:4},element);
  const ctx={setTransform(){},clearRect(){},fillRect(){}};
  const single={'canvas':{getContext:()=>ctx},'.source-panel':element(),'.source-state':element(),'.source-name':element(),'.source-feed':element()};
  const root={...element(),querySelector:s=>single[s],querySelectorAll:s=>({'.agent-cell':nodes,'.bar-track':tracks,'.bar-fill':fills,'.rule-count':counts}[s])};
  return {visual:new WorkflowVisual(root),single};
}
test('groups use visibly unequal rates and variable bursts',()=>{
  const {visual:v}=fixture();v.setState({running:true,status:'running'});
  let maxParticles=0;for(let t=0;t<=10000;t+=16){v.frame(t);maxParticles=Math.max(maxParticles,v.particles.length);}
  assert.ok(v.serial[3]>v.serial[0]*3);assert.ok(v.serial[1]>v.serial[2]);assert.ok(maxParticles>15);
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
  assert.equal(single['.source-feed'].children.length,9);assert.equal(single['.source-feed'].children[0].children[1].textContent,'<img src=x onerror=alert(1)>');v.destroy();
});
