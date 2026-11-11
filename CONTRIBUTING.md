# Contributing to WarBrowser

1. **Start with an issue.** Work on an issue assigned to you, or pick an open issue and coordinate with the team before starting.
2. **Create a branch from the latest `main`.** Include the issue number and a short description in the name, such as `issue-76-contributing`.
3. **Make small commits.** Keep each commit focused and include the issue number in the message. For example, `Add contribution guide (#76)`.
4. **Run `npm test`.** Fix any failures before asking for review.
5. **Open a pull request into `main`.** Summarize what changed and how you tested it. Add `Closes #76` to the description if the PR completes issue #76. Replace `76` with the issue you're working on.
6. **Ask a teammate to review.** Address their feedback. Once the PR is approved and the tests pass, a teammate with merge access can merge it.

## Parent and child issues

A child issue labeled `Part of #N` is one piece of a larger task. If your PR completes only the child issue, use `Closes #<child number>` and mention the parent separately. For example, a PR that completes #52 can say `Closes #52` and `Part of #31`. The parent stays open until all its work is complete.

## Project records

Follow [AGENTS.md](AGENTS.md) for when and how to record project decisions in [decision.md](decision.md) and leave a session handoff in [LOG.md](LOG.md).