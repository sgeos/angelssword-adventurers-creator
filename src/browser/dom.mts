/**
 * Type-safe DOM lookup.
 *
 * getElementById returns Element | null and says nothing about which kind,
 * so strict mode rejects reading .value or .checked off it. These narrow
 * with instanceof, which the compiler follows, rather than asserting a
 * shape nothing verified.
 */

/** The element, or undefined when absent or of another kind. */
export const findEl = <T extends Element>(
  id: string,
  kind: abstract new (...args: never[]) => T,
): T | undefined => {
  const el = document.getElementById(id);
  return el instanceof kind ? el : undefined;
};

/**
 * The element, or a thrown error naming what was wrong.
 *
 * Use where the markup is expected to contain the element and its absence
 * is a bug rather than a state to handle.
 */
export const requireEl = <T extends Element>(
  id: string,
  kind: abstract new (...args: never[]) => T,
): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} is not in the document`);
  if (!(el instanceof kind)) {
    throw new Error(`#${id} is a ${el.tagName.toLowerCase()}, not the expected element`);
  }
  return el;
};

/**
 * Every matching descendant, typed.
 *
 * A loop rather than filter with a type predicate: a predicate is an
 * unchecked claim, and instanceof inside the loop is one the compiler
 * follows on its own.
 */
export const queryAll = <T extends Element>(
  root: ParentNode,
  selector: string,
  kind: abstract new (...args: never[]) => T,
): T[] => {
  const found: T[] = [];
  for (const el of root.querySelectorAll(selector)) {
    if (el instanceof kind) found.push(el);
  }
  return found;
};

/**
 * The nearest ancestor of an event's target matching a selector.
 *
 * EventTarget says nothing about being an Element, so `e.target.closest`
 * does not typecheck. This narrows once, here, rather than at every
 * delegated handler.
 */
export const closestFrom = <T extends Element>(
  target: EventTarget | null,
  selector: string,
  kind: abstract new (...args: never[]) => T,
): T | undefined => {
  if (!(target instanceof Element)) return undefined;
  const found = target.closest(selector);
  return found instanceof kind ? found : undefined;
};
