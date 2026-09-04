// ===================================================================
// Escape-hatch probe. EVERY line below must produce an error.
//
// This file exists to fail. Drop it into a project using the sibling
// configs, run `tsc --noEmit` and `eslint`, and check that each numbered
// item is reported. A line that stops erroring means that hatch has
// reopened, whether through a config edit, a dependency upgrade, or a
// rule deprecation.
//
// Run it in CI. It is the cheapest check that the configuration still
// does what the README claims. Exclude it from normal builds.
//
// Measured against typescript 5.9.3 / typescript-eslint 8 / eslint 9:
// 5 tsc errors and 37 eslint errors. The exact counts move between
// releases, so do not assert on them. What matters is that no numbered
// item goes silent. Comments name the rule so a disappearance is
// traceable to a specific cause.
//
// The final section is the control: those lines are legal and MUST stay
// clean. `as const` and typeof-narrowing are deliberately permitted, and
// a config that flags them is over-tightened rather than correct.
// ===================================================================

// 1. `any` — no-explicit-any
export const a: any = 1;

// 2. `as any` — consistent-type-assertions + no-explicit-any
export const b = JSON.parse("{}") as any;

// 3. plain `as` — consistent-type-assertions + no-unsafe-type-assertion
export const c = JSON.parse("{}") as string;

// 4. non-null assertion — no-non-null-assertion
export const d: string | null = null;
export const e = d!;

// 5. suppression comments — ban-ts-comment (all three forms banned)
// @ts-expect-error a plausible-sounding justification goes here
export const f: number = "not a number";

// 6. lint suppression — must be inert under noInlineConfig
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const g: any = 1;

// 7. lying type predicate — no-restricted-syntax (TSTypePredicate)
export function isString(x: unknown): x is string { return true; }

// 8. assertion signature — no-restricted-syntax (TSTypePredicate)
export function assertString(x: unknown): asserts x is string {
  if (typeof x !== "string") { throw new Error("not a string"); }
}

// 9. overload unrelated to its implementation — no-restricted-syntax
//    (TSDeclareFunction). Unchecked against the implementation by design.
export function over(x: string): number;
export function over(x: unknown): unknown { return x; }

// 10. ambient declaration — no-restricted-syntax (VariableDeclaration[declare])
declare const fabricated: { shape: string };
export const h: string = fabricated.shape;

// 11. wide structural types — no-restricted-types
export const i: Function = (): void => { return; };
export const j: object = {};
export const k: {} = 1;

// 12. truthiness — strict-boolean-expressions
export function useTruthy(s: string): string { if (s) { return s; } return ""; }

// 13. loose equality — eqeqeq
export const l = 1 == 1;

// 14. dynamic evaluation — no-eval
export const m = eval("1");

// 15. var — no-var
export var n = 1;

// 16. floating promise — no-floating-promises
export async function t(): Promise<void> { return; }
export function u(): void { t(); }

// 17. implicit stringification — restrict-template-expressions
export const o = `count: ${1}`;

// 18. bivariant method shorthand — method-signature-style
export interface P { q(x: number): void }

// 19. missing return type — explicit-function-return-type
export function r(x: string) { return x; }

// 20. enum — tsc TS1294 (erasableSyntaxOnly)
export enum S { A }

// 21. namespace — tsc TS1294 + no-namespace
export namespace T { export const v = 1; }

// 22. unchecked index access — tsc TS2322 (noUncheckedIndexedAccess)
export function idx(xs: readonly number[]): number { return xs[0]; }

// 23. non-exhaustive switch — switch-exhaustiveness-check
type Shape = { kind: "a" } | { kind: "b" };
export function area(x: Shape): number {
  switch (x.kind) {
    case "a": return 1;
  }
}

// 24. class method overload — no-restricted-syntax
//     (TSEmptyBodyFunctionExpression). Distinct from item 9: a class
//     method overload is a different AST node and needs its own selector.
export class Cls {
  m(x: string): number;
  m(x: unknown): unknown { return x; }
}

// 25. ambient module declaration — no-restricted-syntax
//     (TSModuleDeclaration[declare=true]). Fabricates types for a package
//     the checker never sees, which is how `any` re-enters a codebase that
//     has otherwise banned it.
declare module "fabricated-pkg" { export const q: string; }

// --- Must NOT error: these are legal and deliberately permitted ------
// Ordinary class methods must stay clean; a config that flags this is
// over-tightened rather than correct.
export class Ok { n(x: string): number { return x.length; } }
export const allowed = { x: 1 } as const;
export function narrowProperly(x: unknown): number {
  return typeof x === "string" ? x.length : 0;
}
