# Bidirectional Communication Protocol

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

## Overview

This document defines structured communication between the human operator and
an agentic assistant across sessions. Four working documents provide the
channels.

| Document | Direction | Persistence |
|---|---|---|
| [PROMPT.md](./PROMPT.md) | Human to assistant | Committed with each prompt cycle |
| [REVERSE_PROMPT.md](./REVERSE_PROMPT.md) | Assistant to human | Current-state block, superseded history below |
| [DESIGN_JOURNAL.md](./DESIGN_JOURNAL.md) | Assistant to human | Append-only |
| [TASKLOG.md](./TASKLOG.md) | Shared | Updated incrementally |

## The accretion problem, stated in advance

A channel that must be rewritten rather than appended to will drift, and it
drifts fastest when the work is going well, because deciding what the current
state is costs effort exactly when increments are dense.

The reference project this protocol is adapted from learned that the
expensive way. Its reverse-prompt channel reached 362 kilobytes, was split in
two to bound it, and had grown back to roughly 1,800 lines within two months,
because in practice each session prepended a section and kept the rest.

Two properties are worth separating, because only one of them matters here.
Bounded size is not the goal. Bounded currency is, meaning that a reader can
tell what is true now. The arrangement below achieves currency without
requiring anyone to delete another session's record.

`REVERSE_PROMPT.md` opens with a short current-state block, followed by an
explicit line after which everything is superseded history. A resuming reader
stops at that line. Keeping the current block short is what makes rewriting it
cheap enough to actually happen. Reasoning that would otherwise swell the
block belongs in `DESIGN_JOURNAL.md`, which is append-only and unbounded by
design.

## Forward prompt

`PROMPT.md` stages instructions from the human operator. The file is read-only
for the assistant. An assistant must never modify it, but should include it in
a commit if the operator has changed it.

Sections are comments, objectives, context, constraints, success criteria, and
notes.

## Reverse prompt

The assistant rewrites the current-state block of `REVERSE_PROMPT.md` after
completing a task, moving the previous block below the supersession line.

Sections are last updated, verification, summary, questions for the operator,
technical concerns, intended next step, and session context.

Two rules apply without exception. If blocked, document the blocker and stop
rather than proceeding on an assumption. Every task must carry verification,
because a task without verification is not complete.

## Task log

`TASKLOG.md` is the shared source of truth for current work. Both parties read
and write it.

Status is updated as work progresses rather than batched at the end. A task
marked complete carries verification evidence. A blocked task names the
specific blocker.

Same-day entries are consolidated so that history does not grow without bound.
Per-entry granularity is retained only for the active task.

## Session startup protocol

1. Read [HANDOFF.md](./HANDOFF.md) and run its validity check.
2. Read [TASKLOG.md](./TASKLOG.md) for current task state.
3. Read the current-state block of [REVERSE_PROMPT.md](./REVERSE_PROMPT.md).
4. Wait for a human prompt before proceeding.

## Task completion protocol

1. Complete the work and verify it, by the standard in
   [VERIFICATION.md](./VERIFICATION.md).
2. Update [TASKLOG.md](./TASKLOG.md) with status and evidence.
3. Rewrite the current-state block of [REVERSE_PROMPT.md](./REVERSE_PROMPT.md).
4. Commit, with a message that states what changed and what was verified.
5. Continue, or stop if blocked.

## Blocking protocol

1. Document the blocker in [REVERSE_PROMPT.md](./REVERSE_PROMPT.md) in enough
   detail for the operator to resolve it.
2. Mark the task blocked in [TASKLOG.md](./TASKLOG.md).
3. Commit the process files.
4. Stop. Do not work around a blocker without guidance.

## Concurrent sessions

These channels are single-writer and assume one active session. When more than
one assistant works at once, each writes a per-branch file under
[`handoffs/`](./handoffs/README.md) rather than competing for
`REVERSE_PROMPT.md`, appends branch-tagged entries to `DESIGN_JOURNAL.md`, and
edits only its own claimed row in `TASKLOG.md`.
