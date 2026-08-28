(function () {
  var links = document.querySelectorAll('.application-switcher a');
  if (!links.length) return;

  links.forEach(function (link) {
    link.addEventListener('click', function (event) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        (link.target && link.target !== '_self') ||
        link.origin !== window.location.origin ||
        typeof document.startViewTransition === 'function'
      ) return;

      event.preventDefault();
      document.documentElement.classList.add('page-leaving');
      var delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
      window.setTimeout(function () {
        window.location.href = link.href;
      }, delay);
    });
  });
})();