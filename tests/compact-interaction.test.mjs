import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectFileView} from '../dist/modules/project-file-view.js';

test('all compact navigation and header toggles remain within sidebar panels',async()=>{
 const calls=[],views=[];const view=Object.create(ProjectFileView.prototype);
 Object.assign(view,{mode:'sidebar',getProjects:()=>[{code:'R501P',name:'测试项目'}],getActivity:()=>null,desktop:{layout:async value=>{calls.push(value);return {mode:'sidebar',...value};}},applyLayout(value){this.peekOpen=!!value.peek;},setView(value){views.push(value);},setMode:async function(value){calls.push({mode:value});this.mode=value;},notify:message=>{throw Error(message);}});
 for(const section of ['home','review','revision'])await view.showSection(section);
 assert.equal(calls.some(call=>call.mode==='workspace'),false);assert.deepEqual(views,[]);assert.equal(view.section,'revision');
 await view.togglePanel();assert.equal(view.peekOpen,false);await view.togglePanel();assert.equal(view.peekOpen,true);
 assert.equal(calls.every(call=>call.mode!=='workspace'),true);assert.deepEqual(views,[]);
});

test('project icons resolve the same normalized project identifier as the file index',()=>{
 const view=Object.create(ProjectFileView.prototype);view.data={files:[{id:'sample',state:'linked',projectCode:'E2STATION',linkedCodes:[],mtime:0}]};
 assert.equal(view.projectFiles('E2 Station').length,1);assert.equal(view.projectFiles('Ｅ２ Ｓｔａｔｉｏｎ').length,1);
});

test('the global pending folder keeps unassigned files visible across live refreshes',async t=>{
 globalThis.document={activeElement:null};t.after(()=>delete globalThis.document);
 const view=Object.create(ProjectFileView.prototype);Object.assign(view,{code:'',category:'pending',search:'',loading:false,peekOpen:false,settings:false,section:'',desktop:{files:async()=>({projects:[{code:'R501P'}],files:[{id:'pending',state:'pending',name:'未命名.pdf',material:'',path:'/source/未命名.pdf',mtime:0}],roots:[]})},refresh(){},notify:message=>{throw Error(message);}});
 await view.load();assert.equal(view.code,'');assert.equal(view.pendingFiles().length,1);
});
