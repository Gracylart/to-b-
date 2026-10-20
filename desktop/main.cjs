'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {
  CONTENT_SECURITY_POLICY, sanitizeStatus, sanitizePreferences,
  isTrustedDocument, isAllowedExternalURL, trayStatus, panelBounds
} = require('./policy.cjs');

const APP_NAME = '文案审核台';
const INDEX_PATH = path.join(__dirname, '..', 'dist', 'index.html');
const INITIAL_STATUS = { state: 'idle', progress: 0, issues: 0 };
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

app.setName(APP_NAME);
app.setAppUserModelId('com.gracylart.copyreviewdesk');

function preferencePath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function loadPreferences() {
  try {
    preferences = sanitizePreferences(JSON.parse(fs.readFileSync(preferencePath(), 'utf8')));
  } catch {
    preferences = { pinned: false, launchAtLogin: false };
  }
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
  const bounds = tray?.getBounds() || { x: 0, y: 0, width: 0, height: 0 };
  const display = bounds.width > 0 ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay();
  panel.setBounds(panelBounds(bounds, display.workArea), false);
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
    { label: '打开文案审核台', click: () => showPanel() },
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
    { label: '退出文案审核台', accelerator: 'CommandOrControl+Q', click: () => app.quit() }
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
      hidePanel();
    }
  });
  contents.on('page-title-updated', (event) => event.preventDefault());
}

function createPanel() {
  readyToShow = false;
  panel = new BrowserWindow({
    width: 365,
    height: 789,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'hud',
    visualEffectState: 'active',
    title: APP_NAME,
    hasShadow: true,
    roundedCorners: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
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
  secureContents(panel.webContents);
  panel.on('blur', scheduleBlurHide);
  panel.on('focus', () => clearTimeout(blurTimer));
  panel.on('sheet-begin', () => { nativeSheetDepth += 1; clearTimeout(blurTimer); });
  panel.on('sheet-end', () => {
    nativeSheetDepth = Math.max(0, nativeSheetDepth - 1);
    pickerActive = false;
    clearTimeout(pickerTimer);
    ignoreBlurUntil = Date.now() + 400;
    scheduleBlurHide();
  });
  panel.on('close', (event) => {
    if (!quitting) { event.preventDefault(); hidePanel(); }
  });
  panel.on('closed', () => { panel = undefined; readyToShow = false; });
  panel.once('ready-to-show', () => {
    readyToShow = true;
    if (showRequested || pendingNavigation) showPanel();
  });
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
      scheduleBlurHide();
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
  app.on('before-quit', () => {
    quitting = true;
    clearTimeout(blurTimer);
    clearTimeout(pickerTimer);
    tray?.destroy();
  });
}
