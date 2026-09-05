// ===================================================================
// Control corpus. EVERY line here must produce ZERO findings.
//
// probe.mts checks that bad things fail. This checks that good things
// still pass, which is the failure mode that actually gets a strict
// config deleted. A configuration tightened until it rejects ordinary
// correct code is not stricter, it is broken, and nothing in probe.mts
// would notice.
//
// Lives at tools/probe/control.mts alongside probe.mts, and is copied
// into the project by CI the same way.
//
// If you tighten a rule and this file starts erroring, the tightening is
// wrong unless you can articulate why the construct below is unsafe.
// ===================================================================

// Discriminated-union Result. The shape this config pushes you toward,
// since type predicates are banned.
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const parse = (raw: string): Result<number, string> => {
  const n = Number(raw);
  return Number.isNaN(n) ? { ok: false, error: "not a number" } : { ok: true, value: n };
};

// readonly interfaces and readonly array parameters
export interface User { readonly id: string; readonly name: string }

export const findUser = (users: readonly User[], id: string): User | undefined =>
  users.find((u) => u.id === id);

export const upper = (s: string): string => s.toUpperCase();

// async/await with an explicit non-truthiness check and explicit
// stringification, both of which this config requires
export async function load(url: string): Promise<Result<string, string>> {
  const r = await fetch(url);
  if (!r.ok) { return { ok: false, error: `HTTP ${r.status.toString()}` }; }
  return { ok: true, value: await r.text() };
}

export const total = (xs: readonly number[]): number =>
  xs.reduce((acc, x) => acc + x, 0);

// String-literal union standing in for an enum, with an exhaustive switch.
// This is the idiom erasableSyntaxOnly pushes you toward and it must not
// be collateral damage.
type Kind = "a" | "b";
export const describe = (k: Kind): string => {
  switch (k) {
    case "a": return "first";
    case "b": return "second";
  }
};

// Private class fields, which are a runtime feature rather than a
// type-only one, so erasableSyntaxOnly permits them.
export class Service {
  readonly #name: string;
  constructor(name: string) { this.#name = name; }
  label(): string { return this.#name; }
}

// Nullish coalescing, and `as const`, both deliberately permitted.
export const maybe = (x: string | undefined): string => x ?? "default";
export const config = { retries: 3 } as const;
