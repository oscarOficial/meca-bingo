# Task factory

A light version of a software factory for a one-person project: each backlog task goes through
**spec → build → review**, on its own branch and git worktree, and stops for the human before
anything reaches `main` (pushing `main` deploys).

## Pieces

| Path | What |
|---|---|
| `factory/backlog.md` | The work queue. |
| `.claude/skills/tarea/SKILL.md` | The `/tarea` command: the orchestrator. It runs in your Claude Code session. |
| `.claude/agents/spec-writer.md` | Turns the task into `spec.md` with checkable acceptance criteria. |
| `.claude/agents/builder.md` | Implements it in the worktree, validates, commits, writes `build.md`. |
| `.claude/agents/reviewer.md` | One review: correctness, security, UI and UX. Writes `round-N/review.md`. |
| `factory/jobs/<id>/` (gitignored) | The job's files: `task.md`, `spec.md`, `build.md`, `round-N/review.md`. |
| `.worktrees/<id>/` (gitignored) | The job's worktree, on branch `task/<id>`, cut from `main`. |

## The loop

1. `/tarea` picks the task, creates the branch, worktree and job folder.
2. **spec-writer** writes `spec.md`. If it has open questions, `/tarea` stops and asks you.
3. **builder** implements and writes `build.md` (`STATUS: READY | BLOCKED`).
4. **reviewer** writes `round-N/review.md` (`VERDICT: PASS | CHANGES`). `CHANGES` goes back to the
   builder, at most 2 times; after that `/tarea` stops and asks you.
5. `/tarea` checks the gates and shows you a summary. **You decide**: merge into `main`, ask for
   changes, or drop it. It never pushes unless you say so.

## Gates the orchestrator checks itself

- After every agent the worktree is clean; only the builder may add commits.
- A diff that touches the "ask the human" paths in `AGENTS.md`, or a `[manual]` criterion, is
  shown to you as needing your check before merging.

## Resume or drop a task

`/tarea` on a task that already has a job folder continues where it stopped. To drop one:

```bash
git worktree remove .worktrees/<id> && git branch -D task/<id>
```

and delete `factory/jobs/<id>/`.
