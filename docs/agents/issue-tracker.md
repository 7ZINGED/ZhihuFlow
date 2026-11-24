# Issue tracker: local markdown

Issues, specs, and wayfinding maps for this repo live as markdown files under `.scratch/`. They are tracked in git; treat them as the project's work log.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation tickets are one file per ticket: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Each ticket starts with a `Status:` line: `ready-for-agent`, `claimed`, or `done`. External issues additionally use the triage roles in `triage-labels.md`
- Blocking edges are a `**Blocked by:**` line listing ticket numbers; `None (can start immediately)` means the ticket is on the frontier
- Comments and conversation history append to the bottom under a `## Comments` heading, with a date

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed). Use the ticket template below.

```markdown
# <NN>: <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective.

**Blocked by:** ticket numbers, or "None (can start immediately)".

**Status:** ready-for-agent

- [ ] Acceptance criterion
```

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the ticket number directly.

## Working the frontier

A ticket is ready when every ticket listed in its `**Blocked by:**` line is `done`. Work ready tickets in number order. Set `Status: claimed` before starting, and `Status: done` only when all acceptance boxes are checked and `npm run check` passes.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research` / `prototype` / `grilling` / `task`); a `Status:` line records `claimed` / `resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

## Upgrade path

The repo has no `gh` CLI configured and is a single-maintainer project, so local markdown is the default. If external issues become a real request surface, re-run `/setup-matt-pocock-skills` and switch to GitHub Issues; the five triage labels already match the defaults, so no relabeling is needed.
