# Design Journal

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Append-only. Reasoning that would otherwise make
[REVERSE_PROMPT.md](./REVERSE_PROMPT.md) grow without bound belongs here.
Entries are never edited or removed, and newest goes at the bottom.

---

## 2026-09-19 — Knowledge graph adopted

Adapted from a reference project at the operator's direction. Three
adaptations were deliberate rather than mechanical.

The reference separates a bounded reverse prompt from an unbounded journal,
and records honestly that the split failed to bound anything, because each
session prepended to the bounded file and kept the rest. The lesson taken is
that bounded currency matters and bounded size does not. `REVERSE_PROMPT.md`
here carries an explicit supersession line, so a reader knows where the
present ends without anyone having to delete another session's record.

The reference validates its handoff by ancestry and by content, having had
hash-based checks fail three times. Only content checks were carried across.
Ancestry validation assumes a long-lived version branch, which this project
does not have.

`AGENT_PITFALLS.md` has no counterpart in the reference. Every entry is a
mistake made during the TypeScript conversion of this repository. It exists
because those mistakes were individually cheap to avoid and collectively
expensive to discover, and because none of them are the kind a model avoids by
being careful in general.

## 2026-09-19 — Upstream pull request 1 reimplemented

Five increments rather than one change, following the decomposition that the
audit of that pull request recommended. It bundled roughly eleven concerns
across 96 commits under a title naming one of them.

Three parts were not reproduced, and the reasoning is worth keeping because
each is a pattern rather than an incident. An OAuth flow presenting as another
vendor's own client risks the user's account rather than the developer's. A
convenience button that needs the Docker socket mounted trades host root for a
restart. A proxy that attaches a credential to any address a caller names is a
credential exfiltration route, whatever its intent.

The general lesson from the exercise: in each case the safe version cost
nothing in capability. The allowlisted video fetch, the restricted ComfyUI
endpoint set, and the API-key path all do what the original did. Security and
capability were not in tension here, which suggests the original's choices
were expedience rather than trade-offs.

One recurring process failure. Twice a count assertion in a browser
specification broke because a provider was added, and the first time I patched
the number instead of deriving it. The second occurrence cost the same
diagnosis again. Deriving from the exported provider order was two lines and
should have been the first response.

A second, sharper one. Completing the environment key fallback made six tests
pass in continuous integration and fail on my own machine, because a key was
exported in my shell. A test that depends on ambient environment is worse than
a failing test, since it fails only where nobody is looking.


## 2026-09-19 — Ancestry validation adopted, reversing an earlier judgement

The knowledge graph entry above records that only the content half of the
reference project's validity check was carried across, on the reasoning that
ancestry validation assumes a long-lived version branch which this project
does not have. That reasoning was wrong, and the operator corrected it.

Ancestry validation does not require a long-lived branch. It requires only a
reachable commit, and `main` supplies one. What the reference actually
demonstrates is a containment test, not a comparison against a release line,
and containment holds on a single-branch repository exactly as well.

The omission produced a visible cost within one session. The header named the
anchor as `main` at `69addb8` while the tip was `2c0aef0`, because the refresh
commit had itself advanced the tip. Nothing was broken, since the check below
the header was by content. A resuming session nonetheless had to reason its
way past an apparent mismatch that the wording invited, which is precisely the
failure the reference warns against and had already suffered.

Two rules now hold. The anchor is the tip read before the refresh is
committed, which makes it commit N minus one once the refresh lands, since a
file cannot record the hash of the commit that introduces it. The anchor is
tested by containment rather than equality, so it stays valid however far the
tip subsequently moves, and it also survives a refresh that takes more than
one commit.

The general lesson is about adaptation rather than about git. Declining part
of a convention borrowed from a working system requires a reason that the
system itself does not already refute. The reason given here was a property of
the reference that was never the reason the convention existed.

## 2026-09-19 — Three-layer rearchitecture, first three increments

The pattern comes from `~/projects/re/1830/`, whose architecture document
states it in four lines and then says the useful part: the rule is enforceable
by inspection, and if a core crate needs a clock or a socket it declares a
trait method. What transfers is not the shape but that sentence. A layering
nobody can check is a naming convention.

The TypeScript equivalent of a crate is a project, and the equivalent of a
manifest is its `lib` and `types`. Withholding both platform libraries gives
`no_std` almost exactly, and where it falls short is worth recording, because
the shortfall is not obvious. Rust's clock and generator live in `std`, so
excluding `std` excludes them. `Math.random` and `Date` are the language, so
no library setting can exclude them and a lint rule is the only instrument.
The gap is small and it is exactly where non-determinism enters.

Three findings that cost nothing to state now and would have been expensive to
discover later.

**A search and a compiler answer different questions.** A search over the
sources, with comments and string literals stripped so that prose about
`localStorage` would not count, reported twelve modules portable. The core
project refused two of them. One named `ImageData` in nine signatures, which
is a type and not a global, so no pattern for globals could have found it. The
other built a query string with `URLSearchParams`. The search established what
its patterns matched. Only the compiler established what the files required.

**A module that reaches for a platform facility has not established that it
needs one.** `gif-composite` said in its own header that it was the one part
of Graphics Interchange Format handling that needed a canvas. It used a canvas
as a scratch buffer, calling only `putImageData`, `getImageData`, and
`clearRect`. Compositing under disposal rules is arithmetic. Rewritten against
plain arrays it became core and gained twelve tests where it had none. The
question to ask before declaring a capability is what the facility is being
asked to compute.

**Inverting a capability found three defects that were not what it was for.**
Writing `KeyValueStore` revealed that four core parsers took `string | null`,
which is the Web Storage return type rather than this project's convention, so
the platform's idea of absence had reached into the core's signatures. It
revealed that `hasCredential` returned a boolean and its caller therefore
re-checked for absence on the next line, which is the shape the narrowing
convention exists to prevent. And it revealed that none of the twenty-seven
call sites handled a store that throws, which a browser with site data blocked
supplies on the first property access, before any method runs.

That last one is the argument for adapters stated concretely. Twenty-seven
places each have to remember the failure mode. One adapter has to remember it
once, and the reason it is one adapter rather than a convention is a lint rule
naming the single exempt file.

**What the entry layer cost.** Separating platform from entry was not a
rename. All four stage modules imported `app.mts`, so the entry point was a
dependency of everything that depended on it, and the property that makes an
entry point one is that nothing imports it. The module split into a 790 line
shell in the platform layer and a 54 line entry point. That the split was
clean is not luck: the shared surface was the exported half and the bootstrap
was the unexported half, which is what those two words had always meant.

**On preserving behaviour.** Writing the first tests for `gif-composite` found
two divergences from the format it implements. The temptation to correct them
while moving the file was strong, the code being unreachable from production
and the correct behaviour being published. It was not taken, because a
refactor that quietly alters behaviour is a refactor nobody can review, and
because the same reasoning governed the original conversion. The divergences
are pinned by tests that say at their own site that they characterise rather
than specify.

## 2026-09-19 — The capability list was wrong, and the correction is the entry

The rearchitecture finished its architectural half today. Three capabilities
inverted, one resolved without an interface, and two struck off. The last of
those is the part worth writing down, because the mistake was in the method
rather than in an answer.

**The list was a count of what the browser layers reach for.** That is a
question a search can answer, which is why it was the question asked. It is
not the question the architecture poses. The architecture asks what the core
would *call* if it held the logic, and those two produce different lists.

Logging survived on the first list with twelve sites and died on the second,
every site being a user interface diagnostic reporting that a module
initialised or that an export failed. Binary payloads survived with forty and
died the same way, every site constructing a `File` for a video element or an
object URL for a `src` attribute. Had either been given an interface, it would
have had a declaration, an implementation, and no caller, and it would have
looked like progress.

The rule that saved both was already written down here before either was
examined: an interface is declared when a consumer for it exists. Applying it
honestly means the list sometimes gets shorter without anything being built.

**Randomness is the interesting middle case.** It has a genuine core
consumer, the seeds that reach ComfyUI, and it still wants no interface. The
core takes the value rather than the generator, following the reference
project's rules crate, which makes a run reproducible from its inputs and
makes non-determinism impossible rather than merely discouraged. So the test
is not "does the core need this" but "does the core need to *call* this".

## 2026-09-19 — What inverting a capability actually bought

Three findings, none of which was the reason for the work.

**The tested fraction was measuring the wrong thing.** `grok-video-core.mts`
had every pure part of the Grok exchange extracted and covered: the request
shape, the poll classification, the backoff schedule, the limits. The loop
that uses them had no test, because a loop needs a clock and a network. So the
easy parts were tested and the part that decides what happens was not, and no
count of tests would have shown it. That is the shape of the gap, and it
generalises: extraction stops exactly where the capabilities begin, which is
exactly where the interesting code is.

**Two copies that agree are still a problem.** The video stage computed its
output frame count in a switch reading `loopPoint * 2` while the core computed
`n + max(0, n - 2)`. They agree, which was checked across the whole permitted
range rather than assumed. Nothing was wrong and nothing kept it right. The
unification is worth the same as a bug fix and reads like none.

**An assertion in a header is not evidence.** `gif-composite` said it was the
one part of Graphics Interchange Format handling needing a canvas. It used a
canvas as a scratch buffer. The header had been written by whoever moved it
there, and repeating a claim in a comment is how it survives review.

One process note. Every gate added across the five increments was exercised
against a deliberately failing file before being believed, and two of them
would otherwise have been reported as working while matching nothing. That
practice cost about a minute each and is the only reason the claims in
`LAYERING.md` are worth anything.
