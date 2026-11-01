---
name: API TypeScript tests
description: Runtime compatibility guidance for API tests importing workspace TypeScript modules.
---

Node's built-in TypeScript stripping does not resolve the workspace's extensionless TypeScript imports. Run these tests with `tsx --test` when test imports cross into source modules that use that convention.

**Why:** Direct Node test runs failed to resolve schema imports used by the account-scoping helpers.

**How to apply:** Keep the API test script on `tsx --test` if tests begin importing shared workspace source modules.
