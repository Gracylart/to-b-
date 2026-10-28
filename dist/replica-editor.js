(() => {
  'use strict';

  const replica = document.getElementById('replica');
  const storageKey = 'replica-live-editor-v1';
  const itemSelector = [
    '.rail-logo', '.rail-nav > button', '.rail-bottom > button',
    '.panel-head .brand-mark', '.panel-head .brand-name',
    'button.command-row', '.nav-row', '.workspace-section', '.projects-section',
    '.section-actions > button', '.section-items > .project',
    '.project-children > button', '.nav-row > .number',
    '.project-children > button > span', '.shortcut',
    '.panel-scroll:not([data-view="home"]) .section-heading'
  ].join(',');
  const candidates = [...replica.querySelectorAll(itemSelector)]
    .filter(node => !node.closest('[data-replica-derived]'));
  const items = new Map();
  candidates.forEach((node, index) => {
    const id = `item-${index}`;
    node.dataset.replicaEditId = id;
    items.set(id, node);
  });
  // Keep existing item IDs intact so saved edits still refer to the same nodes.
  const brandCaret = replica.querySelector('.brand-caret');
  if (brandCaret) {
    brandCaret.dataset.replicaEditId = 'brand-caret';
    items.set('brand-caret', brandCaret);
  }

  const parents = [...new Set(candidates.map(node => node.parentElement))]
    .filter(node => node && node.matches('.rail-nav,.rail-bottom,.main-links,.section-items,.project-children,.panel-scroll'));
  const groups = new Map();
  parents.forEach((node, index) => {
    const id = `group-${index}`;
    node.dataset.replicaEditGroup = id;
    groups.set(id, node);
  });
  const toggles = [...replica.querySelectorAll('button.section-toggle,button.project-toggle')];
  const variables = {
    rail: ['--replica-rail-width', 85, 56, 150],
    panel: ['--replica-panel-width', 354, 220, 560],
    font: ['--replica-font-size', 24, 14, 36],
    row: ['--replica-row-height', 56, 36, 84]
  };

  const launch = document.createElement('button');
  launch.className = 'replica-editor-launch';
  launch.type = 'button';
  launch.textContent = '编辑原型';
  launch.hidden = true;
  const editor = document.createElement('aside');
  editor.className = 'replica-editor';
  editor.setAttribute('aria-label', '原型编辑面板');
  editor.innerHTML = `<div class="replica-editor-head"><strong>原型编辑</strong><button type="button" class="replica-editor-close" aria-label="收起编辑面板">×</button></div>
    <div class="replica-editor-body">
      <button type="button" class="editor-mode" aria-pressed="true">编辑模式 · 点击切换预览</button>
      <p class="editor-help">点击原型内容或左侧图标选择元素；左侧图标仍可打开对应面板。拖动元素，或使用上移、下移调整顺序。</p>
      <div class="editor-heading">选中元素</div>
      <div class="editor-selection">
        <div class="editor-selection-title">点击原型中的元素开始编辑</div>
        <label>文字 / 名称<input type="text" class="editor-text" disabled></label>
        <div class="editor-actions"><button type="button" class="editor-up" disabled>上移</button><button type="button" class="editor-down" disabled>下移</button><button type="button" class="editor-delete" disabled>删除</button></div>
        <label class="editor-move-group" hidden>移动到分组<select class="editor-destination" aria-label="移动到分组"></select></label>
      </div>
      <div class="editor-heading">整体布局 <span style="font-weight:400">（原图尺寸）</span></div>
      <div class="editor-grid">
        <label>图标栏宽度<input class="editor-rail" type="number" min="56" max="150" step="1" aria-label="图标栏宽度"></label>
        <label>内容栏宽度<input class="editor-panel" type="number" min="220" max="560" step="1" aria-label="内容栏宽度"></label>
        <label>文字字号<input class="editor-font" type="number" min="14" max="36" step="1" aria-label="文字字号"></label>
        <label>条目行高<input class="editor-row" type="number" min="36" max="84" step="1" aria-label="条目行高"></label>
      </div>
      <p class="editor-hint">修改自动保存在当前浏览器。切换到预览模式可操作项目展开与导航。</p>
      <div class="editor-status" aria-live="polite"></div>
    </div>
    <div class="editor-history"><button type="button" class="editor-undo" disabled>撤销</button><button type="button" class="editor-reset">恢复原图</button></div>`;
  document.body.append(launch, editor);

  const get = selector => editor.querySelector(selector);
  const fields = Object.fromEntries(Object.keys(variables).map(key => [key, get(`.editor-${key}`)]));
  const textField = get('.editor-text');
  const selectionTitle = get('.editor-selection-title');
  const modeButton = get('.editor-mode');
  const status = get('.editor-status');
  const undoButton = get('.editor-undo');
  const upButton = get('.editor-up');
  const downButton = get('.editor-down');
  const deleteButton = get('.editor-delete');
  const destinationLabel = get('.editor-move-group');
  const destination = get('.editor-destination');
  let selected = null;
  let editing = true;
  let history = [];
  let textCheckpoint = false;
  let pointerDrag = null;
  let suppressClick = false;
  let dropTarget = null;

  function textTarget(node) {
    if (node.matches('.rail-logo,.rail-nav > button,.rail-bottom > button,.panel-head .brand-mark,.brand-caret,.section-actions > button')) {
      return {attribute: 'aria-label'};
    }
    let target = node;
    if (node.matches('.workspace-section,.projects-section,.section-heading')) target = node.querySelector('.section-toggle span');
    else if (node.matches('.project')) target = node.querySelector('.project-main .nav-text');
    else if (node.matches('.nav-row,button.command-row')) target = node.querySelector('.nav-text');
    if (!target) return null;
    if (node.matches('.project-children > button')) {
      return {nodes: [...target.childNodes].filter(child => child.nodeType === Node.TEXT_NODE)};
    }
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return {nodes};
  }

  function getText(node) {
    const target = textTarget(node);
    if (!target) return null;
    if (target.attribute) return node.getAttribute(target.attribute) || '';
    return target.nodes.length ? target.nodes.map(part => part.nodeValue).join('').trim() : null;
  }

  function writeText(node, value) {
    const target = textTarget(node);
    if (!target) return;
    if (target.attribute) node.setAttribute(target.attribute, value);
    else if (target.nodes.length) {
      target.nodes[0].nodeValue = value;
      target.nodes.slice(1).forEach(part => { part.nodeValue = ''; });
      if (node.matches('.nav-row')) node.title = value;
      if (node.matches('.project')) node.querySelector('.project-main').title = value;
    }
  }

  function snapshot() {
    const itemState = {};
    items.forEach((node, id) => {
      const target = textTarget(node);
      const titleNode = node.matches('.project') ? node.querySelector('.project-main') : node;
      itemState[id] = {
        hidden: node.hidden,
        text: target?.nodes?.map(part => part.nodeValue) ?? null,
        aria: node.getAttribute('aria-label'),
        title: titleNode.getAttribute('title')
      };
    });
    const groupState = {};
    groups.forEach((node, id) => {
      groupState[id] = [...node.children].map(child => child.dataset.replicaEditId).filter(Boolean);
    });
    const layout = {};
    Object.entries(variables).forEach(([key, [name, fallback]]) => {
      layout[key] = parseFloat(replica.style.getPropertyValue(name)) || fallback;
    });
    const activeView = [...replica.querySelectorAll('.panel-scroll[data-view]')].find(node => !node.hidden)?.dataset.view || 'home';
    return {version: 1, itemState, groupState, layout, activeView,
      collapsed: replica.classList.contains('collapsed'),
      toggles: toggles.map(node => node.getAttribute('aria-expanded') === 'true')};
  }

  function syncDeleted(node) {
    if (node.hidden) node.dataset.replicaDeleted = 'true';
    else delete node.dataset.replicaDeleted;
  }

  function restore(state) {
    if (!state || state.version !== 1) return;
    Object.entries(state.itemState || {}).forEach(([id, value]) => {
      const node = items.get(id);
      if (!node || !value || typeof value.hidden !== 'boolean') return;
      node.hidden = value.hidden;
      syncDeleted(node);
      const target = textTarget(node);
      if (target?.nodes && Array.isArray(value.text)) target.nodes.forEach((part, index) => {
        if (typeof value.text[index] === 'string') part.nodeValue = value.text[index];
      });
      for (const name of ['aria', 'title']) {
        const attribute = name === 'aria' ? 'aria-label' : 'title';
        const targetNode = name === 'title' && node.matches('.project') ? node.querySelector('.project-main') : node;
        if (value[name] === null) targetNode.removeAttribute(attribute);
        else if (typeof value[name] === 'string') targetNode.setAttribute(attribute, value[name]);
      }
    });
    Object.entries(state.groupState || {}).forEach(([id, order]) => {
      const group = groups.get(id);
      if (!group || !Array.isArray(order)) return;
      const nodes = order.map(key => items.get(key)).filter(Boolean);
      nodes.forEach(node => group.append(node));
    });
    Object.entries(variables).forEach(([key, [name, fallback, min, max]]) => {
      const supplied = Number(state.layout?.[key]);
      const value = Number.isFinite(supplied) ? Math.max(min, Math.min(max, supplied)) : fallback;
      replica.style.setProperty(name, `${value}px`);
      fields[key].value = String(value);
    });
    if (Array.isArray(state.toggles)) toggles.forEach((node, index) => {
      if (typeof state.toggles[index] !== 'boolean') return;
      const expanded = state.toggles[index];
      node.setAttribute('aria-expanded', String(expanded));
      if (node.classList.contains('project-toggle')) {
        const content = node.closest('.project')?.querySelector('.project-children');
        if (content) content.hidden = !expanded;
        const projectName = node.closest('.project')?.querySelector('.project-main')?.title || '';
        node.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${projectName}`);
      } else {
        const content = document.getElementById(`${node.dataset.group}-items`);
        if (content) content.hidden = !expanded;
      }
    });
    const visibleView = [...replica.querySelectorAll('.panel-scroll[data-view]')].find(node => !node.hidden)?.dataset.view;
    if (typeof state.activeView === 'string' && state.activeView !== visibleView) {
      [...replica.querySelectorAll('[data-replica-nav]')].find(node => node.dataset.replicaNav === state.activeView)?.click();
    }
    if (typeof state.collapsed === 'boolean') {
      replica.classList.toggle('collapsed', state.collapsed);
      const panelToggle = document.getElementById('panelToggle');
      panelToggle.setAttribute('aria-expanded', String(!state.collapsed));
      panelToggle.setAttribute('aria-label', state.collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    }
    document.dispatchEvent(new CustomEvent('replica:layout'));
  }

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(snapshot())); status.textContent = '已自动保存'; }
    catch { status.textContent = '无法保存到浏览器，当前更改仅在本页有效'; }
    undoButton.disabled = history.length === 0;
  }

  function checkpoint() {
    history.push(snapshot());
    if (history.length > 50) history.shift();
    undoButton.disabled = false;
  }

  function eligibleSiblings(node) {
    if (!node?.parentElement?.dataset.replicaEditGroup) return [];
    return [...node.parentElement.children].filter(child => child.dataset.replicaEditId && !child.hidden);
  }

  function select(node) {
    if (selected) selected.classList.remove('replica-edit-selected');
    selected = node;
    if (selected) selected.classList.add('replica-edit-selected');
    const value = selected ? getText(selected) : null;
    selectionTitle.textContent = selected ? (value || selected.getAttribute('aria-label') || '选中元素') : '点击原型中的元素开始编辑';
    textField.disabled = !selected || value === null;
    textField.value = value ?? '';
    textCheckpoint = false;
    const siblings = eligibleSiblings(selected);
    const index = siblings.indexOf(selected);
    upButton.disabled = index <= 0;
    downButton.disabled = index < 0 || index === siblings.length - 1;
    deleteButton.disabled = !selected;
    const available = selected?.matches('.nav-row') ? [...groups.entries()].filter(([, group]) =>
      group.matches('.main-links,#workspace-items') && !group.closest('[data-replica-derived]') &&
      group.closest('.panel-scroll') === selected.closest('.panel-scroll')) : [];
    destinationLabel.hidden = available.length < 2;
    destination.replaceChildren(...available.map(([id, group]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = group.closest('section')?.querySelector('.section-toggle span')?.textContent.trim() || '常用入口';
      option.selected = group === selected.parentElement;
      return option;
    }));
  }

  function setEditorOpen(open) {
    document.body.classList.toggle('replica-editor-open', open);
    document.body.classList.toggle('replica-editing', open && editing);
    editor.hidden = !open;
    launch.hidden = open;
    if (selected) selected.classList.toggle('replica-edit-selected', open && editing);
    document.dispatchEvent(new CustomEvent('replica:layout'));
  }

  const initial = snapshot();
  try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (saved?.version === 1) restore(saved); }
  catch { /* Ignore invalid or unavailable browser storage. */ }
  Object.entries(variables).forEach(([key, [name, fallback]]) => {
    fields[key].value = String(parseFloat(replica.style.getPropertyValue(name)) || fallback);
  });
  setEditorOpen(true);

  get('.replica-editor-close').addEventListener('click', () => setEditorOpen(false));
  launch.addEventListener('click', () => setEditorOpen(true));
  modeButton.addEventListener('click', () => {
    editing = !editing;
    document.body.classList.toggle('replica-editing', editing);
    modeButton.setAttribute('aria-pressed', String(editing));
    modeButton.textContent = editing ? '编辑模式 · 点击切换预览' : '预览模式 · 点击返回编辑';
    if (selected) selected.classList.toggle('replica-edit-selected', editing);
  });

  document.addEventListener('click', event => {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!editor.hidden && editing) {
      if (event.target.closest('.panel-toggle,.project-toggle, input, textarea, select')) return;
      const node = event.target.closest('[data-replica-edit-id]');
      if (!node || !replica.contains(node) || node.closest('[data-replica-derived]')) return;
      select(node);
      // The left rail remains a real navigation surface while its icon is selected.
      if (node.matches('.rail-nav > button,.rail-bottom > button') || event.target.closest('button.section-toggle')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  textField.addEventListener('focus', () => { textCheckpoint = false; });
  textField.addEventListener('input', () => {
    if (!selected) return;
    if (!textCheckpoint) { checkpoint(); textCheckpoint = true; }
    writeText(selected, textField.value);
    selectionTitle.textContent = textField.value || '选中元素';
    persist();
  });
  textField.addEventListener('blur', () => { textCheckpoint = false; });

  function move(direction) {
    const siblings = eligibleSiblings(selected);
    const index = siblings.indexOf(selected);
    const adjacent = siblings[index + direction];
    if (!adjacent) return;
    checkpoint();
    if (direction < 0) selected.parentElement.insertBefore(selected, adjacent);
    else selected.parentElement.insertBefore(adjacent, selected);
    select(selected);
    persist();
  }
  upButton.addEventListener('click', () => move(-1));
  downButton.addEventListener('click', () => move(1));
  destination.addEventListener('change', () => {
    const group = groups.get(destination.value);
    if (!selected || !group || group === selected.parentElement) return;
    checkpoint();
    group.append(selected);
    select(selected);
    persist();
  });
  deleteButton.addEventListener('click', () => {
    if (!selected) return;
    checkpoint();
    selected.hidden = true;
    syncDeleted(selected);
    select(null);
    persist();
  });

  Object.entries(variables).forEach(([key, [name, fallback, min, max]]) => {
    let didCheckpoint = false;
    fields[key].addEventListener('focus', () => { didCheckpoint = false; });
    fields[key].addEventListener('input', () => {
      const parsed = Number(fields[key].value);
      if (!fields[key].value || !Number.isFinite(parsed)) return;
      if (!didCheckpoint) { checkpoint(); didCheckpoint = true; }
      const value = Math.max(min, Math.min(max, parsed));
      replica.style.setProperty(name, `${value}px`);
      document.dispatchEvent(new CustomEvent('replica:layout'));
      persist();
    });
    fields[key].addEventListener('change', () => {
      const parsed = Number(fields[key].value);
      fields[key].value = String(Number.isFinite(parsed) && fields[key].value ? Math.max(min, Math.min(max, parsed)) : fallback);
      fields[key].dispatchEvent(new Event('input'));
    });
    fields[key].addEventListener('blur', () => { didCheckpoint = false; });
  });

  undoButton.addEventListener('click', () => {
    const state = history.pop();
    if (!state) return;
    restore(state);
    select(null);
    persist();
  });
  get('.editor-reset').addEventListener('click', () => {
    checkpoint();
    restore(initial);
    select(null);
    persist();
  });

  // Rows may move between sections on the same panel; project and icon blocks
  // remain with their own peer group so their associated controls stay intact.
  function compatibleDrag(source, target) {
    if (!source || source === target) return false;
    if (source.parentElement === target.parentElement) return true;
    return source.matches('.nav-row') && target.matches('.nav-row') &&
      source.closest('.panel-scroll') === target.closest('.panel-scroll');
  }
  items.forEach(node => {
    if (!node.parentElement?.dataset.replicaEditGroup) return;
    node.addEventListener('pointerdown', event => {
      if (!editing || editor.hidden || event.button !== 0 || event.target.closest('[data-replica-edit-id]') !== node ||
          event.target.closest('.panel-toggle,.project-toggle,.section-toggle')) return;
      pointerDrag = {node, x: event.clientX, y: event.clientY, moved: false};
    });
  });
  function clearDropTarget() {
    dropTarget?.classList.remove('replica-edit-drop');
    dropTarget = null;
  }
  document.addEventListener('pointermove', event => {
    if (!pointerDrag) return;
    if (!pointerDrag.moved && Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) < 7) return;
    pointerDrag.moved = true;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-replica-edit-id]');
    const next = compatibleDrag(pointerDrag.node, target) ? target : null;
    if (next !== dropTarget) {
      clearDropTarget();
      dropTarget = next;
      dropTarget?.classList.add('replica-edit-drop');
    }
  });
  document.addEventListener('pointerup', event => {
    if (!pointerDrag) return;
    const {node, moved} = pointerDrag;
    if (moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (dropTarget && compatibleDrag(node, dropTarget)) {
        checkpoint();
        const rect = dropTarget.getBoundingClientRect();
        dropTarget.parentElement.insertBefore(node, event.clientY < rect.top + rect.height / 2 ? dropTarget : dropTarget.nextSibling);
        select(node);
        persist();
      }
    }
    pointerDrag = null;
    clearDropTarget();
  });
  document.addEventListener('pointercancel', () => { pointerDrag = null; clearDropTarget(); });

  document.addEventListener('click', event => {
    const toggle = event.target.closest('.panel-toggle,.project-toggle,button.section-toggle');
    if (!toggle || !replica.contains(toggle)) return;
    queueMicrotask(persist);
  });
  document.addEventListener('replica:view-change', () => {
    if (selected && !selected.isConnected) select(null);
    queueMicrotask(persist);
  });
})();
