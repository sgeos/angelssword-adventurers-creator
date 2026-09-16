/**
 * Index an array, failing with a clear message rather than yielding
 * undefined.
 *
 * noUncheckedIndexedAccess types every index access as possibly undefined,
 * which is correct. In a test an out-of-range index is already a failure,
 * so this keeps the rule and makes the failure say what went wrong instead
 * of surfacing as a confusing comparison against undefined.
 */
export const at = <T,>(xs: readonly T[], index: number): T => {
  const value = xs[index];
  if (value === undefined) {
    throw new Error(`index ${index.toString()} is out of range (length ${xs.length.toString()})`);
  }
  return value;
};
