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

**An indented literal matches at every depth.** Replacing a four-space line
also rewrites the eight-space copy, the shorter string being a substring of
the longer. This duplicated a statement once. Anchor on surrounding lines.

**Rewire call sites BEFORE inserting a table that repeats their wording.**
Otherwise the substitution matches inside the table just added. Hit twice; the
third time was avoided by ordering rather than by care.

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
Element types come from the tag in the component that renders the element,
under `src/entry-browser/tabs/`, which is the source of truth. It was
`public/index.html` until the port to Tamagui and TanStack Start.

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

**The browser suite will test a stale bundle.** Playwright reuses an
already-running server outside continuous integration, so its `webServer`
command, which rebuilds, never runs when one is up. Editing a browser source
and then running `npx playwright test` tests the previous build. Two
specifications failed this way against markup that had been updated and code
that had not, which looks like a regression and is not. `npm run test:browser`
now rebuilds first; prefer it over the bare command.



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

**A test that PASSES may still be false.** One asserted that a palette sample
target bounds the sample count; it passed on the five lengths chosen and was
untrue for lengths between seven and eleven. Choosing the inputs is where the
author's belief re-enters, so loop over a range rather than over examples.
A test that passes first time against a belief brought to it deserves more
suspicion than one that fails.

**Check two formulas agree before unifying them.** Twice a quantity was
computed two different ways in two places. Both times they agreed, and both
times that was established by testing across the whole permitted range rather
than by reading. One of the pairs produced an estimate shown to a user before
a long wait.

## Removing things

**A limitation may be load-bearing.** Two things this repository's own commit
messages called an omission look like undocumented retreats from real
failures: the waist-up sprite prompt, and sending only the first reference
image. Absence of a recorded reason is not absence of a reason. Before
removing a limitation, ask what it would have been defending, and say in the
commit which answer you reached and on what evidence.

**A wrong claim in the interface is worse than a wrong comment.** A comment
misleads the next reader; a label misleads the operator while they are
deciding. One said the video shape followed the reference image, reasoned from
the request carrying no dimensions, and the first live run contradicted it.
Anything user-facing reports what was observed and marks what was not.

## Things outside the gate

**A deployment file is a dependency list maintained by hand.** Moving code into
a new module changed what `server.mts` imports, and nothing connected that to
the Dockerfile's `COPY` lines. The image kept building, the tests kept passing,
and the container exited at startup on a missing module. The failure was
months old when it was found, because finding it needed a command nobody runs.

The lesson is not about containers. It is that a rearchitecture invalidates
every hand-maintained list of the files a thing needs, and those lists live
outside the compiler's reach. After moving a module, ask what else names files
by path: packaging, images, bundler configuration, continuous integration.

**Verify a claim before refreshing it forward.** The handoff carried
"produces a container that serves on port 3001" through several refreshes,
each time marked as last exercised at a commit further behind. The assertion
was false for most of that time. An assertion nobody runs teaches the reader
to skim the ones that matter, so either exercise it or say plainly that it is
unverified and from when.

**An empty result from a convenience wrapper is a fact about the wrapper.**
`gh run list` returned an empty array and the hypothesis followed that
continuous integration had never run. The API reported 43 runs. Query the thing
itself before recording an absence as a finding.

**"Needs access to those platforms" deserves one minute of doubt.** An open item
said the Windows and Linux binaries could not be built without those platforms,
and its own second clause named continuous integration runners as the
alternative. Both built the same afternoon somebody tried. A recorded blocker is
a claim like any other and ages like one.

**A platform branch nobody runs is not tested by being read.** Three call sites
chose `npx.cmd` on Windows and none passed a shell, which Node has required for a
batch file since 20.12. The branch was correct about the filename and wrong about
the call, and only running it on Windows could show that.

**`listen EPERM` is the sandbox, not the server.** A session run under a
sandbox that forbids binding local ports saw 32 of 54 application programming
interface tests fail at once, every one with that error. The same tests passed
outside the sandbox and in continuous integration. Thirty-two simultaneous
failures sharing one system error are a fact about the environment until shown
otherwise.

**`parseInt(x) || fallback` is not `parseInt(x)` with a `NaN` check.** The
first falls back on zero too. Converting one into the other silently changed
three fields labelled "0 = match source" or "0 = auto", and every default export
then played too fast for three weeks. When converting a fallback, ask whether
zero was meant to fall through, and read the field's own label.

**A test suite that never performs the act cannot catch its failure.** The
exporter had seventeen browser specifications and none exported a file. The
defect was in the one step none of them took.

**A stop command that matches nothing reports success.** Binaries started as
`./ASAdventurer` for smoke tests were "stopped" with `pkill -f` against their
full path, which matched no process, printed nothing alarming, and was reported
as done. Five of them ran for weeks holding two ports. Confirm a stop by
checking the port or the process afterwards, never by the stop command's exit.

**`document.fonts.check` reports true for a family that has no face at all.** A
test of self-hosted fonts written with it would pass with every font file
missing. Load each face with `document.fonts.load` and require a match.

**A port in use is not a fault in the artefact.** The first container run
could not bind 3001 because a development server held it. Bind a different
host port for a check rather than reading the collision as a defect, and say
which port was used.

**A no-op can leave the system in the state the test wanted.** Assertions on
the aspect lock passed before they tested anything: the control is a styled
switch whose checkbox is hidden, so `check()` could not click it, and the lock
defaults to on. Nothing about a passing result looked unusual. Where a control
is not the element that holds the state, drive the control and confirm the state
followed.

**An assertion that observes nothing happening needs a companion.** A rule that
matched nothing would pass a "no request was made" test perfectly. Pair it with
a case that the same rule does catch.

**Restoring a superseded block into the history drops its first line.** Done
twice, the second time immediately after the first, by splitting the block on
its first newline to remove a heading that was not there. Compare section counts
before and after, and check a distinctive phrase from the old block survives.

## Porting the interface to Tamagui

Every entry here was hit during the port, and most passed the existing
specifications, which assert behaviour rather than presentation. What found
them was comparing the new page with the previous build: the bounding box of
every identified element, measured in both, and then screenshots, which found
what the measurement could not, because the defect was in elements without an
identifier.

**Tamagui's atomic rules are `:root .class`.** A plain class selector in a
stylesheet ties with them, and Tamagui's rules come later, so the class loses.
A last form row kept its margin this way. A web-only rule that must beat
Tamagui is written with `:root` in front.

**React hoists stylesheet links above inline styles.** Writing a `<link>` after
Tamagui's `<style>` in the head did not put it after; React moved it to the top,
and the stage's grid lost to Tamagui's `display: flex` for every view. Rules that
must follow Tamagui's go in an inline `<style>`, which stays where it is written.

**A Tamagui view is a flex container, and margins do not collapse in flex
layout.** The design relied on a form row's margin collapsing into a divider's,
and every such pair grew by sixteen pixels. A container whose children were
laid out as blocks is given `display: "block"`.

**A size token resolves against the spacing scale unless the font family is
named.** `fontSize: "$8"` on a text with no `fontFamily` gave 24 pixels, the
spacing token, rather than 16, the font size. Every text derives from one that
names its family.

**A font's `true` values are applied to every text.** Tamagui sets each text's
size, line height and weight from the font's default whatever the text's own
size, where the stylesheet let them inherit. Declaring no `true` entries lets
the document's inheritance apply.

**A Tamagui group is a size container.** Adding `group` to the tab buttons, to
light the label on hover, made each button's width independent of its content,
and all five collapsed onto the first. The colour went on the button instead,
and the label inherits it.

**Re-indenting generated markup re-indents the inside of a template literal.**
The converter that produced the stage components indented every line, and the
prompt's default text, held in a multi-line literal, gained eight spaces on
its second paragraph. Text that must be exact is a string with explicit `\n`,
never a literal spanning indented lines.

**Anything in `public/` ships.** Vite copies the directory into the build. The
old build's output, regenerated there once by running the old build during a
stash, was shipped beside the new one, and the worker specifications passed
against those files while the application used others. `public/js/` was then
removed from the ignore list, so that if it reappears it is seen.

**A mutation test of a browser specification needs a server already running.**
With none, Playwright starts its own, whose command rebuilds, and the rebuild
undid the deliberate breakage, so the specification passed and proved nothing.
Start the server, break the build output, then run the specification.

**A page that renders after hydration is not ready at the load event.** The
handoff object, published from a component, appeared after the specifications
had started reading it. It is published in the client entry, before hydration,
which is when the old page published it. A specification that reads the page
directly, rather than through a locator, waits for an element first.

## The mobile application

**A later lint block replaces a rule, it does not add to it.** The storage ban
and the network ban were two flat-configuration blocks over the same files,
both setting `no-restricted-globals`. The second replaced the first's options,
so `localStorage` was allowed everywhere while the configuration and this
project's instructions said otherwise. Nothing had used it yet. It was found
only by linting a deliberately failing file. After changing a restriction,
exercise it, and read `eslint --print-config` for one file per layer.

**`expo start --localhost` listens on IPv6 alone.** Metro bound `[::1]` only,
and the phone, reaching the computer through `adb reverse` on `127.0.0.1`,
could not connect. Use `--lan`, which listens on every interface.

**Metro failed with "Failed to collapse" when it watched two sibling
directories.** It represents a watched path outside the project root relative
to that root, and `../src` and `../public` broke it. Watch the repository root
and block what must not be indexed, which is how Expo arranges a monorepo.

**Expo's Babel preset ignores `.mts`.** It strips TypeScript from `.ts` and
`.tsx` only, so the shared sources reached the bundle with their types in
place and failed to parse. A wrapper transformer hands each `.mts` file to
Expo's transformer under a `.ts` name.

**Expo applies `tsconfig.json` paths to Metro by default.** The mobile
project maps `react` to its type package so that the shared sources typecheck
against the right copy, and Metro then tried to bundle `@types/react`. The
paths are for the typechecker, and `experiments.tsconfigPaths` is off in
`app.json`.

**A vendor declaration can be wrong without an error.** Expo's configuration
type names a Metro type that Metro does not export, and with `skipLibCheck`
the configuration's `transformer` section silently became an unresolved type.
Expo's declaration for its Babel transformer exports nothing, while the module
exports an object. Both appeared only as lint errors in this repository's
files. Probe a suspect type by assigning it to `number`, and look at what the
compiler says it is.

**Metro bundles a stylesheet's rules but not the files its `url()` names.**
The web view had no fonts at all, and `document.fonts` reported none loaded.
Import each file so that it becomes an asset, and register it with the font
loading interface.

**Another project's emulator can share the same `adb` server.** A device
called `emulator-5584` appeared, first offline and later online, and it was
running another project's tests. Set `ANDROID_SERIAL` or pass `-s` on every
command, and never act on a device this work did not start.

**A locked phone gives black screenshots.** That looks like a rendering
failure and is not one. Check the lock state before diagnosing.

**Expo's DOM web view has no Web Storage and no file chooser.** `localStorage`
is null in it, and a tap on a file input does nothing. Neither fails loudly: the
storage adapter treats a missing store as a blocked one and returns defaults,
so every setting silently vanished, and the input simply did not open. Both
were found only by using the screens on the phone, after the exports had
already passed. Check that a setting saved natively reaches a stage, and that
a file input opens a picker, rather than inferring either from a stage loading.

**A swipe that starts near a screen edge is Android's back gesture.** One left
the app, and the tap that followed landed on a home screen widget and opened
another application. Keep swipes away from the edges, and check the resumed
activity before every tap as well as before every capture.

**A stress test on a personal phone stresses everything else on it.** A
memory-heavy export killed the web view and left another application on the
phone not responding. Find a limit by arithmetic first, here frames times
pixels times four bytes against the phone's memory, and run only the case
that settles the question, once.

**A function prop crosses Expo's bridge as a new function on every render.**
An effect keyed on one ran on every render, and a warning meant to appear once
filled the screen. Report a once-per-load event with a module flag, which only
a reload resets.

**The memory that kills an operation may belong to another one.** The
export was made to stream and still died, and the export was measured and
found flat. The two gigabytes were Video Prep's scrubbing cache, filling in the
background at the same time. When a fix to the suspect does not help, list
everything that holds memory while it runs, not only the suspect.

**A heap figure is not a retention figure.** The page's heap read 159 and 290
megabytes after loading large clips, which looked like the clip's bytes being
held. After a forced collection it matched a fresh page's 78. Collect through
the protocol, `HeapProfiler.collectGarbage`, before calling memory retained.

**Development mode hides what a release build loads from `file:`.** Expo Go
served every script over HTTP from Metro. The standalone build loads from
`file:///android_asset/`, where the web view will not start a worker from a
`file:` address, and where Expo's production build addressed each worker with
its directory twice. Both exports failed only there. Build a release once
before calling a feature done on a phone.

**`sdkmanager --licenses` no longer accepts anything.** The current
command-line tools deprecate it, print a notice, and write no licence file, so
Gradle then refused to install the NDK. The replacement is `android sdk
install`, which also collects usage data unless given `--no-metrics`.

**A tap during a scroll animation is swallowed.** The tab bar had just
scrolled, and a tap on a tab did nothing. Wait for the motion to end.

**A specification that passes without the fix proves nothing about the
fix.** The phone's web view clipped a mode selector label at 384 pixels. A
specification at that width, and a rule meant to fix it, were written, and the
specification passed with the rule removed and with the fonts blocked. The
hypothesis was wrong, the rule was reverted, and the cause is still to be
found in the web view itself.

## Working discipline

**Commit each unit as soon as it is clean.** Recovery from a botched scripted
edit is cheap when the file is committed and expensive when it is not.

**State what was not verified.** Claims of completeness that outrun the
evidence are worse than a narrower claim, because they are believed.

**Measure a figure before putting it in a commit message.** A line count was
written from memory into a message and was wrong by eighteen. Commit messages
are read later as evidence, so a number in one is a claim like any other.
