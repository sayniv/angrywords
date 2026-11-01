---
name: Clue retirement and edit history
description: Product behavior to preserve when changing clue edits, retirement, and solve history.
---

Retiring a clue is a soft retirement: hide it from active browsing, reject old shared links with a clear retired status, and retain attempts and leaderboard rows. Editing a clue preserves progress and completed solves; if a lower attempt limit is reached by an active solver, close that attempt as failed.

**Why:** Setters need to correct or withdraw a published clue without destroying solver history.

**How to apply:** Preserve these semantics in future clue lifecycle changes, API updates, and UI copy.
