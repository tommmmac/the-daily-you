# Contributing

The project is early, so the process is light.

## Where things live

Roadmap tasks are tagged by area (see [ROADMAP.md](ROADMAP.md)):

- **Frontend:** `apps/web`
- **Backend (server + AI agents):** `apps/server`
- **Shared:** `packages/shared`. These are the types both sides use, so a change here affects both.

## Workflow

1. Pick an unticked item from the roadmap, or open an issue for it.
2. Branch from `main`: `feat/chat-ui`, `fix/print-timezone`, `docs/api`, and so on.
3. Open a PR into `main`. `main` is protected: direct pushes are blocked, CI (typecheck + build) must pass, and PRs are squash-merged.
4. Keep PRs small and focused. One roadmap item per PR is ideal.
5. Tick the item off in `ROADMAP.md` in the same PR.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) style:

```
feat(web): add journal list view
fix(server): respect day cutoff when printing
docs: draft entry format
```

## Local setup

See [Getting started](README.md#getting-started) in the README. Run the server tests with `bun test` in `apps/server`.

## Guidelines

- **Files are the source of truth.** Once SQLite is added (Phase 3), nothing should live only in SQLite that can't be rebuilt from `data/`.
- **Never commit a real `data/` folder.** It's gitignored. Tests point `DATA_DIR` at a temp folder and use made-up entries.
- **Prompts live in each agent's `agent.md`** (`apps/server/src/agents/<name>/`), so they're easy to diff and tweak.
- **Validate LLM output.** Every structured LLM call goes through a zod schema, with a retry.
