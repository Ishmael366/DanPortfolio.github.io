(() => {
  'use strict';

  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('#main-nav');
  const closeMenu = () => {
    menu?.setAttribute('aria-expanded', 'false');
    nav?.classList.remove('is-open');
  };
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    nav?.classList.toggle('is-open', open);
  });
  nav?.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      menu.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (menu && nav && !nav.contains(event.target) && !menu.contains(event.target)) closeMenu();
  });
  window.matchMedia('(min-width: 601px)').addEventListener?.('change', closeMenu);

  const catalog = document.querySelector('[data-catalog]');
  if (catalog) {
    const find = (selector) => catalog.querySelector(selector);
    const search = find('#project-search');
    const tool = find('#tool-filter');
    const skill = find('#skill-filter');
    const clear = find('#clear-search');
    const status = find('#result-status');
    const empty = find('#empty-state');
    const grid = find('#project-grid');
    const pagination = find('.catalog-pagination');
    const pagePicker = find('#project-page');
    const prev = find('[data-page-prev]');
    const next = find('[data-page-next]');
    const normalize = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
    const cards = [...catalog.querySelectorAll('[data-project]')].map((element) => ({
      element,
      tools: element.dataset.tools.split('|'),
      skills: element.dataset.skills?.split('|') ?? [],
      searchable: normalize(`${element.textContent} ${element.dataset.skills?.replaceAll('|', ' ') ?? ''}`),
    }));
    const sizePicker = find('#page-size');
    let pageSize = Number(catalog.dataset.pageSize) || 7;
    const linkedIndex = cards.findIndex((card) => `#${card.element.id}` === location.hash);
    let page = linkedIndex < 0 ? 1 : Math.floor(linkedIndex / pageSize) + 1;
    let pages = 1;
    let optionCount = 0;

    function render() {
      const query = normalize(search.value).trim();
      const terms = query.split(/\s+/).filter(Boolean);
      const activeTool = tool?.value || '';
      const activeSkill = skill?.value || '';
      const filtered = terms.length > 0 || Boolean(activeTool || activeSkill);
      const matching = cards.filter((card) =>
        (!activeTool || card.tools.includes(activeTool)) &&
        (!activeSkill || card.skills.includes(activeSkill)) &&
        terms.every((word) => card.searchable.includes(word)));
      pages = Math.max(1, Math.ceil(matching.length / pageSize));
      page = Math.min(pages, Math.max(1, page));
      const first = (page - 1) * pageSize;
      const shown = new Set(matching.slice(first, first + pageSize));
      for (const card of cards) card.element.hidden = !shown.has(card);
      const count = matching.length;
      const countText = `${count} ${count === 1 ? 'project' : 'projects'}`;
      status.textContent = pages > 1
        ? `Showing ${first + 1}–${Math.min(first + pageSize, count)} of ${countText}.`
        : `${countText}${filtered ? ` ${count === 1 ? 'matches' : 'match'} your filters` : ''}.`;
      grid.hidden = count === 0;
      empty.hidden = count > 0;
      clear.hidden = !search.value;
      pagination.hidden = pages < 2;
      prev.disabled = page === 1;
      next.disabled = page === pages;
      if (optionCount !== pages) {
        pagePicker.replaceChildren(...Array.from({ length: pages }, (_, i) => new Option(`Page ${i + 1}`, String(i + 1))));
        optionCount = pages;
      }
      pagePicker.value = String(page);
    }

    function updateFilters() {
      page = 1;
      render();
    }
    function reset({ all = false } = {}) {
      search.value = '';
      if (all) {
        if (tool) tool.value = '';
        if (skill) skill.value = '';
      }
      updateFilters();
      search.focus();
    }
    function goToPage(requested) {
      page = Math.min(pages, Math.max(1, requested));
      render();
      const heading = find('#project-list-title');
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'start' });
    }

    find('.catalog-controls').hidden = !skill && cards.length < 2;
    search.addEventListener('input', updateFilters);
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && search.value) {
        event.preventDefault();
        reset();
      }
    });
    sizePicker?.addEventListener('change', () => {
      pageSize = sizePicker.value === 'all' ? Math.max(1, cards.length) : Number(sizePicker.value);
      updateFilters();
    });
    tool?.addEventListener('change', updateFilters);
    skill?.addEventListener('change', updateFilters);
    clear.addEventListener('click', () => reset());
    find('#reset-projects').addEventListener('click', () => reset({ all: true }));
    prev.addEventListener('click', () => goToPage(page - 1));
    next.addEventListener('click', () => goToPage(page + 1));
    pagePicker.addEventListener('change', () => goToPage(Number(pagePicker.value)));
    render();
  }

  const copyEmail = document.querySelector('.copy-email');
  if (copyEmail && navigator.clipboard?.writeText) {
    copyEmail.hidden = false;
    copyEmail.addEventListener('click', async () => {
      const copyStatus = document.querySelector('#copy-status');
      try {
        await navigator.clipboard.writeText('dhp.nguyen300@gmail.com');
        if (copyStatus) copyStatus.textContent = 'Email copied.';
      } catch {
        if (copyStatus) copyStatus.textContent = 'Copy this address: dhp.nguyen300@gmail.com';
      }
    });
  }
  document.querySelectorAll('[data-year]').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
})();
