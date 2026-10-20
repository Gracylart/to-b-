import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const policy = require('../desktop/policy.cjs');
const {
  CONTENT_SECURITY_POLICY, sanitizeStatus, sanitizePreferences,
  isTrustedDocument, isAllowedExternalURL, trayStatus, panelBounds,
} = policy;
const desktopPath = fileURLToPath(new URL('../desktop/', import.meta.url));
const indexPath = path.join(desktopPath, '..', 'dist', 'index.html');

test('status accepts known states, clamps finite numbers, and drops unknown fields', () => {
  for (const state of ['idle', 'running', 'paused', 'complete']) {
    assert.deepEqual(sanitizeStatus({ state, progress: 53.8, issues: 3.9, command: 'ignored' }), {
      state, progress: 54, issues: 3,
    });
  }
  assert.deepEqual(sanitizeStatus({ state: 'running', progress: -10, issues: -2 }), {
    state: 'running', progress: 0, issues: 0,
  });
  assert.deepEqual(sanitizeStatus({ state: 'complete', progress: 900, issues: 500000 }), {
    state: 'complete', progress: 100, issues: 99999,
  });
});

test('status rejects malformed, nonfinite, and coercible payloads', () => {
  for (const payload of [
    null, undefined, '', 1, {}, [],
    { state: 'other', progress: 0, issues: 0 },
    { state: 'running', progress: '20', issues: 0 },
    { state: 'running', progress: 20, issues: '0' },
    { state: 'running', progress: Infinity, issues: 0 },
    { state: 'running', progress: 20, issues: NaN },
    { state: 'running', progress: 20, issues: null },
  ]) assert.equal(sanitizeStatus(payload), null);
});

test('preferences only accept boolean fields and preserve prior valid settings', () => {
  const current = Object.freeze({ pinned: true, launchAtLogin: false });
  assert.deepEqual(sanitizePreferences({ pinned: 'false', launchAtLogin: 1 }, current), current);
  assert.deepEqual(sanitizePreferences({ launchAtLogin: true, path: '/tmp/other' }, current), {
    pinned: true, launchAtLogin: true,
  });
  assert.deepEqual(sanitizePreferences(null), { pinned: false, launchAtLogin: false });
  const polluted = JSON.parse('{"__proto__":{"injected":true},"pinned":false,"launchAtLogin":true}');
  const result = sanitizePreferences(polluted, current);
  assert.deepEqual(result, { pinned: false, launchAtLogin: true });
  assert.equal(result.injected, undefined);
  assert.equal({}.injected, undefined);
});

test('trusted documents must resolve to the exact local index path', () => {
  const expected = pathToFileURL(indexPath).href;
  assert.equal(isTrustedDocument(expected, indexPath), true);
  assert.equal(isTrustedDocument(`${expected}?desktop=1#review`, indexPath), true);
  const spacedPath = '/Applications/文案 审核台.app/Contents/Resources/app/dist/index.html';
  assert.equal(isTrustedDocument(pathToFileURL(spacedPath).href, spacedPath), true);
  for (const value of [
    'https://github.com/',
    'data:text/html,<script>alert(1)</script>',
    'javascript:alert(1)',
    'about:blank',
    'not a URL',
    expected.replace('index.html', 'other.html'),
    `${expected}/suffix`,
    expected.replace('file:///', 'file://attacker.example/'),
    expected.replace('index.html', '%69ndex.html'),
  ]) assert.equal(isTrustedDocument(value, indexPath), false, value);
});

test('external links permit only HTTPS on the explicitly allowed hosts', () => {
  for (const value of [
    'https://www.figma.com/design/IBHECNJfQK2Dymy3CLCZAV',
    'https://figma.com/design/example?node-id=173-2234',
    'https://github.com/Gracylart/to-b-',
    'https://codex-workflow-gracy.blush-tetra-1726.chatgpt.site/',
    'HTTPS://GITHUB.COM/Gracylart/to-b-',
    'https://github.com:443/Gracylart/to-b-',
  ]) assert.equal(isAllowedExternalURL(value), true, value);
});

test('external links reject protocol, credential, host, and port bypasses', () => {
  for (const value of [
    'http://github.com/Gracylart/to-b-',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<h1>test</h1>',
    'mailto:someone@example.com',
    '//github.com/Gracylart/to-b-',
    'https://github.com.attacker.example/',
    'https://attacker.github.com/',
    'https://github.com@attacker.example/',
    'https://attacker@github.com/',
    'https://user:secret@github.com/',
    'https://github.com:444/',
    'https://github.com./',
    'https://127.0.0.1/',
    'https://www.figma.com%2eattacker.example/',
    'https://github.com%00.attacker.example/',
    null, undefined, '',
  ]) assert.equal(isAllowedExternalURL(value), false, String(value));
});

test('panel stays inside normal and small work areas, including negative display coordinates', () => {
  const scenarios = [
    [{ x: 1300, y: 0, width: 70, height: 24 }, { x: 0, y: 24, width: 1440, height: 876 }],
    [{ x: -1910, y: -880, width: 40, height: 24 }, { x: -1920, y: -880, width: 1920, height: 1056 }],
    [{ x: 305, y: 215, width: 30, height: 24 }, { x: 0, y: 0, width: 320, height: 240 }],
    [{ x: 0, y: 0, width: 0, height: 0 }, { x: 1440, y: 24, width: 1280, height: 776 }],
  ];
  for (const [tray, area] of scenarios) {
    const result = panelBounds(tray, area);
    assert.ok(result.x >= area.x + 8);
    assert.ok(result.y >= area.y + 8);
    assert.ok(result.x + result.width <= area.x + area.width - 8);
    assert.ok(result.y + result.height <= area.y + area.height - 8);
    assert.ok(result.width > 0 && result.width <= 365);
    assert.ok(result.height > 0 && result.height <= 789);
    assert.ok(Number.isInteger(result.x) && Number.isInteger(result.y));
  }
});

test('panel centers below the tray and clamps an oversized requested window', () => {
  assert.deepEqual(
    panelBounds({ x: 600, y: 0, width: 80, height: 24 }, { x: 0, y: 24, width: 1440, height: 1000 }),
    { x: 458, y: 32, width: 365, height: 789 },
  );
  assert.deepEqual(
    panelBounds({ x: 0, y: 0, width: 0, height: 0 }, { x: 100, y: 100, width: 400, height: 300 }, { width: 900, height: 1200 }),
    { x: 108, y: 108, width: 384, height: 284 },
  );
});

test('tray displays the current activity, progress, and number of issues', () => {
  assert.equal(trayStatus({ state: 'idle', progress: 0, issues: 0 }), '审核台');
  assert.equal(trayStatus({ state: 'running', progress: 38, issues: 1 }), '38%');
  assert.equal(trayStatus({ state: 'paused', progress: 38, issues: 1 }), '暂停 38%');
  assert.equal(trayStatus({ state: 'complete', progress: 100, issues: 0 }), '已完成');
  assert.equal(trayStatus({ state: 'complete', progress: 100, issues: 3 }), '3 项');
});

test('CSP blocks network, script injection, frames, plugins, and form submission', () => {
  const directives = Object.fromEntries(CONTENT_SECURITY_POLICY.split('; ').map(item => {
    const [name, ...values] = item.split(' ');
    return [name, values];
  }));
  assert.deepEqual(directives['script-src'], ["'self'"]);
  for (const directive of ['connect-src', 'object-src', 'base-uri', 'form-action', 'frame-src']) {
    assert.deepEqual(directives[directive], ["'none'"]);
  }
});

// Execute the actual main-process wiring with Electron and disk I/O replaced.
// This checks trust decisions at the IPC handlers, without starting a GUI or
// changing the host's preferences, login items, files, or browser.
async function mainHarness() {
  const invocations = new Map();
  const ipcMain = new EventEmitter();
  ipcMain.handle = (name, callback) => invocations.set(name, callback);
  const windows = [];
  const trays = [];
  const opened = [];
  const writes = [];
  let loginAtStartup = false;

  class MockContents extends EventEmitter {
    constructor() {
      super();
      this.mainFrame = { url: '' };
    }
    setWindowOpenHandler(callback) { this.openHandler = callback; }
    send() {}
  }
  class MockWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new MockContents();
      this.hideCount = 0;
      windows.push(this);
    }
    isDestroyed() { return false; }
    setMenu() {}
    setAlwaysOnTop() {}
    loadFile(file, options) {
      this.webContents.mainFrame.url = `${pathToFileURL(file).href}?desktop=${options.query.desktop}`;
      return Promise.resolve();
    }
    hide() { this.hideCount += 1; }
  }
  class MockTray extends EventEmitter {
    constructor() { super(); trays.push(this); }
    isDestroyed() { return false; }
    setTitle(title) { this.title = title; }
    setToolTip() {}
    destroy() {}
  }
  const app = new EventEmitter();
  Object.assign(app, {
    isPackaged: true,
    dock: { hide() {} },
    setName() {},
    setAppUserModelId() {},
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    getPath: () => '/virtual/review-desk',
    getLoginItemSettings: () => ({ openAtLogin: loginAtStartup }),
    setLoginItemSettings: value => { loginAtStartup = value.openAtLogin; },
    quit() {},
  });
  const electron = {
    app, BrowserWindow: MockWindow, Tray: MockTray, ipcMain,
    Menu: { buildFromTemplate: items => items },
    nativeImage: { createFromPath: () => ({ setTemplateImage() {} }) },
    screen: new EventEmitter(),
    shell: { openExternal: url => { opened.push(url); return Promise.resolve(); } },
    session: { defaultSession: {
      setPermissionRequestHandler() {},
      setPermissionCheckHandler() {},
      webRequest: { onHeadersReceived() {} },
    } },
  };
  const disk = {
    readFileSync() { throw new Error('No saved preferences'); },
    mkdirSync() {},
    writeFileSync: (...args) => writes.push(args),
    renameSync() {},
  };
  const mainSource = await readFile(path.join(desktopPath, 'main.cjs'), 'utf8');
  vm.runInNewContext(mainSource, {
    require(name) {
      if (name === 'electron') return electron;
      if (name === 'node:path') return path;
      if (name === 'node:fs') return disk;
      if (name === './policy.cjs') return policy;
      throw new Error(`Unexpected dependency: ${name}`);
    },
    __dirname: desktopPath,
    process: { platform: 'darwin' },
    console: { error() {}, warn() {} },
    setTimeout: () => 1,
    clearTimeout() {},
  }, { filename: 'desktop/main.cjs' });
  await Promise.resolve();
  assert.equal(windows.length, 1, 'The main-process setup must succeed');
  const panel = windows[0];
  const trustedEvent = () => ({ sender: panel.webContents, senderFrame: panel.webContents.mainFrame });
  return { panel, tray: trays[0], invocations, ipcMain, opened, writes, trustedEvent };
}

test('actual IPC handlers reject unrelated senders, child frames, and missing frames', async () => {
  const harness = await mainHarness();
  const { panel, tray, invocations, ipcMain, writes, trustedEvent } = harness;
  const untrustedEvents = [
    { sender: {}, senderFrame: panel.webContents.mainFrame },
    { sender: panel.webContents, senderFrame: { url: panel.webContents.mainFrame.url } },
    { sender: panel.webContents, senderFrame: null },
    { sender: panel.webContents },
  ];
  for (const event of untrustedEvents) {
    ipcMain.emit('review:status', event, { state: 'running', progress: 75, issues: 2 });
    ipcMain.emit('review:hide', event);
    assert.throws(() => invocations.get('review:preferences:get')(event), /Untrusted sender/);
    assert.throws(() => invocations.get('review:preferences:set')(event, { pinned: true }), /Untrusted sender/);
  }
  assert.equal(tray.title, '审核台');
  assert.equal(panel.hideCount, 0);
  assert.equal(writes.length, 0);
  ipcMain.emit('review:status', trustedEvent(), { state: 'running', progress: 75, issues: 2 });
  assert.equal(tray.title, '75%');
  ipcMain.emit('review:hide', trustedEvent());
  assert.equal(panel.hideCount, 1);
  invocations.get('review:preferences:set')(trustedEvent(), { pinned: true, command: 'ignored' });
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0][1]), { pinned: true, launchAtLogin: false });
});

test('a navigated main frame loses all IPC privileges until the trusted document returns', async () => {
  const { panel, tray, invocations, ipcMain, writes, trustedEvent } = await mainHarness();
  const originalURL = panel.webContents.mainFrame.url;
  for (const url of [
    'https://github.com/Gracylart/to-b-',
    'file:///tmp/index.html',
    'data:text/html,spoofed',
  ]) {
    panel.webContents.mainFrame.url = url;
    ipcMain.emit('review:status', trustedEvent(), { state: 'complete', progress: 100, issues: 5 });
    ipcMain.emit('review:hide', trustedEvent());
    assert.throws(() => invocations.get('review:preferences:set')(trustedEvent(), { pinned: true }), /Untrusted sender/);
  }
  assert.equal(tray.title, '审核台');
  assert.equal(panel.hideCount, 0);
  assert.equal(writes.length, 0);
  panel.webContents.mainFrame.url = originalURL;
  ipcMain.emit('review:status', trustedEvent(), { state: 'running', progress: Infinity, issues: 2 });
  assert.equal(tray.title, '审核台');
  ipcMain.emit('review:status', trustedEvent(), { state: 'complete', progress: 100, issues: 5 });
  assert.equal(tray.title, '5 项');
});

test('main-process navigation denies new renderer windows and opens only approved external URLs', async () => {
  const { panel, opened } = await mainHarness();
  const contents = panel.webContents;
  for (const url of ['https://github.com/Gracylart/to-b-', 'https://attacker.example/', 'file:///tmp/payload.html']) {
    assert.equal(contents.openHandler({ url }).action, 'deny');
  }
  assert.deepEqual(opened, ['https://github.com/Gracylart/to-b-']);

  for (const [url, isMainFrame] of [
    ['https://attacker.example/', true],
    ['https://github.com/Gracylart/to-b-', false],
    ['file:///tmp/index.html', true],
  ]) {
    let prevented = false;
    contents.emit('will-frame-navigate', { url, isMainFrame, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
  assert.equal(opened.length, 1, 'Subframes must not launch an external browser');
  let trustedPrevented = false;
  contents.emit('will-frame-navigate', {
    url: contents.mainFrame.url,
    isMainFrame: true,
    preventDefault() { trustedPrevented = true; },
  });
  assert.equal(trustedPrevented, false);
  for (const name of ['will-redirect', 'will-attach-webview']) {
    let prevented = false;
    contents.emit(name, { preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
});

test('renderer uses sandboxing and context isolation without Node integration', async () => {
  const { panel } = await mainHarness();
  const { webPreferences } = panel.options;
  assert.equal(webPreferences.sandbox, true);
  assert.equal(webPreferences.contextIsolation, true);
  assert.equal(webPreferences.nodeIntegration, false);
  assert.equal(webPreferences.webSecurity, true);
  assert.equal(webPreferences.allowRunningInsecureContent, false);
  assert.equal(webPreferences.devTools, false);
});

test('preload exposes only narrow IPC methods and never leaks an Electron event to callbacks', async () => {
  const sent = [];
  const invoked = [];
  const ipcRenderer = new EventEmitter();
  ipcRenderer.send = (...args) => sent.push(args);
  ipcRenderer.invoke = (...args) => {
    invoked.push(args);
    return Promise.resolve({ pinned: false, launchAtLogin: false });
  };
  let exposed;
  const preloadSource = await readFile(path.join(desktopPath, 'preload.cjs'), 'utf8');
  vm.runInNewContext(preloadSource, {
    require(name) {
      assert.equal(name, 'electron');
      return {
        ipcRenderer,
        contextBridge: {
          exposeInMainWorld(name, api) {
            assert.equal(name, 'reviewDesktop');
            exposed = api;
          },
        },
      };
    },
    window: { addEventListener() {} },
    setTimeout: () => 1,
    clearTimeout() {},
  }, { filename: 'desktop/preload.cjs' });
  assert.deepEqual(Object.keys(exposed).sort(), [
    'getPreferences', 'hide', 'isDesktop', 'onNavigate', 'setPinned', 'setPreferences', 'updateStatus',
  ]);
  assert.ok(Object.isFrozen(exposed));
  exposed.updateStatus({ state: 'invalid', progress: 2, issues: 0 });
  exposed.updateStatus({ state: 'running', progress: Infinity, issues: 0 });
  assert.equal(sent.length, 0);
  exposed.updateStatus({ state: 'running', progress: 2, issues: 0, execute: 'discarded' });
  assert.equal(sent[0][0], 'review:status');
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0][1])), { state: 'running', progress: 2, issues: 0 });
  await assert.rejects(exposed.setPinned('true'), /boolean/);
  await exposed.setPreferences({ pinned: true, launchAtLogin: 'true', channel: 'arbitrary' });
  assert.equal(invoked[0][0], 'review:preferences:set');
  assert.deepEqual(JSON.parse(JSON.stringify(invoked[0][1])), { pinned: true });
  await exposed.getPreferences();
  assert.equal(invoked[1][0], 'review:preferences:get');
  const received = [];
  const unsubscribe = exposed.onNavigate((...args) => received.push(args));
  const privateElectronEvent = { sender: { privileged: true } };
  ipcRenderer.emit('review:navigate', privateElectronEvent, 'unexpected');
  ipcRenderer.emit('review:navigate', privateElectronEvent, 'review');
  assert.deepEqual(received, [['review']]);
  unsubscribe();
  ipcRenderer.emit('review:navigate', privateElectronEvent, 'home');
  assert.equal(received.length, 1);
  exposed.hide();
  assert.deepEqual(sent[1], ['review:hide']);
});
