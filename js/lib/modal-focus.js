/** Shared modal focus lifecycle; presentation and drag gestures stay with the caller. */
export function containModalFocus(panel, { background = [], onEscape, returnFocus = document.activeElement } = {}) {
  const previous = background.filter(Boolean).map(el => [el, el.inert]);
  previous.forEach(([el]) => { el.inert = true; });
  panel.tabIndex = -1;
  const focusable = () => [...panel.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]')]
    .filter(el => el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[hidden], [inert]'));
  const enter = () => panel.focus({ preventScroll: true });
  const keydown = event => {
    if (panel.closest('[inert]')) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); onEscape?.();
    } else if (event.key === 'Tab') {
      const items = focusable(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); enter(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
  };
  const focusin = event => { if (!panel.closest('[inert]') && !panel.contains(event.target)) enter(); };
  document.addEventListener('keydown', keydown, true);
  document.addEventListener('focusin', focusin, true);
  enter();
  return () => {
    document.removeEventListener('keydown', keydown, true);
    document.removeEventListener('focusin', focusin, true);
    previous.forEach(([el, inert]) => { el.inert = inert; });
    const opener = typeof returnFocus === 'function' ? returnFocus() : returnFocus;
    const target = opener?.isConnected ? opener : document.querySelector('.tab[aria-current="page"]');
    target?.focus?.({ preventScroll: true });
  };
}
