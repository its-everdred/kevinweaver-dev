# Deferred findings — site-rewrite

Ledger for work discovered during the run that is deliberately **not** absorbed into the
ticket that found it. `root-issue.md` makes this ledger the terminal-condition escape
hatch: discovered work is recorded here rather than by extending the feature boundary.

Referenced as a recording target by KW-017, KW-019, KW-020, KW-023, KW-025, KW-030 and
KW-032.

## Ownership — unresolved, decide before publication

This file is **not** declared in any ticket's `write_surfaces` in `build-order.json`.
Seven tickets across waves 3, 5, 6 and 7 are instructed to append to it, four of them
(KW-017, KW-019, KW-020, KW-023) in the same wave. Concurrent appends to one undeclared
file are exactly the collision that DEC-005's write-surface partition exists to prevent,
and because the surface is undeclared the aiur validator cannot see it.

Pick one before the pack is published:

1. **Executor-owned (recommended).** Tickets record discovered work in the pull-request
   body only; the Executor transcribes into this ledger between waves. No ticket write
   surface changes, and the partition holds unmodified.
2. **Ticket-owned.** Add `docs/build-orders/site-rewrite/deferred-findings.md` to the
   `write_surfaces` of all seven tickets. This is honest but will make
   `validate_surface_conflicts` warn on every unordered pair, which is the correct signal
   and should then be dispositioned with `conflict_exceptions`.

Until this is decided, treat option 1 as in force: **record findings in the pull-request
body and do not commit to this file from a ticket branch.**

## Entries

| Date | Found by | Owning ticket | Finding | Disposition |
|---|---|---|---|---|
| _(none yet)_ | | | | |
