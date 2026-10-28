'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, shell, session, dialog, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {
  CONTENT_SECURITY_POLICY, sanitizeStatus, sanitizePreferences,
  isTrustedDocument, isAllowedExternalURL, trayStatus, panelBounds, sanitizeWindowSize
} = require('./policy.cjs');

const { compactBounds, createEdgeDock } = require('./edge-dock.cjs');

const APP_NAME = '文案审核台 · Studio';
const INDEX_PATH = path.join(__dirname, '..', 'dist', 'index.html');
const INITIAL_STATUS = { state: 'idle', progress: 0, issues: 0 };
let windowSize = sanitizeWindowSize();
let pdfWorkspace;
let tray;
let panel;
let status = { ...INITIAL_STATUS };
let preferences = { pinned: false, launchAtLogin: false };
let quitting = false;
let readyToShow = false;
let showRequested = false;
let pendingNavigation;
let ignoreBlurUntil = 0;
let nativeSheetDepth = 0;
let pickerActive = false;
let pickerTimer;
let blurTimer;
let projectFiles;
let fileModel;
let fileLibraryLoading;
let nativeLayout = {mode:'sidebar',peek:false,autoHide:true,edge:'right'};
let edgeDock;
let rendererBusy = false;
let lastCompactMode='sidebar';

app.setName(APP_NAME);
app.setAppUserModelId('com.gracylart.copyreviewdesk.studio');
const profilePath = path.join(app.getPath('appData'), APP_NAME);
fs.mkdirSync(profilePath, { recursive: true });
app.setPath('userData', profilePath);

function preferencePath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function loadPreferences() {
  try {
    preferences = sanitizePreferences(JSON.parse(fs.readFileSync(preferencePath(), 'utf8')));
  } catch {
    preferences = { pinned: false, launchAtLogin: false };
  }
  try {
    windowSize = sanitizeWindowSize(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-size.json'), 'utf8')));
  } catch { windowSize = sanitizeWindowSize(); }
  try {
    const saved=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'native-layout.json'),'utf8'));
    if(['sidebar','horizontal'].includes(saved.mode))nativeLayout.mode=saved.mode;
    nativeLayout.autoHide=saved.autoHide!==false;
    nativeLayout.edge=saved.edge==='left'?'left':'right';
    lastCompactMode=saved.compactMode==='horizontal'?'horizontal':saved.mode==='horizontal'?'horizontal':'sidebar';
    // The application launches as a dock. It never restores a separate normal workspace window.
    nativeLayout.mode=lastCompactMode;
  } catch {}
  // The OS is authoritative, including changes made in System Settings.
  if (app.isPackaged && process.platform === 'darwin') {
    preferences.launchAtLogin = app.getLoginItemSettings().openAtLogin;
  }
}

function savePreferences() {
  const destination = preferencePath();
  const temporary = `${destination}.tmp`;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(preferences, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, destination);
}

function updatePreferences(value) {
  const next = sanitizePreferences(value, preferences);
  if (next.launchAtLogin !== preferences.launchAtLogin) {
    // Login items should point to the packaged app, never a development Electron executable.
    if (app.isPackaged && process.platform === 'darwin') {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, openAsHidden: true });
      next.launchAtLogin = app.getLoginItemSettings().openAtLogin;
    } else {
      next.launchAtLogin = false;
    }
  }
  preferences = next;
  savePreferences();
  if (panel && !panel.isDestroyed()) panel.setAlwaysOnTop(true, 'floating');
  return { ...preferences };
}

function positionPanel() {
  if(panel&&!panel.isDestroyed())applyNativeLayout();
}

function layoutArea() {
  return screen.getDisplayMatching(panel?.getBounds?.()||{x:0,y:0,width:1,height:1}).workArea;
}
function applyNativeLayout() {
  if(!panel||panel.isDestroyed())return nativeLayout;
  const area=layoutArea();
  panel.setMinimumSize(64,64);panel.setResizable(false);panel.setWindowButtonVisibility?.(false);panel.setAlwaysOnTop(true,'floating');
  panel.setBounds(compactBounds(area,nativeLayout,windowSize),false);
  panel.webContents.send('review:layout',{...nativeLayout});edgeDock?.sync();return {...nativeLayout};
}
function setNativeLayout(value={}) {
  if(value.mode!==undefined&&!['sidebar','horizontal'].includes(value.mode))throw Error('无效窗口形态');
  if(value.peek!==undefined&&typeof value.peek!=='boolean')throw Error('无效文件面板状态');
  if(value.autoHide!==undefined&&typeof value.autoHide!=='boolean')throw Error('无效收起状态');
  if(value.edge!==undefined&&!['left','right'].includes(value.edge))throw Error('无效屏幕边缘');
  const previous=nativeLayout.mode;
  nativeLayout={...nativeLayout,mode:value.mode||nativeLayout.mode,peek:value.peek??false,
    autoHide:value.autoHide??nativeLayout.autoHide,edge:value.edge||nativeLayout.edge};
  lastCompactMode=nativeLayout.mode;
  const dest=path.join(app.getPath('userData'),'native-layout.json');
  fs.writeFileSync(dest,JSON.stringify({mode:nativeLayout.mode,autoHide:nativeLayout.autoHide,edge:nativeLayout.edge,compactMode:lastCompactMode}),{mode:0o600});
  applyNativeLayout();
  if(previous!==nativeLayout.mode||value.autoHide!==undefined) {
    if(nativeLayout.autoHide)edgeDock?.show(false);
    else if(readyToShow)panel.show();
  }
  return {...nativeLayout};
}
function revealEdge(focus=false) {
  if(!panel||panel.isDestroyed()||!readyToShow)return;
  clearTimeout(blurTimer);applyNativeLayout();panel.showInactive();
  if(focus){panel.show();app.focus?.({steal:true});panel.focus();}
}
function retractEdge() {
  if(!panel||panel.isDestroyed())return;
  panel.hide();rendererBusy=false;
  if(nativeLayout.peek){nativeLayout.peek=false;applyNativeLayout();}
}
async function getFileLibrary(){
  if(projectFiles)return projectFiles;
  if(fileLibraryLoading)return fileLibraryLoading;
  fileLibraryLoading=(async()=>{
    const {ProjectFiles}=require('./project-files.cjs'),{LocalFileModel}=require('./local-file-model.cjs');
    fileModel=new LocalFileModel(app.getPath('userData'));
    projectFiles=await new ProjectFiles({directory:app.getPath('userData'),defaultRoots:[{path:app.getPath('desktop'),label:'桌面'},{path:app.getPath('downloads'),label:'下载'}],model:fileModel}).init();
    projectFiles.on('change',change=>{if(panel&&!panel.isDestroyed())panel.webContents.send('review:files-changed',change);});
    projectFiles.on('storage-error',error=>console.warn('File index save:',error));
    projectFiles.scan().catch(error=>console.warn('File scan:',error.message));
    fileModel.start().then(()=>{projectFiles.retryPending();projectFiles.changed();}).catch(error=>console.warn('Local model:',error.message));
    return projectFiles;
  })().finally(()=>{fileLibraryLoading=null;});return fileLibraryLoading;
}

function returnToDock() {
  if(!panel||panel.isDestroyed()||quitting)return;
  rendererBusy=false;
  if(panel.isMinimized?.())panel.restore();
  setNativeLayout({mode:lastCompactMode,peek:false,autoHide:true});
  if(!edgeDock?.hide())panel.hide();
  edgeDock?.sync();
}
function hidePanel() {
  if (!panel || panel.isDestroyed() || nativeSheetDepth > 0 || pickerActive) return;
  rendererBusy=false;
  if(edgeDock?.hide())return;
  panel.hide();
}

function showPanel(destination) {
  showRequested = true;
  if (destination) {pendingNavigation = destination;nativeLayout.peek=true;}
  if (!app.isReady()) return;
  if (!panel || panel.isDestroyed()) createPanel();
  if (!readyToShow) return;
  showRequested = false;
  clearTimeout(blurTimer);
  if(panel.isMinimized?.())panel.restore();
  positionPanel();
  ignoreBlurUntil = Date.now() + 350;
  if(!edgeDock?.show(true))panel.show();
  app.focus?.({steal:true});
  panel.focus();
  if (pendingNavigation) {
    panel.webContents.send('review:navigate', pendingNavigation);
    pendingNavigation = undefined;
  }
}

function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  tray.setTitle(trayStatus(status), { fontType: 'monospacedDigit' });
  const descriptions = { idle: '待开始', running: '审核中', paused: '已暂停', complete: '审核完成' };
  tray.setToolTip(`${APP_NAME} · ${descriptions[status.state]}${status.state === 'idle' ? '' : ` ${status.progress}% · ${status.issues} 项待关注`}`);
}

function createTrayMenu() {
  return Menu.buildFromTemplate([
    { label: `打开${APP_NAME}`, click: () => showPanel() },
    {label:'竖向文件侧栏',click:()=>{setNativeLayout({mode:'sidebar'});showPanel();}},
    {label:'横向文件栏',click:()=>{setNativeLayout({mode:'horizontal'});showPanel();}},
    {label:'自动收起文件栏',type:'checkbox',checked:nativeLayout.autoHide,click:item=>setNativeLayout({autoHide:item.checked})},
    {label:'停靠位置',submenu:[{label:'屏幕右侧',type:'radio',checked:nativeLayout.edge==='right',click:()=>setNativeLayout({edge:'right'})},{label:'屏幕左侧',type:'radio',checked:nativeLayout.edge==='left',click:()=>setNativeLayout({edge:'left'})}]},
    { label: '项目总览', click: () => showPanel('home') },
    { label: '审核工作台', click: () => showPanel('review') },
    { type: 'separator' },
    {
      label: '开机启动',
      type: 'checkbox',
      checked: preferences.launchAtLogin,
      enabled: app.isPackaged && process.platform === 'darwin',
      click: (item) => updatePreferences({ launchAtLogin: item.checked })
    },
    { label: '文件来源设置', click: () => showPanel('settings') },
    { type: 'separator' },
    { label: `退出${APP_NAME}`, accelerator: 'CommandOrControl+Q', click: () => app.quit() }
  ]);
}

function openAllowedExternal(url) {
  if (isAllowedExternalURL(url)) shell.openExternal(url).catch((error) => console.warn('Cannot open external link:', error.message));
}

function secureContents(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    openAllowedExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame && isTrustedDocument(event.url, INDEX_PATH)) return;
    event.preventDefault();
    if (event.isMainFrame) openAllowedExternal(event.url);
  });
  contents.on('will-navigate', (event, legacyURL) => {
    if (!isTrustedDocument(event.url || legacyURL, INDEX_PATH)) event.preventDefault();
  });
  contents.on('will-redirect', (event) => event.preventDefault());
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('before-input-event', (event, input) => {
    if(input.type==='keyDown'&&(process.platform==='darwin'?input.meta:input.control)&&['m','w'].includes(input.key?.toLowerCase())){event.preventDefault();if(input.key.toLowerCase()==='w')hidePanel();return;}
    if (input.type === 'keyDown' && input.key === 'Escape' && nativeSheetDepth === 0 && !pickerActive) {
      if(rendererBusy)return;
      event.preventDefault();
      if(nativeLayout.peek)setNativeLayout({peek:false});else hidePanel();
    }
  });
  contents.on('page-title-updated', (event) => event.preventDefault());
}

function createPanel() {
  readyToShow = false;
  const initialBounds=compactBounds(screen.getPrimaryDisplay().workArea,nativeLayout,windowSize);
  panel = new BrowserWindow({
    ...initialBounds,
    minWidth: 64,
    minHeight: 64,
    maxWidth: 1800,
    maxHeight: 1200,
    show: false,
    frame: false,
    type: 'panel',
    transparent: false,
    backgroundColor: '#0d0e10',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    title: APP_NAME,
    hasShadow: true,
    roundedCorners: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      backgroundThrottling: false,
      devTools: !app.isPackaged
    }
  });
  panel.setMenu(null);
  panel.setWindowButtonVisibility?.(false);
  panel.webContents.on('did-fail-load',(_event,code,description)=>console.error('Desktop load failed:',code,description));
  panel.webContents.on('console-message',(event)=>{if(event.level==='error'||event.level===3)console.error('Desktop renderer:',event.message);});
  if(process.env?.REVIEW_DESK_DIAGNOSTICS==='1'){
    panel.webContents.on('dom-ready',()=>console.error('Desktop diagnostics: DOM ready'));
    panel.webContents.on('did-finish-load',()=>console.error('Desktop diagnostics: page loaded'));
    panel.on('ready-to-show',()=>console.error('Desktop diagnostics: ready to show'));
  }
  secureContents(panel.webContents);
  panel.on('focus', () => clearTimeout(blurTimer));
  panel.on('blur',()=>{rendererBusy=false;});
  panel.on('sheet-begin', () => { nativeSheetDepth += 1; clearTimeout(blurTimer); });
  panel.on('sheet-end', () => {
    nativeSheetDepth = Math.max(0, nativeSheetDepth - 1);
    pickerActive = false;
    clearTimeout(pickerTimer);
    ignoreBlurUntil = Date.now() + 400;
  });
  panel.on('close', (event) => {
    if (!quitting) { event.preventDefault();returnToDock(); }
  });
  panel.on('minimize',event=>{if(!quitting){event?.preventDefault?.();returnToDock();}});
  panel.on('closed', () => { panel = undefined; readyToShow = false; });
  const showInitialPanel=()=>{
    if(readyToShow)return;
    readyToShow = true;
    applyNativeLayout();
    if(showRequested||pendingNavigation)showPanel();else if(nativeLayout.autoHide)edgeDock?.sync();else showPanel();
  };
  panel.once('ready-to-show',showInitialPanel);
  // Accessory applications may not produce their first hidden paint until
  // activation. A fully loaded page is also safe to show; don't deadlock on
  // ready-to-show when reopening an updated menu-bar application.
  panel.webContents.once('did-finish-load',showInitialPanel);
  panel.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer stopped:', details.reason);
    status = { ...INITIAL_STATUS };
    updateTray();
  });
  panel.loadFile(INDEX_PATH, { query: { desktop: '1' } }).catch((error) => {
    console.error('Cannot load review desk:', error.message);
  });
}

function trustedSender(event) {
  return Boolean(panel && !panel.isDestroyed() && event.sender === panel.webContents &&
    event.senderFrame === panel.webContents.mainFrame &&
    isTrustedDocument(event.senderFrame.url, INDEX_PATH));
}

function installIPC() {
  ipcMain.on('review:edge-busy',(event,value)=>{if(trustedSender(event)&&typeof value==='boolean')rendererBusy=value;});
  ipcMain.handle('review:layout',async(event,value)=>{
    if(!trustedSender(event))throw Error('Untrusted sender');
    if(value)edgeDock?.touch();
    return value?setNativeLayout(value):{...nativeLayout};
  });
  ipcMain.handle('review:files',async(event,action,payload={})=>{
    if(!trustedSender(event))throw Error('Untrusted sender');
    if(!['snapshot','catalog','scan','toggle-root','choose-root','open','reveal','assign','borrow','model-start'].includes(action))throw Error('Unsupported file action');
    if(!['snapshot','catalog'].includes(action))edgeDock?.touch();
    const library=await getFileLibrary();
    if(action==='snapshot')return library.snapshot();
    if(action==='catalog'){library.setCatalog(payload.projects);return library.snapshot();}
    if(action==='scan'){await library.scan();return library.snapshot();}
    if(action==='toggle-root')return library.toggleRoot(payload.id,payload.enabled);
    if(action==='choose-root'){
      nativeSheetDepth++;
      try{const source=payload.id?library.roots.find(root=>root.id===payload.id):null;const result=await dialog.showOpenDialog(panel,{title:source?'重新选择 '+source.label:'选择项目总目录',defaultPath:source?.path,properties:['openDirectory']});if(result.canceled)return library.snapshot();return library.addRoot(result.filePaths[0]);}
      finally{nativeSheetDepth=Math.max(0,nativeSheetDepth-1);}
    }
    if(action==='open'||action==='reveal'){
      const target=await library.resolve(payload.id);
      if(action==='reveal'){shell.showItemInFolder(target);return true;}
      const error=await shell.openPath(target);if(error)throw Error(error);return true;
    }
    if(action==='assign')return library.assign(payload.id,payload.code);
    if(action==='borrow')return library.linkBorrowed(payload.id,payload.code);
    if(action==='model-start'){await fileModel.start();library.retryPending();return library.snapshot();}
    throw Error('Unsupported file action');
  });
  ipcMain.handle('review:copy-code', async (event, code) => {
    if(!trustedSender(event)||typeof code!=='string'||!/^\d{1,100}$/.test(code))return false;
    await clipboard.writeText(code);return true;
  });
  ipcMain.handle('review:pdf', async (event, action, payload={}) => {
    if (!trustedSender(event)) throw Error('Untrusted sender');
    if (!pdfWorkspace) pdfWorkspace = require('./pdf-workspace.cjs').createWorkspace(app.getPath('userData'));
    if(action==='list') return pdfWorkspace.list();
    if(action==='sample') return pdfWorkspace.sample();
    if(action==='import') {
      nativeSheetDepth++;
      try { const result=await dialog.showOpenDialog(panel,{title:'导入原始 PDF',properties:['openFile'],filters:[{name:'PDF',extensions:['pdf']}]});
        if(result.canceled)return null;
        const selected=result.filePaths[0];if(fs.statSync(selected).size>20*1024*1024)throw Error('PDF 大小不能超过 20 MB');
        return await pdfWorkspace.ingest(fs.readFileSync(selected),path.basename(selected));
      } finally {nativeSheetDepth=Math.max(0,nativeSheetDepth-1);ignoreBlurUntil=Date.now()+400;}
    }
    if(action==='report') {
      if(!Array.isArray(payload.results)||payload.results.length>100||JSON.stringify(payload.results).length>2000000)throw Error('报告过大');
      return pdfWorkspace.fromText(payload.results,String(payload.name||'审核结果'));
    }
    if(action==='revise')return pdfWorkspace.revise(payload.id,payload.config);
    if(action==='open') {const target=await pdfWorkspace.resolvePDF(payload.id,payload.version);const error=await shell.openPath(target);if(error)throw Error(error);return true;}
    if(action==='folder'){await fs.promises.mkdir(pdfWorkspace.dir,{recursive:true});const error=await shell.openPath(pdfWorkspace.dir);if(error)throw Error(error);return true;}
    throw Error('Unsupported PDF action');
  });
  ipcMain.on('review:status', (event, payload) => {
    if (!trustedSender(event)) return;
    const next = sanitizeStatus(payload);
    if (!next) return;
    status = next;
    updateTray();
  });
  ipcMain.handle('review:preferences:get', (event) => {
    if (!trustedSender(event)) throw new Error('Untrusted sender');
    return { ...preferences };
  });
  ipcMain.handle('review:preferences:set', (event, value) => {
    if (!trustedSender(event)) throw new Error('Untrusted sender');
    return updatePreferences(value);
  });
  ipcMain.on('review:hide', (event) => {
    if (trustedSender(event)) hidePanel();
  });
  ipcMain.on('review:file-picker', (event, active) => {
    if (!trustedSender(event) || typeof active !== 'boolean') return;
    clearTimeout(pickerTimer);
    pickerActive = active;
    if (active) {
      clearTimeout(blurTimer);
      pickerTimer = setTimeout(() => { pickerActive = false; }, 120000);
    } else {
      ignoreBlurUntil = Date.now() + 400;
    }
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showPanel());
  app.whenReady().then(() => {
    app.dock?.hide();
    loadPreferences();
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY]
      } });
    });
    installIPC();
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    updateTray();
    tray.on('click', () => {
      if (panel?.isVisible()) hidePanel();
      else showPanel();
    });
    tray.on('right-click', () => tray.popUpContextMenu(createTrayMenu()));
    Menu.setApplicationMenu?.(Menu.buildFromTemplate([{label:APP_NAME,submenu:[{label:'显示侧栏',click:()=>showPanel()},{label:'文件来源设置',click:()=>showPanel('settings')},{type:'separator'},{role:'quit'}]},{role:'editMenu'}]));
    createPanel();
    edgeDock=createEdgeDock({BrowserWindow,screen,ipcMain,getPanel:()=>panel,getLayout:()=>nativeLayout,getArea:layoutArea,held:()=>nativeSheetDepth>0||pickerActive||rendererBusy,reveal:revealEdge,retract:retractEdge});
    edgeDock.sync();
    getFileLibrary().catch(error=>console.warn('File library:',error.message));
    screen.on('display-metrics-changed', () => { positionPanel();edgeDock?.sync(); });
    screen.on('display-removed', () => { positionPanel();edgeDock?.sync(); });
    app.on('activate', () => showPanel());
  }).catch((error) => {
    console.error('Cannot initialize review desk:', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => {});
  app.on('before-quit', (event) => {
    if(!quitting&&projectFiles){event.preventDefault();quitting=true;edgeDock?.close();edgeDock=undefined;fileModel?.stop();projectFiles.close().finally(()=>app.quit());return;}
    quitting = true;
    clearTimeout(blurTimer);
    clearTimeout(pickerTimer);
    edgeDock?.close();edgeDock=undefined;
    tray?.destroy();
    fileModel?.stop();
  });
}
