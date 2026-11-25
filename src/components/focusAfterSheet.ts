/**
 * A sheet hands focus back to whatever opened it as it closes, and App's RouteFocus leaves the new screen's heading
 * alone while the sheet is still fading out (it skips while a dialog is open). When a sheet closes because the
 * screen changes, call this: once the sheet is gone and the new screen has loaded, focus moves to its heading
 * (WCAG 2.4.3), unless the student has already moved focus somewhere else.
 *
 * `previous` is the heading of the screen being left, or null when the destination is the screen already open.
 */
export function focusHeadingWhenSheetCloses(previous: Element | null) {
  const until = performance.now() + 2000;
  const step = () => {
    const h1 = document.querySelector<HTMLElement>('#main h1');
    if (document.querySelector('[aria-modal="true"]') || !h1 || h1 === previous) {
      if (performance.now() < until) requestAnimationFrame(step);
      return;
    }
    const a = document.activeElement;
    if (a && a !== document.body && !a.closest('header')) return;
    if (!h1.hasAttribute('tabindex')) h1.tabIndex = -1;
    h1.focus({ preventScroll: true });
  };
  requestAnimationFrame(step);
}
