const stage = document.getElementById('desktopStage');
const footprint = document.getElementById('windowFootprint');
const desktopWindow = document.getElementById('desktopWindow');
let layoutRequest = 0;

function layout() {
  layoutRequest = 0;
  const styles = getComputedStyle(stage);
  const availableWidth = Math.max(1, stage.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight));
  const availableHeight = Math.max(1, stage.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom));
  const width = Math.max(960, availableWidth);
  const scale = Math.min(1, availableWidth / width, availableHeight / 680);
  const height = Math.max(680, Math.floor(availableHeight / scale));
  desktopWindow.style.width = width + 'px';
  desktopWindow.style.height = height + 'px';
  desktopWindow.style.transform = 'scale(' + scale + ')';
  footprint.style.width = width * scale + 'px';
  footprint.style.height = height * scale + 'px';
}

new ResizeObserver(() => {
  if (!layoutRequest) layoutRequest = requestAnimationFrame(layout);
}).observe(stage);
layout();
