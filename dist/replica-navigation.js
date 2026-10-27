(() => {
  'use strict';

  // Each icon retains its original identity even when its label is edited or
  // the user moves it. None of these views represent connected business data.
  const replica = document.getElementById('replica');
  const panel = replica.querySelector('.panel');
  const original = panel.querySelector('.panel-scroll');
  const panelToggle = document.getElementById('panelToggle');
  const railButtons = [...replica.querySelectorAll('.rail-nav .rail-button')];
  const bottomButtons = [...replica.querySelectorAll('.rail-bottom button')];
  const railNames = ['Home', 'Search', 'Notifications', 'Files', 'Messages', 'Tasks', 'People', 'Integrations'];
  const bottomNames = ['Theme', 'Account', 'Settings', 'Starline'];
  const icons = {
    Search: 'search', Notifications: 'bell', Files: 'folder', Messages: 'dots',
    Tasks: 'calendar', People: 'person', Integrations: 'puzzle', Theme: 'sun',
    Account: 'account', Settings: 'sliders', Starline: 'logo'
  };
  const views = new Map();
  const svgNS = 'http://www.w3.org/2000/svg';

  function icon(name) {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svgNS, 'use');
    use.setAttribute('href', `#${name}`);
    svg.append(use);
    return svg;
  }

  function row(label, iconName, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-row';
    button.title = label;
    if (options.action) button.dataset.replicaAction = options.action;
    button.append(icon(iconName));
    const text = document.createElement('span');
    text.className = 'nav-text';
    text.textContent = label;
    button.append(text);
    return button;
  }

  function createView(name) {
    const key = name.toLowerCase();
    const view = document.createElement('div');
    view.className = 'panel-scroll';
    view.dataset.view = key;
    view.hidden = true;

    const section = document.createElement('section');
    section.className = 'primary-section';
    const heading = document.createElement('header');
    heading.className = 'section-heading';
    const title = document.createElement('div');
    title.className = 'section-toggle';
    title.append(icon(icons[name]));
    const titleText = document.createElement('span');
    titleText.textContent = name;
    title.append(titleText);
    heading.append(title);
    section.append(heading);

    if (name === 'Search') {
      const input = document.createElement('input');
      input.type = 'search';
      input.className = 'command-row';
      input.placeholder = 'Search';
      input.setAttribute('aria-label', 'Search prototype items');
      section.append(input);

      const results = document.createElement('div');
      results.className = 'main-links';
      results.dataset.replicaDerived = 'true';
      section.append(results);
      input.addEventListener('input', () => updateResults(input, results));
      view.searchInput = input;
      view.searchResults = results;
    } else {
      const contents = document.createElement('div');
      contents.className = 'main-links';
      // These strings explicitly label the page as a prototype, not a report
      // of the user's notifications, files, account, or other live information.
      contents.append(row('Prototype', icons[name]));
      section.append(contents);
    }

    const back = row('Home', 'home', {action: 'home'});
    back.addEventListener('click', () => openView('Home'));
    section.append(back);
    view.append(section);
    panel.append(view);
    views.set(name, view);
  }

  original.dataset.view = 'home';
  views.set('Home', original);
  [...railNames.slice(1), ...bottomNames].forEach(createView);

  function visibleSource(element) {
    // Ignore removed/deleted entries as well as hidden, collapsed sections.
    if (!element.isConnected || element.closest('[data-replica-deleted]')) return false;
    let parent = element;
    while (parent && parent !== original) {
      if (parent.hidden) return false;
      parent = parent.parentElement;
    }
    return true;
  }

  function updateResults(input, results) {
    const query = input.value.trim().toLocaleLowerCase();
    const candidates = [...original.querySelectorAll('.nav-row, .project-main, .project-children button')]
      .filter(visibleSource);
    const matches = candidates.filter(element => element.textContent.toLocaleLowerCase().includes(query)).slice(0, 16);
    results.replaceChildren();
    matches.forEach(target => {
      const label = target.querySelector('.nav-text')?.textContent.trim() || target.childNodes[0]?.textContent.trim() || target.textContent.trim();
      const result = row(label, 'search');
      result.addEventListener('click', () => {
        openView('Home');
        target.focus();
        target.scrollIntoView({block: 'nearest'});
      });
      results.append(result);
    });
    if (!matches.length) {
      const noResults = row('No results', 'search');
      noResults.disabled = true;
      results.append(noResults);
    }
  }

  function openView(name) {
    const view = views.get(name);
    if (!view) return;
    // Use the native control so its ARIA state and layout logic remain intact.
    if (replica.classList.contains('collapsed')) panelToggle.click();
    views.forEach(candidate => { candidate.hidden = candidate !== view; });

    railButtons.forEach((button, index) => {
      const active = railNames[index] === name;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    bottomButtons.forEach((button, index) => {
      const active = bottomNames[index] === name;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if (name === 'Search') updateResults(view.searchInput, view.searchResults);
    document.dispatchEvent(new CustomEvent('replica:view-change', {detail: {view: view.dataset.view}}));
    document.dispatchEvent(new CustomEvent('replica:layout'));
  }

  railButtons.forEach((button, index) => {
    button.dataset.replicaNav = railNames[index].toLowerCase();
    button.addEventListener('click', () => openView(railNames[index]));
  });
  bottomButtons.forEach((button, index) => {
    button.dataset.replicaNav = bottomNames[index].toLowerCase();
    button.addEventListener('click', () => openView(bottomNames[index]));
  });
  original.querySelector('.command-row')?.addEventListener('click', () => openView('Search'));

  document.addEventListener('keydown', event => {
    const focused = document.activeElement;
    if (event.defaultPrevented || event.isComposing || event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey ||
        focused?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused?.tagName)) return;
    event.preventDefault();
    openView('Search');
    views.get('Search').searchInput.focus();
  });
})();
