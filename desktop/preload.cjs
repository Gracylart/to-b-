'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Only specific, validated messages cross the isolated renderer boundary.
contextBridge.exposeInMainWorld('reviewDesktop', Object.freeze({
  isDesktop: true,
  files(action,payload={}) {
    if(!['snapshot','catalog','scan','choose-root','toggle-root','open','reveal','assign','borrow','model-start'].includes(action))return Promise.reject(new Error('Unsupported file action'));
    return ipcRenderer.invoke('review:files',action,payload);
  },
  layout(value){return ipcRenderer.invoke('review:layout',value);},
  onLayout(callback){const listener=(_event,value)=>callback(value);ipcRenderer.on('review:layout',listener);return()=>ipcRenderer.removeListener('review:layout',listener);},
  onFilesChanged(callback){const listener=(_event,value)=>callback(value);ipcRenderer.on('review:files-changed',listener);return()=>ipcRenderer.removeListener('review:files-changed',listener);},
  copyCode(code){return ipcRenderer.invoke('review:copy-code',code);},
  pdf(action,payload={}) {
    if(!['list','sample','import','report','revise','open','folder'].includes(action))return Promise.reject(new Error('Unsupported PDF action'));
    return ipcRenderer.invoke('review:pdf',action,payload);
  },
  updateStatus(payload) {
    if (!payload || !['idle', 'running', 'paused', 'complete'].includes(payload.state)) return;
    if (!Number.isFinite(payload.progress) || !Number.isFinite(payload.issues)) return;
    ipcRenderer.send('review:status', {
      state: payload.state,
      progress: payload.progress,
      issues: payload.issues
    });
  },
  setPinned(pinned) {
    if (typeof pinned !== 'boolean') return Promise.reject(new TypeError('pinned must be a boolean'));
    return ipcRenderer.invoke('review:preferences:set', { pinned });
  },
  getPreferences() {
    return ipcRenderer.invoke('review:preferences:get');
  },
  setPreferences(preferences) {
    const values = {};
    if (typeof preferences?.pinned === 'boolean') values.pinned = preferences.pinned;
    if (typeof preferences?.launchAtLogin === 'boolean') values.launchAtLogin = preferences.launchAtLogin;
    return ipcRenderer.invoke('review:preferences:set', values);
  },
  onNavigate(callback) {
    if (typeof callback !== 'function') throw new TypeError('A navigation callback is required');
    const listener = (_event, destination) => {
      if (['home', 'project', 'review', 'settings'].includes(destination)) callback(destination);
    };
    ipcRenderer.on('review:navigate', listener);
    return () => ipcRenderer.removeListener('review:navigate', listener);
  },
  hide() {
    ipcRenderer.send('review:hide');
  }
}));

// A native file sheet temporarily blurs its parent. Observe file inputs inside
// the isolated preload, without exposing arbitrary dialog or IPC access.
let waitingForPicker = false;
let pickerTimer;
function pickerFinished() {
  if (!waitingForPicker) return;
  waitingForPicker = false;
  clearTimeout(pickerTimer);
  ipcRenderer.send('review:file-picker', false);
}

window.addEventListener('DOMContentLoaded', () => {
  const reportEditing=()=>ipcRenderer.send('review:edge-busy',Boolean(document.hasFocus()&&document.activeElement?.matches('input:not([type=checkbox]):not([type=file]),textarea,select,[contenteditable=true]')));
  document.addEventListener('focusin',reportEditing);
  document.addEventListener('focusout',()=>setTimeout(reportEditing,0));
  window.addEventListener('blur',()=>ipcRenderer.send('review:edge-busy',false));
  window.addEventListener('focus',reportEditing);
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const input = target.matches('input[type="file"]')
      ? target
      : target.closest('label')?.control;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || input.disabled) return;
    waitingForPicker = true;
    ipcRenderer.send('review:file-picker', true);
    clearTimeout(pickerTimer);
    pickerTimer = setTimeout(pickerFinished, 120000);
  }, true);
  document.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'file') pickerFinished();
  }, true);
  document.addEventListener('cancel', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'file') pickerFinished();
  }, true);
  window.addEventListener('focus', () => {
    if (waitingForPicker) setTimeout(pickerFinished, 300);
  });
});
