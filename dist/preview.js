const $ = id => document.getElementById(id);
const stage = $('desktopStage');
const footprint = $('windowFootprint');
const desktopWindow = $('desktopWindow');
const frame = $('appFrame');
const titlebarHeight = 38;
const presets = {standard: {width: 1200, height: 800}, compact: {width: 960, height: 680}};
let mode = 'standard';
let maximized = false;
let windowState = 'visible';
let layoutRequest = 0;

function availableSpace() {
  const styles = getComputedStyle(stage);
  return {
    width: Math.max(1, stage.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight)),
    height: Math.max(1, stage.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom))
  };
}

function layout() {
  layoutRequest = 0;
  const available = availableSpace();
  const fitted = mode === 'fit' || maximized;
  const dimensions = fitted
    ? {width: Math.max(640, Math.floor(available.width)), height: Math.max(520, Math.floor(available.height - titlebarHeight))}
    : presets[mode];
  const outerHeight = dimensions.height + titlebarHeight;
  const scale = Math.min(1, available.width / dimensions.width, available.height / outerHeight);
  desktopWindow.style.width = `${dimensions.width}px`;
  desktopWindow.style.height = `${outerHeight}px`;
  desktopWindow.style.transform = `scale(${scale})`;
  frame.style.height = `${dimensions.height}px`;
  footprint.style.width = `${dimensions.width * scale}px`;
  footprint.style.height = `${outerHeight * scale}px`;
  $('sizeReadout').textContent = `${dimensions.width} × ${dimensions.height} · ${Math.round(scale * 100)}%`;
  document.querySelectorAll('[data-size]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.size === (maximized ? 'fit' : mode)));
  });
  const maximize = $('maximizeWindow');
  maximize.setAttribute('aria-pressed', String(maximized));
  maximize.setAttribute('aria-label', maximized ? '恢复预览窗口尺寸' : '最大化预览窗口');
  maximize.title = maximized ? '恢复窗口尺寸' : '最大化窗口';
}

function requestLayout() {
  if (!layoutRequest) layoutRequest = requestAnimationFrame(layout);
}

function restoreWindow() {
  windowState = 'visible';
  footprint.hidden = false;
  $('windowRestorer').hidden = true;
  layout();
}

function hideWindow(state) {
  windowState = state;
  footprint.hidden = true;
  $('windowRestorer').hidden = false;
  $('windowStateText').textContent = state === 'closed' ? '窗口已关闭' : '窗口已最小化';
  $('restoreWindow').textContent = state === 'closed' ? '重新打开审核台' : '恢复审核台窗口';
  $('restoreWindow').focus();
}

function toggleMaximize() {
  maximized = !maximized;
  layout();
}

document.querySelectorAll('[data-size]').forEach(button => {
  button.addEventListener('click', () => {
    mode = button.dataset.size;
    maximized = false;
    if (windowState !== 'visible') restoreWindow();
    else layout();
  });
});
$('closeWindow').addEventListener('click', () => hideWindow('closed'));
$('minimizeWindow').addEventListener('click', () => hideWindow('minimized'));
$('maximizeWindow').addEventListener('click', toggleMaximize);
$('restoreWindow').addEventListener('click', restoreWindow);
$('windowTitlebar').addEventListener('dblclick', event => {
  if (!event.target.closest('button')) toggleMaximize();
});
new ResizeObserver(requestLayout).observe(stage);
layout();
