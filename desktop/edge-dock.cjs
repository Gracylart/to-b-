'use strict';
const path = require('node:path');
const { isTrustedDocument } = require('./policy.cjs');

function compactBounds(area, layout, size) {
  const horizontal = layout.mode === 'horizontal';
  const width = Math.min(horizontal ? 620 : layout.peek ? 440 : 64, area.width);
  const height = Math.min(horizontal ? layout.peek ? 480 : 64 : Math.max(720,size.height), area.height - 16);
  const handleCenter=area.y+(area.height-88)*.66+44;
  const sideY=Math.round(Math.max(area.y+8,Math.min(area.y+area.height-height-8,handleCenter-height*.66)));
  return { x: horizontal ? Math.round(area.x + (area.width - width) / 2) : layout.edge === 'left' ? area.x : area.x + area.width - width,
    y: horizontal ? area.y + area.height - height : sideY, width, height };
}
function handleBounds(area, layout) {
  return layout.mode === 'horizontal'
    ? { x: Math.round(area.x + (area.width - 88) / 2), y: area.y + area.height - 10, width: 88, height: 10 }
    : { x: layout.edge === 'left' ? area.x : area.x + area.width - 10,
      y: Math.round(area.y + (area.height - 88) * .66), width: 10, height: 88 };
}
function contains(rect, point, slack = 0) {
  return !!rect && point.x >= rect.x - slack && point.x < rect.x + rect.width + slack && point.y >= rect.y - slack && point.y < rect.y + rect.height + slack;
}
// Cursor intent is independent of window focus: opening a document must not keep
// a floating rail stuck over the document, and hovering must not steal focus.
class HoverIntent {
  constructor() { this.visible = false; this.entered = null; this.left = null; this.grace = 0; }
  show(now) { this.visible = true; this.entered = this.left = null; this.grace = now + 450; }
  hide() { this.visible = false; this.entered = this.left = null; }
  step({ now, inHandle, inPanel, held }) {
    if (this.visible) {
      if (inPanel || held || now < this.grace) this.left = null;
      else if (this.left === null) this.left = now;
      else if (now - this.left >= 320) { this.hide(); return 'hide'; }
    } else if (inHandle) {
      if (this.entered === null) this.entered = now;
      else if (now - this.entered >= 80) { this.show(now); return 'show'; }
    } else this.entered = null;
    return null;
  }
}
function createEdgeDock({ BrowserWindow, screen, ipcMain, getPanel, getLayout, getArea, held, reveal, retract }) {
  const intent = new HoverIntent();
  const file = path.join(__dirname, '..', 'dist', 'edge-handle.html');
  let grip, timer, hoverTimer, enabled = false, stopped = false;
  const diagnostics=process.env.REVIEW_DESK_DIAGNOSTICS==='1';let lastDiagnostic=0;
  const trace=value=>{if(diagnostics)console.error('Edge diagnostics:',JSON.stringify(value));};
  function ensureGrip() {
    if (grip && !grip.isDestroyed()) return;
    const layout = getLayout();
    grip = new BrowserWindow({ ...handleBounds(getArea(), layout), minWidth: 10, minHeight: 10,
      frame: false, transparent: true, hasShadow: false, resizable: false, focusable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false, roundedCorners: false,
      webPreferences: { preload: path.join(__dirname, 'edge-preload.cjs'), sandbox: true, contextIsolation: true,
        nodeIntegration: false, webSecurity: true, devTools: false, backgroundThrottling: false } });
    grip.setMenu(null);
    grip.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: false });
    grip.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    for (const event of ['will-navigate', 'will-redirect', 'will-attach-webview']) grip.webContents.on(event, e => e.preventDefault());
    grip.webContents.on('did-finish-load', () => { if (enabled && !intent.visible) grip.showInactive(); });
    grip.loadFile(file).catch(error => console.warn('Edge handle:', error.message));
  }
  function sync() {
    const layout = getLayout();
    enabled = layout.mode !== 'workspace' && layout.autoHide;
    if (!enabled) { intent.hide(); grip?.hide(); return; }
    ensureGrip();
    const bounds = handleBounds(getArea(), layout);
    grip.setBounds(bounds, false);
    // Orientation is conveyed by window aspect ratio; no privileged state is exposed.
    if (!intent.visible) grip.showInactive(); else grip.hide();
    trace({state:'geometry',bounds,area:getArea(),layout});
  }
  function show(focus = false) {
    if (!enabled) return false;
    intent.show(Date.now()); grip?.hide(); reveal(focus); return true;
  }
  function hide() {
    if (!enabled || held()) return false;
    intent.hide(); retract(); sync(); return true;
  }
  function tick() {
    if (stopped) return;
    if (enabled) {
      const point = screen.getCursorScreenPoint();
      const panel = getPanel();
      if(diagnostics&&Date.now()-lastDiagnostic>2000){lastDiagnostic=Date.now();trace({point,grip:grip?.getBounds(),panel:panel?.getBounds(),visible:panel?.isVisible(),held:held()});}
      // AppKit can show a deminiaturized window after returnToDock already hid it.
      // Reconcile native visibility so that this late show cannot leave a rail stuck.
      if(panel?.isVisible()&&!intent.visible){
        if(contains(panel.getBounds(),point,6)||held()){intent.show(Date.now());grip?.hide();}
        else{retract();sync();}
      }
      const action = intent.step({ now: Date.now(), inHandle: contains(grip?.getBounds(), point, 2),
        inPanel: panel?.isVisible() && contains(panel.getBounds(), point, 6), held: held() });
      if(action)trace({action,point});
      if (action === 'show') { grip?.hide(); reveal(false); }
      if (action === 'hide') { retract(); sync(); }
    }
    timer = setTimeout(tick, enabled && intent.visible ? 40 : 90); timer.unref?.();
  }
  const trusted=event=>grip&&event.sender===grip.webContents&&event.senderFrame===grip.webContents.mainFrame&&isTrustedDocument(event.senderFrame.url,file);
  const click = event => {if(trusted(event))show(true);};
  const hover=(event,inside)=>{
    if(!trusted(event)||typeof inside!=='boolean')return;clearTimeout(hoverTimer);
    if(inside)hoverTimer=setTimeout(()=>{trace({action:'native-hover'});show(false);},80);
  };
  ipcMain.on('review:edge-hover',hover);ipcMain.on('review:edge-reveal', click); tick();
  return { sync, show, hide, touch() {if(intent.visible){intent.left=null;intent.grace=Date.now()+700;}}, close() { stopped = true; clearTimeout(timer);clearTimeout(hoverTimer);ipcMain.removeListener('review:edge-hover',hover); ipcMain.removeListener('review:edge-reveal', click); grip?.destroy(); } };
}
module.exports = { compactBounds, handleBounds, contains, HoverIntent, createEdgeDock };
