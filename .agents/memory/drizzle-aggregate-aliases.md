---
name: Drizzle aggregate subqueries
description: A Drizzle ORM requirement for aggregate fields exposed through a subquery.
---

When selecting aggregate SQL expressions into a Drizzle subquery, explicitly alias each expression with `.as("...")` before referencing it through the derived table.

**Why:** Drizzle rejects unaliased raw SQL aggregate fields when accessed through a subquery selection proxy at runtime, even when TypeScript accepts the query.

**How to apply:** Alias `avg`, `count`, and other raw SQL expressions in aggregate subqueries used by clue listings, ratings, and leaderboards.
