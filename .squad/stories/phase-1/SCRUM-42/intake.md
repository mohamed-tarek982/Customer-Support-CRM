> **Fetched from jira:** [SCRUM-42](https://mohamedtarek98.atlassian.net/browse/SCRUM-42)  
> *Fetched 2026-09-09T16:17:09.237Z. Edit the sections below as needed; the planner reads this file verbatim.*


## Source — work item (from tracker)

**Title:** Initialize project with frontend and backend stack  
**Type:** Story  
**Status:** To Do  
**Labels:** phase-1-foundation, platform, setup

### Description

As a developer, I want the project initialized with the agreed frontend and backend stack so that all subsequent development follows consistent conventions and no foundational decisions need revisiting.

This is the FIRST story in Phase 1 and blocks all other work. No feature story should start until this is complete.

Backend is deliberately kept minimal. Complexity is deferred until real need appears (see DEFERRED section).

&#8212; FRONTEND STACK &#8212;

	Nuxt (Vue 3) with ssr: false in nuxt.config - SPA mode, retaining file-based routing, auto-imports, layouts, and module ecosystem

	Vuetify 3 - used for ready-made components ONLY (v-data-table, v-dialog, v-select, v-date-picker, etc.)

	Tailwind CSS - used for ALL layout, spacing, and design utility classes

	VeeValidate + Yup - form validation

	date-fns for date/time handling (NOT Moment.js - deprecated, mutable API, poor tree-shaking)

&#8212; STYLING BOUNDARY RULES (must be documented in repo README) &#8212;

	Vuetify owns component internals - style via Vuetify props and theme config, never override internals with Tailwind classes

	Tailwind owns everything between components - page grids, flex containers, spacing, and all custom non-Vuetify components

	Do NOT use Vuetify utility classes (pa-4, ma-2, d-flex, text-center) - use Tailwind equivalents

	Vuetify component stylesheets MUST still load - they are required for components to function

&#8212; REQUIRED FRONTEND CONFIGURATION &#8212;

	Tailwind Preflight DISABLED (corePlugins: 
{ preflight: false }
) - prevents Tailwind's CSS reset from breaking Vuetify component base styles

	Single source of truth for design tokens - palette and spacing scale defined once, fed into BOTH Vuetify theme config and Tailwind theme.extend, so color="primary" and bg-primary resolve to the same value

	RTL support configured on both systems - Vuetify locale RTL config enabled; Tailwind logical properties enabled (tailwindcss-logical or built-in logical variants)

	Lint rule enforcing logical properties in Tailwind (ps-/pe-/ms-/me-/text-start/text-end instead of pl-/pr-/ml-/mr-/text-left/text-right) - a single physical property in a shared component silently breaks Arabic layout

&#8212; BACKEND STACK (kept intentionally simple) &#8212;

	Node.js + NestJS - structured conventions and predictable file layout

	PostgreSQL + Prisma - schema file, one migrate command, fully typed queries. Chosen over TypeORM for simplicity.

	class-validator / class-transformer for DTO validation (note: schemas are defined separately from frontend Yup schemas - accepted duplication)

	Passport + JWT with refresh tokens and RBAC scaffolding (consumed by 
    
                
            
            SCRUM-34
        
                                                    To Do
            
)

	@nestjs/schedule - simple cron jobs. Used in Phase 4 for SLA breach checks (a per-minute job scanning for overdue tickets). No queue system needed at expected volume.

	Managed S3-compatible object storage (Cloudflare R2 or Supabase Storage) for ticket and customer attachments (
    
                
            
            SCRUM-7
        
                                                    To Do
            
). Do NOT use local disk - files are lost on redeploy. Do NOT self-host MinIO - unnecessary operational burden.

	Simple audit log table written to directly from a NestJS interceptor (consumed by 
    
                
            
            SCRUM-35
        
                                                    To Do
            
). No event-sourcing or external logging service.

&#8212; DEFERRED (do NOT build now) &#8212;

	Job queue (BullMQ + Redis) - replaced by @nestjs/schedule cron. Revisit only if SLA/notification volume outgrows cron.

	WebSockets / real-time gateway - replaced by client polling every 20-30s for dashboards and ticket lists. Revisit in Phase 3 when live chat (
    
                
            
            SCRUM-13
        
                                                    To Do
            
) is built, which genuinely requires sockets.

	Meilisearch - start with PostgreSQL full-text search. Re-evaluate in Phase 5 (
    
                
            
            SCRUM-23
        
                                                    To Do
            
) against real Arabic article content; Postgres has weak Arabic stemming, so a switch may be justified then, but not before.

&#8212; CRITICAL SCHEMA REQUIREMENT (do not defer) &#8212;

	Branch and department scoping columns MUST be included in the base data model from day one, even though the management UI is Phase 8 (
    
                
            
            SCRUM-41
        
                                                    To Do
            
). Adding the columns now is trivial; retrofitting tenant scoping across every table later is a painful migration.

&#8212; ACCEPTANCE CRITERIA &#8212;

	Frontend and backend projects scaffolded and running locally

	Nuxt configured with ssr: false; routing and auto-imports verified working

	Vuetify + Tailwind coexisting correctly with Preflight disabled; sample page renders a Vuetify component inside a Tailwind layout with no style conflicts

	Design tokens defined once and verified identical across both systems

	RTL verified: a sample page renders correctly in both Arabic (RTL) and English (LTR)

	Logical-property lint rule active and failing on a physical property

	PostgreSQL connected via Prisma; migrations running; base schema includes branch/department scoping

	Auth scaffolding in place (JWT issue/refresh working end-to-end)

	@nestjs/schedule wired with a trivial cron job to confirm it runs

	Object storage configured with a test file upload/download

	Repo README documents the Vuetify/Tailwind boundary rules, the RTL logical-property requirement, and the DEFERRED list above

	CI pipeline running lint, typecheck, and tests

&#8212; NOTE FOR PHASE 5 &#8212;

ssr: false makes knowledge base articles and public FAQ pages non-crawlable. Nuxt supports per-route rendering rules (routeRules) - enable prerendering for public KB/portal routes in Phase 5 if SEO is required.

### Attachments

None.

---
# Story intake

Fill this template for each story you want planned. Keep it copy-paste-friendly: the planner reads **this file and the files in `attachments/`**, nothing else.

- Folder: `.squad/stories/phase-1/SCRUM-42/intake.md`
- Binaries (screenshots, PDFs, exports): put them in `attachments/` next to this file and list them below.
- Do **not** rely on external links (tracker URLs, wiki, chat) — the planner cannot open them. Paste the content you want considered.

This is **not** an implementation prompt. It is the input to the plan-generation meta-prompt bundled with squad-kit (`generate-plan.md` in the installed package).

---

## Feature

- **Feature name (display):**
- **Feature slug (folder under `plans/`):** `phase-1`

## Tracker (metadata only)

- **Tracker type:** `jira`
- **Work item id:** `SCRUM-42` *(used in filenames and plan tables; fill manually if empty)*
- **Work item type:** `Story`
- **Status:** `To Do`
- **Assignee:** ``
- **Labels:** `phase-1-foundation, platform, setup`

External tracker links are **not** followed by the planner. Keep the id for naming and traceability only.

---

## Title

*(Paste the work item title verbatim. Prefilled when `squad new-story` fetched from a tracker.)*

```
init-project
```

---

## Description

*(Paste the full work item description. Prefilled when fetched from a tracker.)*

```
As a developer, I want the project initialized with the agreed frontend and backend stack so that all subsequent development follows consistent conventions and no foundational decisions need revisiting.

This is the FIRST story in Phase 1 and blocks all other work. No feature story should start until this is complete.

Backend is deliberately kept minimal. Complexity is deferred until real need appears (see DEFERRED section).

&#8212; FRONTEND STACK &#8212;

	Nuxt (Vue 3) with ssr: false in nuxt.config - SPA mode, retaining file-based routing, auto-imports, layouts, and module ecosystem

	Vuetify 3 - used for ready-made components ONLY (v-data-table, v-dialog, v-select, v-date-picker, etc.)

	Tailwind CSS - used for ALL layout, spacing, and design utility classes

	VeeValidate + Yup - form validation

	date-fns for date/time handling (NOT Moment.js - deprecated, mutable API, poor tree-shaking)

&#8212; STYLING BOUNDARY RULES (must be documented in repo README) &#8212;

	Vuetify owns component internals - style via Vuetify props and theme config, never override internals with Tailwind classes

	Tailwind owns everything between components - page grids, flex containers, spacing, and all custom non-Vuetify components

	Do NOT use Vuetify utility classes (pa-4, ma-2, d-flex, text-center) - use Tailwind equivalents

	Vuetify component stylesheets MUST still load - they are required for components to function

&#8212; REQUIRED FRONTEND CONFIGURATION &#8212;

	Tailwind Preflight DISABLED (corePlugins: 
{ preflight: false }
) - prevents Tailwind's CSS reset from breaking Vuetify component base styles

	Single source of truth for design tokens - palette and spacing scale defined once, fed into BOTH Vuetify theme config and Tailwind theme.extend, so color="primary" and bg-primary resolve to the same value

	RTL support configured on both systems - Vuetify locale RTL config enabled; Tailwind logical properties enabled (tailwindcss-logical or built-in logical variants)

	Lint rule enforcing logical properties in Tailwind (ps-/pe-/ms-/me-/text-start/text-end instead of pl-/pr-/ml-/mr-/text-left/text-right) - a single physical property in a shared component silently breaks Arabic layout

&#8212; BACKEND STACK (kept intentionally simple) &#8212;

	Node.js + NestJS - structured conventions and predictable file layout

	PostgreSQL + Prisma - schema file, one migrate command, fully typed queries. Chosen over TypeORM for simplicity.

	class-validator / class-transformer for DTO validation (note: schemas are defined separately from frontend Yup schemas - accepted duplication)

	Passport + JWT with refresh tokens and RBAC scaffolding (consumed by 
    
                
            
            SCRUM-34
        
                                                    To Do
            
)

	@nestjs/schedule - simple cron jobs. Used in Phase 4 for SLA breach checks (a per-minute job scanning for overdue tickets). No queue system needed at expected volume.

	Managed S3-compatible object storage (Cloudflare R2 or Supabase Storage) for ticket and customer attachments (
    
                
            
            SCRUM-7
        
                                                    To Do
            
). Do NOT use local disk - files are lost on redeploy. Do NOT self-host MinIO - unnecessary operational burden.

	Simple audit log table written to directly from a NestJS interceptor (consumed by 
    
                
            
            SCRUM-35
        
                                                    To Do
            
). No event-sourcing or external logging service.

&#8212; DEFERRED (do NOT build now) &#8212;

	Job queue (BullMQ + Redis) - replaced by @nestjs/schedule cron. Revisit only if SLA/notification volume outgrows cron.

	WebSockets / real-time gateway - replaced by client polling every 20-30s for dashboards and ticket lists. Revisit in Phase 3 when live chat (
    
                
            
            SCRUM-13
        
                                                    To Do
            
) is built, which genuinely requires sockets.

	Meilisearch - start with PostgreSQL full-text search. Re-evaluate in Phase 5 (
    
                
            
            SCRUM-23
        
                                                    To Do
            
) against real Arabic article content; Postgres has weak Arabic stemming, so a switch may be justified then, but not before.

&#8212; CRITICAL SCHEMA REQUIREMENT (do not defer) &#8212;

	Branch and department scoping columns MUST be included in the base data model from day one, even though the management UI is Phase 8 (
    
                
            
            SCRUM-41
        
                                                    To Do
            
). Adding the columns now is trivial; retrofitting tenant scoping across every table later is a painful migration.

&#8212; ACCEPTANCE CRITERIA &#8212;

	Frontend and backend projects scaffolded and running locally

	Nuxt configured with ssr: false; routing and auto-imports verified working

	Vuetify + Tailwind coexisting correctly with Preflight disabled; sample page renders a Vuetify component inside a Tailwind layout with no style conflicts

	Design tokens defined once and verified identical across both systems

	RTL verified: a sample page renders correctly in both Arabic (RTL) and English (LTR)

	Logical-property lint rule active and failing on a physical property

	PostgreSQL connected via Prisma; migrations running; base schema includes branch/department scoping

	Auth scaffolding in place (JWT issue/refresh working end-to-end)

	@nestjs/schedule wired with a trivial cron job to confirm it runs

	Object storage configured with a test file upload/download

	Repo README documents the Vuetify/Tailwind boundary rules, the RTL logical-property requirement, and the DEFERRED list above

	CI pipeline running lint, typecheck, and tests

&#8212; NOTE FOR PHASE 5 &#8212;

ssr: false makes knowledge base articles and public FAQ pages non-crawlable. Nuxt supports per-route rendering rules (routeRules) - enable prerendering for public KB/portal routes in Phase 5 if SEO is required.
```

---

## Acceptance criteria

*(Checklist, bullets, Gherkin, etc. Prefilled for Azure DevOps when the work item has acceptance criteria.)*

```

```

---

## Attachments

Place files in `attachments/` next to this `intake.md`, then list them here so the planner knows what to open.

| File (relative to this folder) | What it is |
| ------------------------------ | ---------- |
| *(e.g. `attachments/flow.png`)* | *(e.g. UX flow)* |

*(Add rows per file. If none, write "None.")*

---

## Dependencies

- **Blocked by / related ids:** (tracker ids only; optional short note)
- **Depends on code areas or other stories:**

## Extra notes (optional)

- Anything not captured above (e.g. chat context) — keep short.

## Technical hints (optional)

- APIs, screens, services already discussed. Repos/roots: `.`. Primary language: `typescript`.

## Out of scope

- What this story explicitly does **not** cover:
