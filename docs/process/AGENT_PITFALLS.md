# Agent Pitfalls

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Every entry records a mistake actually made in this repository, not a
hypothetical. Each is cheap to avoid once named and was expensive to discover.
Read this before a session that edits many files.

## Verification

**Check exit codes, not output text.** A lint run was checked with
`grep -c 'error '`, which does not match `SyntaxError:`. A configuration that
ESLint could not parse was reported as clean. Use `cmd >/dev/null 2>&1 && ...`
and let the process say whether it succeeded.

**A suite that runs zero tests is not a passing suite.** After a rename, a
glob matched nothing and the runner reported success over an empty set. Assert
on the count, not merely on the exit status.

**Verify after the final edit, not before it.** Results recalled from earlier
in a session describe a tree that no longer exists.

## Scripted edits

**A regular expression will rewrite the definition it was meant to protect.**
Replacing `this._exportCancelled` with `this.cancelled()` also rewrote the body
of `cancelled()`, producing infinite recursion. Exclude the definition site.

**A blanket substitution will hit a site where it is wrong.** Prefixing calls
with `void` to silence floating promises also rewrote an `await` into
`await void`. Read every site a pattern will touch, and run the typechecker
immediately afterwards.

**Line-indexed edits delete more than intended.** A scripted deletion removed
twenty-five lines too many, and an insertion landed inside an unrelated block
because the loop stopped at the first closing brace rather than the block's
own. Read the exact extent first and assert on its first and last lines.

**BSD `sed` does not support `\b`.** On macOS a word-boundary substitution
silently does nothing. Only the compiler caught it. Use Python for anything
involving word boundaries.

**Do not copy indentation out of displayed output.** Text shown through
`sed 's/^/  /'` carries two extra spaces. Pasting it into a replacement makes
the pattern match nothing, silently.

## Reading tool output

**Multi-range `sed` output has no separators.** Output from
`sed -n '1,5p;40,45p'` runs the ranges together, and line 5 appears adjacent to
line 40. A defect was reported on this basis that did not exist. Use one range
per invocation, or print line numbers.

**A shell loop splits filenames on whitespace.** `Start ASAdventurer.command`
was reported missing because a `for` loop split it in two. Quote, or avoid
iterating filenames in the shell.

## Types

**Never infer a type from an identifier.** Five element lookups were typed from
their names rather than from the markup, producing five runtime failures.
Element types come from the tag in `public/index.html`, which is the source of
truth.

**Read a signature before writing against it.** A return type was guessed as a
tuple when the function returns an object. Open the definition.

## Reporting

**Distinguish a defect that existed from one introduced by the work.** A
conversion fault, found and fixed during conversion, was reported upstream as a
pre-existing bug. Only faults present in the original belong in a report to the
original project, and establishing that requires checking the original rather
than recalling what the compiler complained about.

**Absence in one place is not absence everywhere.** A field was reported as
never assigned because it is absent from one payload. It is assigned on the
parent object, five times. Search for the producer before concluding there is
none.

## Process documents

**An anchor written as the current tip is stale before it is read.** A handoff
described `main` at a hash, and committing the handoff advanced `main` past it.
The check below the header was by content and still sound, but the wording
invited a resuming session to conclude the file was stale. Record the tip read
before the refresh is committed, which is commit N minus one once it lands, and
test it by containment with `git merge-base --is-ancestor` rather than by
equality.

## Tests

**`assert.equal` narrows.** Its `asserts actual is T` signature means a
defensive `?.` or `?? []` written after it is dead code, which the lint
reports as an unnecessary condition. Assert once that a value is present,
then use it plainly. This was hit four separate times in one session.

**A boundary cannot always be asserted at a realistic magnitude.** A
tolerance of `0.001` tested at three seconds measures floating point rather
than the function: `3 + 0.001` is not representable, so the difference comes
out as 0.0009999999999998899 and falls inside the tolerance. Assert the
boundary where the arithmetic is exact and record the practical consequence
separately.

**A test that fails may be the test.** Two did in one session. One asserted a
clamp the function does not perform, the other the boundary above. Read the
function before assuming the code is wrong, and if the behaviour is merely
surprising rather than wrong, pin it as characterisation and say so.

**Check two formulas agree before unifying them.** Twice a quantity was
computed two different ways in two places. Both times they agreed, and both
times that was established by testing across the whole permitted range rather
than by reading. One of the pairs produced an estimate shown to a user before
a long wait.

## Working discipline

**Commit each unit as soon as it is clean.** Recovery from a botched scripted
edit is cheap when the file is committed and expensive when it is not.

**State what was not verified.** Claims of completeness that outrun the
evidence are worse than a narrower claim, because they are believed.

**Measure a figure before putting it in a commit message.** A line count was
written from memory into a message and was wrong by eighteen. Commit messages
are read later as evidence, so a number in one is a claim like any other.
