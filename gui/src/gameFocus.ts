// Keeps keyboard focus inside a game screen across moves (#82).
//
// Games disable their buttons while a move is on its way, and some rebuild
// them on every state. Either way the browser drops focus to <body>, so a
// keyboard player would have to Tab back into the game after every move.
// This remembers the last control focused inside the game and, after each
// render, puts focus back on it, or on the nearest control that is still
// usable, as long as focus hasn't gone somewhere else on the page. While
// nothing is usable (the other player's turn), focus waits on the container
// around the game, so the next Tab still lands inside the game. (Not on the
// shadow host itself: a host with tabindex="-1" takes its whole shadow tree
// out of the Tab order.)

const FOCUSABLE = "button, input, select, textarea, summary, a[href], [tabindex]:not([tabindex='-1'])";

type Remembered = { key: string; index: number };

// Identifies a control across re-renders: its label, else its text.
function keyOf(el: Element): string {
  return `${el.tagName}|${el.getAttribute("aria-label") ?? el.textContent?.trim() ?? ""}`;
}

const usable = (el: HTMLElement) =>
  !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0 && !el.closest("[hidden], [inert]");

export function keepGameFocus(container: HTMLElement, root: ShadowRoot): () => void {
  let last: Remembered | null = null;
  const host = root.host;
  container.tabIndex = -1; // focusable from script only, not a Tab stop
  const controls = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];

  root.addEventListener("focusin", (event) => {
    const el = event.target as HTMLElement;
    last = { key: keyOf(el), index: controls().indexOf(el) };
  });
  root.addEventListener("focusout", (event) => {
    // Moving to another real element outside the game means the player left
    // on purpose. A null relatedTarget is the browser dropping focus.
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (next && next !== container && next !== host && !root.contains(next)) last = null;
  });

  return function restoreFocus() {
    if (!last) return;
    // A control that was disabled while focused still counts as focused for a
    // moment, but a keyboard can't use it, so treat it as lost.
    const current = root.activeElement as HTMLElement | null;
    if (current && usable(current)) return;
    const active = document.activeElement;
    if (!current && active && active !== document.body && active !== container) return;

    const list = controls();
    let target = list.find((el) => keyOf(el) === last!.key && usable(el));
    // The control is gone or disabled (a played card, a taken square): use the
    // nearest usable one in document order.
    for (let d = 0; !target && d < list.length; d++) {
      target = [list[last.index + d], list[last.index - d]].find((el) => el && usable(el));
    }
    if (target) target.focus();
    // Nothing usable yet (it's the other player's turn): wait on the
    // container and try again next render.
    else if (active !== container) container.focus({ preventScroll: true });
  };
}
