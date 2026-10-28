import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {pathToFileURL} from 'node:url';
const {compactBounds,handleBounds,contains,HoverIntent,createEdgeDock}=createRequire(import.meta.url)('../desktop/edge-dock.cjs');

test('compact rail and file panel keep the same edge on negative-coordinate displays',()=>{
 const area={x:-1920,y:24,width:1920,height:1056};
 for(const edge of ['left','right'])for(const peek of [false,true]){
  const b=compactBounds(area,{mode:'sidebar',edge,peek},{height:800});
  assert.equal(b.width,peek?440:64);assert.equal(edge==='left'?b.x:b.x+b.width,edge==='left'?-1920:0);
  const h=handleBounds(area,{mode:'sidebar',edge});assert.equal(h.width,10);assert.ok(contains(h,{x:h.x+5,y:h.y+40}));assert.ok(contains(b,{x:h.x+5,y:h.y+40}),'rail covers its handle so hover can stay revealed');
 }
 const horizontal=compactBounds(area,{mode:'horizontal',peek:true},{height:800});
 assert.equal(horizontal.y+horizontal.height,1080);assert.equal(horizontal.width,620);
 const grip=handleBounds(area,{mode:'horizontal'});assert.equal(grip.height,10);assert.equal(grip.y+10,1080);
});
test('hover intent requires dwell, delays retract, and cancels it on reentry or native interaction',()=>{
 const h=new HoverIntent();const step=(now,extra={})=>h.step({now,inHandle:false,inPanel:false,held:false,...extra});
 assert.equal(step(0,{inHandle:true}),null);assert.equal(step(70,{inHandle:true}),null);
 step(75);assert.equal(step(100,{inHandle:true}),null);assert.equal(step(181,{inHandle:true}),'show');
 step(700);step(900,{inPanel:true});assert.equal(step(1100),null);assert.equal(step(1400),null);
 step(1410,{held:true});assert.equal(step(1800),null);assert.equal(step(2121),'hide');
 assert.equal(h.visible,false);h.show(3000);assert.equal(step(3100),null);assert.equal(step(3460),null);assert.equal(step(3781),'hide');
});
test('edge grip cannot invoke reveal from a sibling page, child frame, or unrelated sender',()=>{
 const windows=[];let reveals=0,held=false,layout={mode:'sidebar',autoHide:true,edge:'right'};
 class Win extends EventEmitter{
  constructor(options){super();this.options=options;this.bounds=options;this.webContents=new EventEmitter();this.webContents.mainFrame={url:''};this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
  isDestroyed(){return false;}setMenu(){}setBounds(b){this.bounds=b;}getBounds(){return this.bounds;}showInactive(){this.visible=true;}hide(){this.visible=false;}destroy(){this.destroyed=true;}
  loadFile(file){this.webContents.mainFrame.url=pathToFileURL(file).href;return Promise.resolve();}
 }
 const ipc=new EventEmitter();const dock=createEdgeDock({BrowserWindow:Win,screen:{getCursorScreenPoint:()=>({x:0,y:0})},ipcMain:ipc,getPanel:()=>null,getLayout:()=>layout,getArea:()=>({x:0,y:24,width:1600,height:1000}),held:()=>held,reveal:()=>reveals++,retract:()=>{}});
 dock.sync();const w=windows[0],event={sender:w.webContents,senderFrame:w.webContents.mainFrame};
 for(const bad of [{...event,sender:{}},{...event,senderFrame:{url:event.senderFrame.url}},{...event,senderFrame:null}])ipc.emit('review:edge-reveal',bad);
 assert.equal(reveals,0);ipc.emit('review:edge-reveal',event);assert.equal(reveals,1);assert.equal(w.visible,false);
 held=true;assert.equal(dock.hide(),false);held=false;assert.equal(dock.hide(),true);assert.equal(w.visible,true);
 layout={...layout,mode:'workspace'};dock.sync();assert.equal(w.visible,false);dock.close();assert.equal(w.destroyed,true);assert.equal(ipc.listenerCount('review:edge-reveal'),0);
});
