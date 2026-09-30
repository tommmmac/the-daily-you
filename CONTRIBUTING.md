# Contributing

Thanks for helping put out the paper! The project is early, so the process is light.

## Where things live

Roadmap tasks are tagged by area (see [ROADMAP.md](ROADMAP.md)):

- **Frontend:** `apps/web`
- **Backend (server + AI agents):** `apps/server`
- **Shared:** `packages/shared`. These are the types both sides use, so a change here affects both.

## Workflow

1. Pick an unticked item from the roadmap, or open an issue for it.
2. Branch from `main`: `feat/chat-ui`, `fix/print-timezone`, `docs/api`, and so on.
3. Keep PRs small and focused. One roadmap item per PR is ideal.
4. Tick the item off in `ROADMAP.md` in the same PR.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) style:

```
feat(web): add journal list view
fix(server): respect day cutoff when printing
docs: draft entry format
```

## Local setup

> Filled in during Phase 0.

## Guidelines

- **Files are the source of truth.** Never store anything only in SQLite that can't be rebuilt from `data/`.
- **Never commit a real `data/` folder.** It's gitignored. Use `fixtures/` with made-up entries for tests and demos.
- **Prompts live in `apps/server/src/prompts/`** as plain files, so they're easy to diff and tweak.
- **Validate LLM output.** Every structured LLM call goes through a zod schema, with a retry.
