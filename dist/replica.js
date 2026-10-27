const stage = document.getElementById('stage');
const footprint = document.getElementById('footprint');
const replica = document.getElementById('replica');
const toggle = document.getElementById('panelToggle');
let request = 0;

function layout() {
  request = 0;
  const style = getComputedStyle(stage);
  const availableWidth = Math.max(1, stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
  const availableHeight = Math.max(1, stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
  const width = replica.classList.contains('collapsed') ? 169 : 439;
  const scale = Math.min(1, availableWidth / width, availableHeight / 1480);
  replica.style.transform = `scale(${scale})`;
  footprint.style.width = `${width * scale}px`;
  footprint.style.height = `${1480 * scale}px`;
}

toggle.addEventListener('click', () => {
  const collapsed = replica.classList.toggle('collapsed');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  layout();
});

document.querySelectorAll('.project-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    const projectName = button.closest('.project').querySelector('.project-main').title;
    button.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${projectName}`);
    button.closest('.project').querySelector('.project-children').hidden = !expanded;
  });
});

document.querySelectorAll('.section-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    document.getElementById(`${button.dataset.group}-items`).hidden = !expanded;
  });
});

document.querySelectorAll('.rail-nav .rail-button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.rail-nav .rail-button').forEach(item => {
      item.classList.toggle('selected', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
  });
});

document.querySelectorAll('.nav-row').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-row').forEach(item => {
      item.classList.toggle('selected', item === button);
      if (item === button) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  });
});

new ResizeObserver(() => {
  if (!request) request = requestAnimationFrame(layout);
}).observe(stage);
layout();
