# Per-Branch Handoffs

> **Navigation**: [Process](../README.md) | [Documentation Root](../../README.md)

Mailboxes for concurrent sessions. When more than one assistant works at once,
each writes here instead of competing for
[REVERSE_PROMPT.md](../REVERSE_PROMPT.md), which is single-writer.

A mailbox is named for the branch it describes, as
`docs/process/handoffs/<branch>.md`, and **lives on the branch a reader will
look on**, which is `main` rather than the feature branch. A session doing real
work sits on a feature branch, so a mailbox committed there would be a branch
away from where it is sought, and `git show main:<path>` would return the older
copy on `main` with no error at all.

Open every mailbox by naming the branch it describes and the commit it was
written against, so that a reader who reaches the wrong file can tell. Name
that commit the same way [HANDOFF.md](../HANDOFF.md) does, meaning the tip read
before the mailbox is committed, which is commit N minus one once it lands, and
test it by ancestry rather than by equality.

Structure follows `REVERSE_PROMPT.md`, meaning last updated, verification,
summary, questions, concerns, and next step. The primary session reconciles
these back into `REVERSE_PROMPT.md` when the concurrent burst finishes, after
which the per-branch file may be removed.

A solo session does not use this directory.
