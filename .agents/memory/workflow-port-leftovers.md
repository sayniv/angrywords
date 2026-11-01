---
name: Workflow port leftovers
description: Recovering managed development workflows when a failed status masks a still-listening child process.
---

When a managed workflow is marked failed but its configured port remains in use, an older child process may still be serving. Do not retry the restart blindly: identify the exact listener and confirm its command belongs to the workflow before stopping it. Restart the configured workflow only after the port is free, then verify that its logs show a clean startup.

**Why:** in this workspace, Vite and API child processes continued listening while their managed workflows reported failure, so repeated starts collided with the occupied ports.

**How to apply:** before repeating a failed workflow restart, check the configured port and process command, stop only the confirmed stale listener, and restart the exact managed workflow.
