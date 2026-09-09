# Contributing

Read `README.md` first. This file is the review checklist for the conventions that fail silently.

## Reviewer checklist

**Reject a new tenant-scoped Prisma model that does not have `branchId` and `departmentId`, with indexes.**

This is the one that cannot be fixed cheaply later. The branch/department management UI is Phase 8 (SCRUM-41), so it is tempting to leave the columns out of a model shipped in Phase 2. Do not. Adding them now costs two lines. Retrofitting tenant scoping later means a migration touching every query, every index, and every row of production data, on a system already in use.

```prisma
model Ticket {
  id           String  @id @default(cuid())
  branchId     String?
  departmentId String?
  // ...

  @@index([branchId])
  @@index([departmentId])
}
```

**Reject physical directional Tailwind utilities.** `pl-`, `pr-`, `ml-`, `mr-`, `text-left`, `text-right`. Use `ps-`, `pe-`, `ms-`, `me-`, `text-start`, `text-end`. ESLint catches these, but it cannot catch them in a class name built by string concatenation at runtime.

**Reject Vuetify utility classes.** `pa-*`, `ma-*`, `d-flex` and friends. Tailwind owns layout and spacing.

**Reject a hex colour outside `frontend/design-tokens/index.ts`.** CI greps for this, but review it anyway — a near-miss shade added as a one-off is how a palette stops being a palette.

**Reject the deferred stack.** BullMQ, Redis, WebSockets, Meilisearch, Moment.js. See the "Deferred decisions" table in `README.md`. If one of them is genuinely needed, that is a conversation and a decision record, not a dependency added inside a feature PR.

**Check the audit-log shape stayed backward compatible.** `AuditLog` is consumed by SCRUM-35. Add columns; do not rename or repurpose them.

## Before opening a PR

```bash
cd backend  && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm check:lint-rule && pnpm check:tokens
```

CI runs all of the above plus both builds.

## Adding a locale

1. Add the entry to `frontend/i18n/locale-config.ts`, including its `dir`.
2. Add the matching JSON file in `frontend/i18n/locales/`.
3. Run `pnpm test` in `frontend/`. The locale tests fail if the key sets do not match across files.

Do not register a locale anywhere else. `nuxt.config.ts`, the Vuetify RTL map, and the `<html dir>` logic all read from that one file so they cannot disagree.

## Adding a secret

Add it to `backend/src/config/env.validation.ts` with a validator, expose a typed getter on `EnvService` in `backend/src/config/env.ts`, and document it in `backend/.env.example` with a placeholder value. Never read `process.env` directly outside the config module, and never commit a real value.
