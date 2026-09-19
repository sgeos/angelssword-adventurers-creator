/** Anything with numeric indexing and a length: arrays and typed arrays. */
interface Indexable<T> {
  readonly [index: number]: T;
  readonly length: number;
}

/**
 * Index a sequence, failing with a clear message rather than yielding
 * undefined.
 *
 * noUncheckedIndexedAccess correctly types every index access as possibly
 * undefined, and tests index result sequences constantly. Rather than
 * relax the rule for convenience, this keeps it and turns an out-of-range
 * index into a message that says so, instead of a confusing comparison
 * against undefined several assertions later.
 */
export const at = <T,>(xs: Indexable<T>, index: number): T => {
  const value = xs[index];
  if (value === undefined) {
    throw new Error(`index ${index.toString()} is out of range (length ${xs.length.toString()})`);
  }
  return value;
};
