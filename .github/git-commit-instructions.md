# Git Commit Instructions

### Workflow & Commits

- **Branching**: Use `<type>/<ticket-number>` (e.g., `feat/UX-1234`).
- type is one of `refactor`, `feat`, `test`, `chore`, `fix`.
- **Commit Messages**:
    - Format: `<type>: <ticket-number> <description>` (e.g., `feat: UX-1234 cap message history at 200`).
    - Follow Conventional Commits.
- **Pull Requests**:
    - **Rebase** onto `main`/`master` (DO NOT merge it into your branch).
    - Max PR size is around 300 lines of code. If you exceed this, split into multiple PRs.
- **Before committing**: run the full gate — `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- **Dependencies**: any change to a `package.json` must commit the regenerated `pnpm-lock.yaml` in the same commit (see the `locked-versions` skill).
