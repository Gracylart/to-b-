'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, shell, session, dialog, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {
  CONTENT_SECURITY_POLICY, sanitizeStatus, sanitizePreferences,
  isTrustedDocument, isAllowedExternalURL, trayStatus, panelBounds, sanitizeWindowSize
} = require('./policy.cjs');

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
let showRequested = true;
let pendingNavigation;
let ignoreBlurUntil = 0;
let nativeSheetDepth = 0;
let pickerActive = false;
let pickerTimer;
let blurTimer;
let projectFiles;
let fileModel;
let fileLibraryLoading;
let nativeLayout = {mode:'workspace',peek:false};

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
  if (panel && !panel.isDestroyed()) panel.setAlwaysOnTop(preferences.pinned, 'floating');
  return { ...preferences };
}

function positionPanel() {
  if (!panel || panel.isDestroyed()) return;
  if(nativeLayout.mode!=='workspace'){applyNativeLayout();return;}
  const bounds = tray?.getBounds() || { x: 0, y: 0, width: 0, height: 0 };
  const display = bounds.width > 0 ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay();
  panel.setBounds(panelBounds(bounds, display.workArea, windowSize), false);
}

function applyNativeLayout() {
  if(!panel||panel.isDestroyed())return nativeLayout;
  const display=screen.getDisplayMatching(panel.getBounds?.()||{x:0,y:0,width:1,height:1});
  const area=display.workArea;
  if(nativeLayout.mode==='workspace'){
    panel.setMinimumSize(640,520);panel.setResizable(true);panel.setWindowButtonVisibility?.(true);
    panel.setAlwaysOnTop(preferences.pinned,'floating');
    const trayBounds=tray?.getBounds()||{x:0,y:0,width:0,height:0};panel.setBounds(panelBounds(trayBounds,area,windowSize),false);
  }else{
    panel.setMinimumSize(64,64);panel.setResizable(false);panel.setWindowButtonVisibility?.(false);panel.setAlwaysOnTop(true,'floating');
    const horizontal=nativeLayout.mode==='horizontal',width=horizontal?Math.min(620,area.width-16):nativeLayout.peek?440:64;
    const height=horizontal?(nativeLayout.peek?480:64):Math.min(windowSize.height,area.height-16);
    panel.setBounds({x:horizontal?Math.round(area.x+(area.width-width)/2):area.x+8,y:horizontal?area.y+area.height-height-8:area.y+8,width,height},false);
  }
  panel.webContents.send('review:layout',nativeLayout);return {...nativeLayout};
}
function setNativeLayout(value={}) {
  if(value.mode!==undefined&&!['workspace','sidebar','horizontal'].includes(value.mode))throw Error('无效窗口形态');
  if(value.peek!==undefined&&typeof value.peek!=='boolean')throw Error('无效文件面板状态');
  nativeLayout={mode:value.mode||nativeLayout.mode,peek:value.mode==='workspace'?false:(value.peek??false)};
  const dest=path.join(app.getPath('userData'),'native-layout.json');
  fs.writeFileSync(dest,JSON.stringify({mode:nativeLayout.mode}),{mode:0o600});return applyNativeLayout();
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

function hidePanel() {
  if (!panel || panel.isDestroyed() || nativeSheetDepth > 0 || pickerActive) return;
  panel.hide();
}

function showPanel(destination) {
  showRequested = true;
  if (destination) pendingNavigation = destination;
  if (!app.isReady()) return;
  if (!panel || panel.isDestroyed()) createPanel();
  if (!readyToShow) return;
  showRequested = false;
  clearTimeout(blurTimer);
  positionPanel();
  ignoreBlurUntil = Date.now() + 350;
  panel.show();
  app.focus?.({steal:true});
  panel.focus();
  if (pendingNavigation) {
    panel.webContents.send('review:navigate', pendingNavigation);
    pendingNavigation = undefined;
  }
}

function scheduleBlurHide() {
  clearTimeout(blurTimer);
  blurTimer = setTimeout(() => {
    if (!panel || panel.isDestroyed() || panel.isFocused()) return;
    if (preferences.pinned || nativeSheetDepth > 0 || pickerActive || Date.now() < ignoreBlurUntil) return;
    panel.hide();
  }, Math.max(180, ignoreBlurUntil - Date.now() + 30));
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
    {label:'展开工作区',click:()=>{setNativeLayout({mode:'workspace'});showPanel();}},
    {label:'竖向文件侧栏',click:()=>{setNativeLayout({mode:'sidebar'});showPanel();}},
    {label:'横向文件栏',click:()=>{setNativeLayout({mode:'horizontal'});showPanel();}},
    { label: '项目总览', click: () => showPanel('home') },
    { label: '审核工作台', click: () => showPanel('review') },
    { type: 'separator' },
    { label: '固定窗口', type: 'checkbox', checked: preferences.pinned, click: (item) => updatePreferences({ pinned: item.checked }) },
    {
      label: '开机启动',
      type: 'checkbox',
      checked: preferences.launchAtLogin,
      enabled: app.isPackaged && process.platform === 'darwin',
      click: (item) => updatePreferences({ launchAtLogin: item.checked })
    },
    { label: '设置', click: () => showPanel('settings') },
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
    if (input.type === 'keyDown' && input.key === 'Escape' && nativeSheetDepth === 0 && !pickerActive) {
      event.preventDefault();
      if(nativeLayout.mode!=='workspace'&&nativeLayout.peek)setNativeLayout({peek:false});else hidePanel();
    }
  });
  contents.on('page-title-updated', (event) => event.preventDefault());
}

function createPanel() {
  readyToShow = false;
  panel = new BrowserWindow({
    ...windowSize,
    minWidth: 640,
    minHeight: 520,
    maxWidth: 1800,
    maxHeight: 1200,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 17 },
    transparent: false,
    backgroundColor: '#0d0e10',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    title: APP_NAME,
    hasShadow: true,
    roundedCorners: true,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    skipTaskbar: true,
    alwaysOnTop: preferences.pinned,
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
  panel.webContents.on('did-fail-load',(_event,code,description)=>console.error('Desktop load failed:',code,description));
  panel.webContents.on('console-message',(event)=>{if(event.level==='error'||event.level===3)console.error('Desktop renderer:',event.message);});
  if(process.env?.REVIEW_DESK_DIAGNOSTICS==='1'){
    panel.webContents.on('dom-ready',()=>console.error('Desktop diagnostics: DOM ready'));
    panel.webContents.on('did-finish-load',()=>console.error('Desktop diagnostics: page loaded'));
    panel.on('ready-to-show',()=>console.error('Desktop diagnostics: ready to show'));
  }
  secureContents(panel.webContents);
  panel.on('resized', () => {
    if(nativeLayout.mode!=='workspace')return;
    const [width, height] = panel.getSize();
    windowSize = sanitizeWindowSize({ width, height });
    const destination = path.join(app.getPath('userData'), 'window-size.json');
    try {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(`${destination}.tmp`, JSON.stringify(windowSize), { mode: 0o600 });
      fs.renameSync(`${destination}.tmp`, destination);
    } catch (error) { console.warn('Cannot save window size:', error.message); }
  });
  panel.on('focus', () => clearTimeout(blurTimer));
  panel.on('sheet-begin', () => { nativeSheetDepth += 1; clearTimeout(blurTimer); });
  panel.on('sheet-end', () => {
    nativeSheetDepth = Math.max(0, nativeSheetDepth - 1);
    pickerActive = false;
    clearTimeout(pickerTimer);
    ignoreBlurUntil = Date.now() + 400;
  });
  panel.on('close', (event) => {
    if (!quitting) { event.preventDefault(); hidePanel(); }
  });
  panel.on('closed', () => { panel = undefined; readyToShow = false; });
  const showInitialPanel=()=>{
    if(readyToShow)return;
    readyToShow = true;
    try{const saved=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'native-layout.json'),'utf8'));if(['sidebar','horizontal'].includes(saved.mode))nativeLayout={mode:saved.mode,peek:false};}catch{}
    if(nativeLayout.mode!=='workspace')applyNativeLayout();
    if (showRequested || pendingNavigation) showPanel();
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
  ipcMain.handle('review:layout',async(event,value)=>{
    if(!trustedSender(event))throw Error('Untrusted sender');
    return value?setNativeLayout(value):{...nativeLayout};
  });
  ipcMain.handle('review:files',async(event,action,payload={})=>{
    if(!trustedSender(event))throw Error('Untrusted sender');
    if(!['snapshot','catalog','scan','toggle-root','choose-root','open','reveal','assign','borrow','model-start'].includes(action))throw Error('Unsupported file action');
    const library=await getFileLibrary();
    if(action==='snapshot')return library.snapshot();
    if(action==='catalog'){library.setCatalog(payload.projects);return library.snapshot();}
    if(action==='scan'){await library.scan();return library.snapshot();}
    if(action==='toggle-root')return library.toggleRoot(payload.id,payload.enabled);
    if(action==='choose-root'){
      nativeSheetDepth++;
      try{const result=await dialog.showOpenDialog(panel,{title:'选择项目总目录',properties:['openDirectory']});if(result.canceled)return library.snapshot();return library.addRoot(result.filePaths[0]);}
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
    createPanel();
    screen.on('display-metrics-changed', () => { if (panel?.isVisible()) positionPanel(); });
    screen.on('display-removed', () => { if (panel?.isVisible()) positionPanel(); });
    app.on('activate', () => showPanel());
  }).catch((error) => {
    console.error('Cannot initialize review desk:', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => {});
  app.on('before-quit', (event) => {
    if(!quitting&&projectFiles){event.preventDefault();quitting=true;fileModel?.stop();projectFiles.close().finally(()=>app.quit());return;}
    quitting = true;
    clearTimeout(blurTimer);
    clearTimeout(pickerTimer);
    tray?.destroy();
    fileModel?.stop();
  });
}
