import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspace,loadWorkspace,saveWorkspace} from '../dist/modules/workspace.js';
const memory=()=>{let data;return{getItem:()=>data,setItem:(_key,value)=>{data=value;}};};
test('BOM, multi-person roles and per-project review configuration survive reload',()=>{
  const storage=memory(),ws=createWorkspace(),p=ws.projects[0];
  p.documents.push({id:'new',name:'包装',code:'BOM-123',text:'',status:'pending'});
  p.members=[{name:'甲',role:'结构',initials:'甲',color:'#7ebeff'},{name:'乙',role:'结构',initials:'乙',color:'#7ebeff'}];p.enabledRules=['unit-spacing'];p.matrixCount=9;
  saveWorkspace(ws,storage);const restored=loadWorkspace(storage).projects[0];
  assert.equal(restored.documents.at(-1).code,'BOM-123');assert.equal(restored.documents.at(-1).text,'');assert.equal(restored.members.length,2);assert.deepEqual(restored.enabledRules,['unit-spacing']);assert.equal(restored.matrixCount,4);
});
test('legacy sample team migrates but an edited team remains intact',()=>{
  const ws=createWorkspace(),storage=memory();
  ws.projects[0].members=[{name:'Gracy',role:'文案 / 负责人'},{name:'产品',role:'参数核验'},{name:'区域',role:'多语言校对'}];delete ws.projects[0].enabledRules;
  ws.projects[1].members=[{name:'自定义',role:'结构'},{name:'A',role:'项目'},{name:'B',role:'ID'}];saveWorkspace(ws,storage);
  const restored=loadWorkspace(storage);assert.equal(restored.projects[0].members.length,12);assert.equal(restored.projects[0].enabledRules.length,8);assert.equal(restored.projects[1].members[0].name,'自定义');
});

test('skin persists with project data, while legacy or unknown skins fall back to Apple',()=>{
  const storage=memory(),ws=createWorkspace();
  for(const skin of ['apple','blue','claude']){
    ws.settings={skin,reducedMotion:true};saveWorkspace(ws,storage);
    const restored=loadWorkspace(storage);
    assert.equal(restored.settings.skin,skin);
    assert.equal(restored.settings.reducedMotion,true);
    assert.equal(restored.projects[0].documents[0].code,ws.projects[0].documents[0].code);
  }
  for(const skin of [undefined,'external.css','__proto__',null]){
    ws.settings={skin};saveWorkspace(ws,storage);
    assert.equal(loadWorkspace(storage).settings.skin,'apple');
  }
});
