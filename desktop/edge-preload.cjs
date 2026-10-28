'use strict';
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('edgeHandle', Object.freeze({ reveal() { ipcRenderer.send('review:edge-reveal'); } }));

window.addEventListener('DOMContentLoaded',()=>{
 document.documentElement.addEventListener('pointerenter',()=>ipcRenderer.send('review:edge-hover',true));
 document.documentElement.addEventListener('pointerleave',()=>ipcRenderer.send('review:edge-hover',false));
});
