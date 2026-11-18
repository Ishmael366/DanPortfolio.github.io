(() => {
  'use strict';

  const header = document.querySelector('.portfolio-home .site-header');
  const menu = header.querySelector('.menu-button');
  const hiddenClass = 'is-scrolled-away';
  const minimumTravel = 12;

  function scrollPosition() {
    const bottom = document.documentElement.scrollHeight - window.innerHeight;
    return Math.max(0, Math.min(window.scrollY, bottom));
  }

  let previousY = scrollPosition();
  let startY = previousY;
  let direction = 0;

  function showHeader() {
    header.classList.remove(hiddenClass);
    previousY = scrollPosition();
    startY = previousY;
    direction = 0;
  }

  window.addEventListener('scroll', () => {
    const y = scrollPosition();
    if (y <= header.offsetHeight ||
        menu.getAttribute('aria-expanded') === 'true' ||
        header.querySelector(':focus-visible')) {
      showHeader();
      return;
    }

    const nextDirection = Math.sign(y - previousY);
    if (nextDirection === 0) return;
    if (nextDirection !== direction) startY = previousY;
    direction = nextDirection;
    previousY = y;

    if (Math.abs(y - startY) >= minimumTravel) {
      header.classList.toggle(hiddenClass, direction > 0);
    }
  }, { passive: true });

  header.addEventListener('focusin', showHeader);
  window.addEventListener('pageshow', showHeader);
})();
