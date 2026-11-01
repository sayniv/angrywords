# Clue Sprint test fixtures

This workflow creates 20 clearly labeled clues and synthetic solver-progress rows in the development or test database. It never creates a Clerk user, changes a profile, or touches unrelated clues. Synthetic leaderboard solvers have no profile records, so the app displays them as **Guest solver** on fixture clue boards; their runs are excluded from the site-wide solver leaderboard.

## Requirements

- Use a development or test database only. Both commands stop unless `NODE_ENV` is exactly `development` or `test`; production is always blocked.
- `CLUE_FIXTURE_USER_ID` must be the ID of an existing Clerk test account with a completed Clue Sprint profile. The script reads its current public ID for clue attribution and does not update it.
- Confirm the action explicitly with `CLUE_FIXTURES_CONFIRM=YES_SEED` or `CLUE_FIXTURES_CONFIRM=YES_CLEANUP`.

Run commands from the workspace root, replacing the example ID with the actual test account ID:

```sh
NODE_ENV=development \
CLUE_FIXTURE_USER_ID=user_replace_with_existing_test_account \
CLUE_FIXTURES_CONFIRM=YES_SEED \
pnpm --filter @workspace/api-server run fixtures:seed
```

Seeding is repeatable: it replaces only marked fixture clues under that account's deterministic fixture slug prefix, including the solver rows belonging to those clues. Any slug-prefix collision with an unmarked clue causes the seed to stop without changing rows.

Remove just this fixture set with:

```sh
NODE_ENV=development \
CLUE_FIXTURE_USER_ID=user_replace_with_existing_test_account \
CLUE_FIXTURES_CONFIRM=YES_CLEANUP \
pnpm --filter @workspace/api-server run fixtures:cleanup
```

Cleanup deletes only clues that both belong to the supplied setter account and have the workflow's account-specific slug prefix and fixture marker. The database cascades deletion to rows attached to those fixture clues, including solver progress, ratings, and reports created while testing. It does not delete profiles or clues outside that exact set. Appeals are not part of this fixture workflow; an appeal attached to a fixture clue prevents clue deletion, so do not create appeals on fixtures.

Each clue begins with `[CLUE SPRINT TEST FIXTURE]` and its two-digit fixture number. The fourth fixture has three hints and nine completed synthetic runs: three ranked examples in each leaderboard tier. Separate fixtures include a failed and an in-progress synthetic run. The remaining clues provide clean runs for testing with the real account.

## Browser checklist

1. Sign in to Clue Sprint with the existing account used for seeding. This account owns the fixtures and can inspect the answer, setter explanation, and owner actions.
2. Open **Explore clues**. Confirm all 20 `[CLUE SPRINT TEST FIXTURE]` clues are visible and unrelated clues remain unchanged.
3. To test the solver view, sign in with a different existing test account; setters cannot solve their own clues. Confirm the answer and setter explanation are hidden before completion.
4. On a clean clue, start once with assist off and once with assist on. Submit a wrong guess, then the correct answer; confirm attempt counts and, in assist mode, green/yellow letter feedback.
5. On the one-hint, two-hint, and three-hint fixtures, reveal hints in order. Confirm each reveal adds the expected minute to solve time. Try a wrong guess and use all attempts on a low-attempt fixture to check the failed state.
6. Start a clue and reload before solving. Confirm the run resumes with its attempts and assist choice intact.
7. Open fixture 04 and inspect all three clue leaderboard categories. Confirm each has ranks 1–3, plausible times, and only the expected category (no hints/no assist, hints/no assist, assist).
8. Switch back to the seeded account. Confirm its current public ID is shown as the setter and profile details are unchanged. Check the owner-only answer and explanation; optionally retire one fixture to confirm the owner action, then re-seed to restore it.
9. Run the cleanup command and reload Explore. Confirm the 20 marked clues and their fixture progress are gone while unrelated clues remain.
