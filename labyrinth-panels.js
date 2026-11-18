(() => {
  'use strict';

  const tabList = document.querySelector('.labyrinth-tabs');
  const layout = document.querySelector('#scope');
  const tabs = [...tabList.querySelectorAll('a')];
  const panels = tabs.map((tab) => document.getElementById(tab.hash.slice(1)));
  let activeIndex = 0;

  function setTabStop(index) {
    tabs.forEach((tab, tabIndex) => {
      tab.tabIndex = tabIndex === index ? 0 : -1;
    });
  }

  function showPanel(index) {
    const focusedElement = document.activeElement;
    const moveFocus = index !== activeIndex && (
      panels[activeIndex].contains(focusedElement) || tabList.contains(focusedElement)
    );
    activeIndex = index;
    tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === index;
      tab.setAttribute('aria-selected', String(selected));
      panels[tabIndex].hidden = !selected;
    });
    setTabStop(index);
    if (moveFocus) tabs[index].focus({ preventScroll: true });
  }

  function followLocation(scroll) {
    const hash = location.hash;
    const target = document.getElementById(hash.slice(1));
    const panel = target?.closest('[data-labyrinth-panel]');
    if (!panel) return showPanel(0);
    showPanel(panels.indexOf(panel));
    if (scroll) {
      requestAnimationFrame(() => {
        if (location.hash === hash) {
          (target === panel ? layout : target).scrollIntoView({ block: 'start' });
        }
      });
    }
  }

  tabList.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    const panel = panels[index];
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
  });

  tabList.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const hashChanged = location.hash !== tab.hash;
    const returningToPanelTop = hashChanged &&
      tabList.getBoundingClientRect().top > layout.getBoundingClientRect().top + 2;
    if (hashChanged) history.pushState(null, '', tab.hash);
    showPanel(index);
    tab.focus({ preventScroll: true });
    if (returningToPanelTop) layout.scrollIntoView({ block: 'start' });
  });

  tabList.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(event.target);
    if (index === -1 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    let nextIndex;
    switch (event.key) {
      case 'ArrowLeft': nextIndex = (index - 1 + tabs.length) % tabs.length; break;
      case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = tabs.length - 1; break;
      case ' ':
        event.preventDefault();
        tabs[index].click();
        return;
      default: return;
    }
    event.preventDefault();
    setTabStop(nextIndex);
    tabs[nextIndex].focus({ preventScroll: true });
  });

  tabList.addEventListener('focusout', (event) => {
    if (!tabList.contains(event.relatedTarget)) setTabStop(activeIndex);
  });

  showPanel(0);
  followLocation(true);
  window.addEventListener('popstate', () => followLocation(false));
  window.addEventListener('hashchange', () => followLocation(true));
})();
