---
name: tarea
description: Run the next task from factory/backlog.md through spec → build → review on its own branch and worktree, then ask the human whether to merge it into main. Use only when the user types /tarea.
disable-model-invocation: true
argument-hint: "[number of an unchecked item | words from its title]"
---

# /tarea: run one backlog task

You are the orchestrator of the Meca Bingo task factory (`factory/README.md`). You run the loop
from this session, start the three roles as subagents (`spec-writer`, `builder`, `reviewer`),
check their results yourself, and stop for the human before anything reaches `main`.
You never write code yourself in this loop, never push, and never merge without the human's yes.

Arguments: `$ARGUMENTS`

Keep the app's task list with one step per phase (pick, spec, build, review round N, report).

## 1. Preconditions

Run in the main checkout:

- `git cat-file -e main:AGENTS.md` and `git cat-file -e main:.claude/agents/builder.md`. If either
  fails, stop: the factory files must be committed on `main` first, because worktrees are cut
  from `main`.
- `git status --porcelain -- factory/backlog.md` is empty (a backlog edited but not committed
  won't be what the task branch sees; ask the human to commit it, or go on if they say so).

## 2. Pick the task

Read `factory/backlog.md`. The unchecked items are the `- [ ]` lines in file order, each with any
indented lines under it as detail.

- No arguments: the first unchecked item.
- A number `n`: the n-th unchecked item.
- Words: the first unchecked item whose title contains them (case-insensitive). If none matches,
  ask whether to add it to the backlog as a new item first.

Its **id** is the title in kebab-case: lowercase ASCII, accents removed, `a-z0-9-` only, at most
40 characters, cut at a hyphen. Paths (use them absolute in every message to a subagent):

- Job folder: `<repo>/factory/jobs/<id>/`
- Worktree: `<repo>/.worktrees/<id>/`
- Branch: `task/<id>`, Base: `main`

If the job folder already exists, this is a **resume**: skip to the first phase whose output is
missing or stale (no `spec.md` → 3; Questions without `answers.md` → 3; no `build.md`, or the last
review is `CHANGES` with no newer build → 4; `build.md` READY without a review for its round → 5;
last review `PASS` → 6). Tell the human you are resuming and from where.

Otherwise create them:

```bash
git worktree add .worktrees/<id> -b task/<id> main
mkdir -p factory/jobs/<id>
```

and write `factory/jobs/<id>/task.md` with the item's title and its detail lines, verbatim.

## 3. Spec

Start the `spec-writer` subagent with this task message:

```
Job folder: <abs job folder>
Worktree: <abs worktree>
Branch: task/<id>
Write <abs job folder>/spec.md for the task in task.md.
```

Then check the gates (§ Gates) and read `spec.md`.

- If `## Questions` is not "None.", stop and ask the human those questions (AskUserQuestion when
  they have clear options). Write their answers, verbatim, to `<job folder>/answers.md`, then go on.
- Otherwise show the human the title, the requirements and the acceptance criteria in a few lines,
  and go on without waiting.

## 4. Build (round N)

N is 1 the first time, then one more than the last `round-*` folder. Start the `builder` subagent:

```
Job folder: <abs job folder>
Worktree: <abs worktree>
Branch: task/<id>
Base: main
Round: <N>
[From round 2:] Address the findings in <abs job folder>/round-<N-1>/review.md.
```

Check the gates. Read the first line of `build.md`: `STATUS: BLOCKED` → stop and show the human
the `## Blocked` section; on their answer, add it to `answers.md` and build again.

## 5. Review (round N)

`mkdir -p factory/jobs/<id>/round-<N>`, then start the `reviewer` subagent:

```
Job folder: <abs job folder>
Worktree: <abs worktree>
Branch: task/<id>
Base: main
Round: <N>
Write <abs job folder>/round-<N>/review.md.
```

Check the gates. First line of `review.md`:

- `VERDICT: CHANGES` and N < 3 → back to 4 with round N+1.
- `VERDICT: CHANGES` and N = 3 → stop: show the human the open findings and ask whether to do
  another round, take it over by hand, or drop the task.
- `VERDICT: PASS` → 6.

## Gates (after every subagent)

Before starting a subagent, note `git -C <worktree> rev-parse HEAD`. After it finishes:

- `git -C <worktree> status --porcelain` must be empty.
- spec-writer and reviewer: HEAD must not have moved. builder: HEAD may move; check
  `git -C <worktree> branch --show-current` is still `task/<id>`.
- The file the role writes exists and its first line has the expected format.
- Nothing changed in the main checkout except the job folder (`git status --porcelain` there
  shows no new entries beyond what was there before the run).

If a gate fails, stop and tell the human exactly what happened. Don't fix it yourself.

## 6. Report and decide

Collect:

- `git log --oneline main..task/<id>` and `git diff --stat main...task/<id>`.
- Paths in `git diff --name-only main...task/<id>` that are in AGENTS.md § "Ask the human before
  touching".
- Criteria in `build.md` that are `[manual]` or `not verified`.
- The Notes of the last review.

Show the human a short report: what the task does now, each acceptance criterion with its result,
the review verdict and how many rounds it took, and, as **needs your check**, the sensitive paths,
manual/unverified criteria and review Notes worth acting on. Mention the screenshots in
`<worktree>/ux-report/` if the change is visible, and that they can try it from the worktree with
`npx wrangler dev`.

Then ask one question: merge into `main`, ask for changes, or leave it for later.

- **Merge** (only on the human's yes). In the main checkout, which must be on `main` with no
  uncommitted changes to tracked files:
  ```bash
  git merge --no-ff task/<id> -m "Merge task/<id>: <title>"
  ```
  Then mark the item in `factory/backlog.md` as `- [x] <title> → task/<id>`, commit only that file
  (`Backlog: <title> done`), and clean up:
  ```bash
  git worktree remove .worktrees/<id>
  git branch -d task/<id>
  ```
  The job folder stays (gitignored) for reference. **Don't push**: say that pushing `main`
  deploys, and push only if the human asks in this conversation.
- **Changes**: write the human's words to `answers.md` (append, with a heading for this round) and
  go back to 4 with the next round number. In the builder's message, replace the round-2 line
  with: `Address the human's latest request at the end of <abs job folder>/answers.md.`
- **Later**: leave branch, worktree and job folder; `/tarea <same task>` resumes.
