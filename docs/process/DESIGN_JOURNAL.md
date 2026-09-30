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

## 2026-09-19 — What the extraction actually found

Four increments of moving arithmetic out from under the Document Object Model.
The tests were the goal, and the duplication was the surprise.

**Five copies. Four copies. Twice. Seven times.** The exporter's placement
arithmetic existed in five identical copies, each preceded by the same two
lines of sanitising. The frame selection existed in four, one of them counting
rather than collecting. The named-colour table existed in two, and the second
had grown an injection parameter so that the core could be handed the first.
The constant `0.001` appeared seven times across two stages, serving two
different purposes.

None of that was visible while the code sat inside event handlers. It becomes
visible the moment one asks what a function computes, because the answer is
the same sentence four times over.

**Agreement is not a reason not to unify.** Twice a quantity was computed two
different ways in two different places, and both times the two agreed. The
frame count agreed; the loop count agreed. Nothing kept either pair agreeing,
and one of them produced the estimate a user reads before waiting for an
export. The unification reads like tidying and is worth the same as a bug fix.

**One number, two meanings, is worse than two numbers.** `0.001` kept a seek
clear of the end of a clip and separately decided that a player was already
close enough to skip a seek. A single named constant would have been an
improvement in appearance and a trap in fact, tying two unrelated quantities
together so that tuning one silently moved the other.

**Invalid states were representable and nobody had noticed.** Ping-pong and
reverse were two booleans. Both true meant nothing, and every reader had to
know which won. One field with three values removed the question.

## 2026-09-19 — On preserving behaviour that is wrong

Five behaviours were preserved rather than corrected in this work, and it is
worth stating the test that was applied, because the temptation each time was
to fix it while passing.

A histogram bucket is identified by its floor, so every reconstructed colour
is biased dark by up to three levels. The placement rounds four values
independently, so a centring remainder falls on one side. `clampSeekTime`
applies its lower clamp before its upper, so a sub-millisecond clip yields a
negative time. `hexToRgb` does not validate and yields NaN. The Graphics
Interchange Format compositor applies disposal from the wrong frame.

The test applied was whether the commit was moving code or changing it. A
commit that does both cannot be reviewed, because a reader cannot tell which
difference in behaviour was intended. So each is preserved, pinned by a test
that says at its own site that it characterises rather than specifies, and
where a decision is needed it is recorded in `decisions/OPEN.md` rather than
taken quietly.

Two of them are genuinely unreachable, the negative seek time and the
malformed hex, and the temptation there was strongest: nothing could break.
But an unreachable case fixed silently still teaches the next reader that this
codebase changes behaviour in refactoring commits.

## 2026-09-30 — What two days of live running taught, and what it cost me

The operator put credit on an account and ran the pipeline against real
services. Two days of that produced more information than every mocked test
before it, and most of it was unflattering.

**Four claims I had written down turned out to be wrong**, and the pattern
across them is worth more than any one.

I asserted that frame 0 is a master neutral frame. That was the operator's
hypothesis, offered while correcting a button design, and it reached a commit
message and two code comments within one exchange as though established.

I wrote "Follows your reference image" into the interface, reasoning that
since nothing about shape is sent to Gemini the result must follow the
reference. The first live run returned landscape from a portrait sprite.

I called the waist-up prompt an abandoned workflow and the single-image
reference "an omission rather than a finding". Both now look like
undocumented retreats from real failures. The bust directive reserves
headroom above the character and accepts a bottom crop, which is precisely a
defence against the crop-and-zoom the live runs produced. Somebody met this
and retreated, and wrote the retreat into the prompt without writing down
why.

**The common failure is treating the absence of a recorded reason as the
absence of a reason.** A limitation with no comment beside it is not thereby
an oversight. Before removing one, ask what it would have been defending, and
say in the commit which answer you reached and on what evidence. I have added
that to the pitfalls, because I did it twice in two days.

**The second lesson is about where a wrong claim lives.** A wrong comment
misleads the next reader. A wrong label in the interface misleads the operator
while they are making decisions, and mine told them the output shape was under
their control through the reference when it was not. Anything user-facing
should report what was observed and mark what was not.

## 2026-09-30 — Tests that were wrong, and what they were worth anyway

Five of my own tests failed on changes this period, and not one was a
regression in the code.

Two encoded a non-circular playback model that the operator then corrected:
playback wraps, so an end before a start is a loop crossing the seam rather
than an error. Refusing it had also made frame 0 unreachable from inside a
loop.

One asserted a clamp that `clampSeekTime` does not perform. One asserted a
tolerance boundary at a magnitude where floating point makes the boundary
unassertable. And one asserted that sprite zoom keeps the character's feet
anchored; it does not, and it fails in the opposite direction from my guess,
pushing the feet down toward the image edge rather than lifting them.

**Every one of those failures produced something worth keeping.** The
circular model, an accurate doc comment, a boundary test at a magnitude where
it means something, and a recorded finding about zoom drift. A test written
from a wrong premise still interrogates the code, and the interrogation is
most of the value.

What it does not do is validate the premise. So a test that passes first time
against a belief I brought to it deserves more suspicion than one that fails.

## 2026-09-30 — A passing test that was false, and why it was checked

The previous entry ends by saying that a test which passes first time against
a belief brought to it deserves more suspicion than one that fails. That
advice paid within the hour.

While naming the exporter's palette sampling, I asserted that its six-frame
target bounds how many frames are read. The test passed. It was false: the
stride is `floor(total / min(6, total))`, which reaches one for any length up
to eleven, and the loop then walks every frame. Eleven frames are read against
a target of six. The test had passed only because the lengths I happened to
choose did not include eight through eleven.

Worse, the routine I had just written reported the target as the sample count,
which was untrue at those lengths. I had invented a field and filled it with a
number that did not describe what happens.

Both are corrected, the count now being derived from the stride, and the test
now walks forty lengths rather than five chosen ones. **Choosing the inputs is
where the belief re-enters.** A loop over a range is not merely more thorough;
it removes the author's hand from the selection, which is the part that was
doing the damage.

## 2026-09-30 — Two formulas for the same quantity, and this time they disagreed

Earlier in this session two pairs of duplicated formulas turned out to agree,
and I recorded that agreement is not a reason to leave a duplication alone.
This is the case that argument was anticipating.

The video stage rounded a duration into a frame count and the exporter floored
it. They differ whenever the fractional part reaches a half, which real
durations reach: 9.99 seconds at thirty frames gave 299 against 300. Because
the handoff carries one figure and the clamp uses the other, a loop end was
being clipped and the last real frame of some clips was unreachable.

The thing that made it findable was not suspicion of either formula. It was
looking at the two together, which only happened because both had been pulled
toward the same module by earlier extraction. **A duplication that spans two
files is invisible; one that spans two lines is not.** That is an argument for
consolidation that has nothing to do with brevity.

One procedural note. I computed the disagreement across seven realistic
durations before changing anything, rather than reasoning that floor and round
must differ somewhere. Two of the seven disagreed. That took a minute and is
the difference between a defect report and a plausible story.

## 2026-09-30 — The assertion nobody ran, and what it was hiding

The handoff's validity check has seven assertions. Six describe the tree and
are checked every time the file is refreshed. The seventh said the container
serves on port 3001, and was marked as last exercised at a commit that fell
further behind with every refresh. I had carried it forward four times.

It was false. The image built, and the container exited immediately on
`ERR_MODULE_NOT_FOUND` for `src/core/providers.mts`. The runtime stage copied
`server.mts` and `public/`, which was right while the server was
self-contained; the layering work then gave the server an import from the
portable core, and nothing in the repository related those two facts. The
compiler never saw the Dockerfile. The tests never ran the image.

**The defect was mine, and the mechanism that hid it was the refresh.** Each
time I rewrote the handoff I reproduced a claim I had not checked, and
annotated it with an anchor that made the staleness visible without making it
actionable. A claim marked "last exercised at an old commit" reads as
bookkeeping rather than as a warning, and I treated it as bookkeeping.

Two things follow.

The narrow one is a test. `deployment.test.mts` computes the server's runtime
import closure and asserts the final image stage carries every file in it. I
confirmed it fails on the real defect by restoring the broken Dockerfile and
watching it name `src/core/providers.mts`, which matters more than watching it
pass: a check written against a fix it was derived from will pass either way.
It reads text, so it does not establish that the image starts, and it says so.

The broad one is that **a rearchitecture invalidates every hand-maintained
list of files, and those lists live outside the compiler's reach.** I spent
five increments moving modules and reasoning carefully about which layer may
import which, with lint rules enforcing the directions. All of that was inside
the type system's view. The Dockerfile was four lines of text naming paths, and
it was the only place the reorganisation actually broke.

A smaller finding came out of the same afternoon and has the same shape. When
loops became circular I updated `describeLoop` and the readout that calls it,
and missed a second place that judged the same question with a plain
subtraction. The information panel therefore hid loops that the readout beside
it called valid, for exactly the seam-crossing case the circular change was
made to support. Two places deciding one question is the defect; the panel now
asks `describeLoop` like everything else.

Both are the same error at different scales: I changed a definition and found
its consumers by the ones I could see.

## 2026-09-30 — Unifying the arithmetic exposed where the disagreement really was

Earlier today I unified the frame count, so that one duration and one rate give
one answer everywhere. It worked, and it was worth doing. It also turned out to
be the wrong layer.

Writing browser coverage for the exporter, an assertion failed with a number I
had not predicted, and chasing it produced this: the exporter reports sixty
frames for the clip that Video Preparation reports as thirty-eight. Same clip,
same file, same machine. The count is derived by one shared routine, and the
routine is not at fault. The rate handed to it is.

There are three paths and they decide differently. Video Preparation measures,
by playing the clip and counting decoded frames. A file dropped on the exporter
is assumed to be thirty frames per second, which the source labels a default
assumption. A clip arriving by handoff carries Video Preparation's figure. Two
stages, three answers, and the two failure modes point in opposite directions:
the assumption is exact for a thirty frame clip and proportionally wrong for
anything else, while the measurement is exact whenever the host keeps up and
low when it does not.

**Consolidating the arithmetic is what made this findable.** While two stages
each computed their own count from their own rate, a disagreement in the count
could be blamed on either, and I did blame the arithmetic, correctly as far as
it went. With one routine and one formula, the only remaining place for two
answers to come from is the input, and the disagreement had nowhere left to
hide. That is a better argument for consolidation than brevity ever was: **it
does not merely remove a duplicate, it relocates every remaining disagreement
to a smaller space.**

Two notes on method.

The failing assertion was mine and wrong. I asserted that an inverted frame
range selects nothing, and the exporter returned the clip minus nine, which is
the wrap. The code is right and my expectation was stale: I made loops circular
myself, and then wrote a test assuming a range is not. Being wrong in the
direction of the code having been improved is a pleasant way to be wrong, but
it is the fourth time this session that a belief I brought to a test was the
thing at fault.

And the aspect lock tests passed before they tested anything. The lock is a
styled switch whose checkbox is visually hidden, so my `check()` call could not
have clicked it; the assertions passed because the lock defaults to on. The
repair was to drive the visible span, which also asserts the switch is wired to
the input. **A no-op that leaves the system in the state the test wanted is the
hardest kind of false pass to notice**, because nothing about the result looks
unusual.
