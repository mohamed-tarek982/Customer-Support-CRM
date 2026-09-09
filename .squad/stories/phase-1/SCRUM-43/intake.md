> **Fetched from jira:** [SCRUM-43](https://mohamedtarek98.atlassian.net/browse/SCRUM-43)  
> *Fetched 2026-09-09T21:41:28.831Z. Edit the sections below as needed; the planner reads this file verbatim.*


## Source — work item (from tracker)

**Title:** User can log in, log out, and reset password  
**Type:** Story  
**Status:** In Review  
**Labels:** auth, phase-1-foundation, security-administration

### Description

As a user, I want to log in and out securely so that I can access the system and my session is protected.

Depends on 
    
                
            
            SCRUM-42
        
                                                    In Progress
            
 (JWT auth scaffolding on the backend). This story builds the frontend authentication flow and route protection that every other screen relies on.

&#8212; TWO USER TYPES, ONE LOGIN PAGE &#8212;

The system serves two distinct audiences stored in SEPARATE tables (see 
    
                
            
            SCRUM-42
        
                                                    In Progress
            
 schema requirements):

	STAFF (users table) - agents, team leads, managers, executives, admins. Uses the main app shell (
    
                
            
            SCRUM-44
        
                                                    To Do
            
).

	CUSTOMERS (customers table) - external users of the Phase 5 portal (SCRUM-29/30/31).

Decision: use a SINGLE shared login page. The backend determines the user type from the credentials and returns it in the JWT; the frontend redirects accordingly. This keeps one form to build, translate, and maintain. Splitting into separate login routes later is a routing change only and does not affect the data model.

&#8212; CRITICAL: REDIRECT IS NOT SECURITY &#8212;

Because the frontend runs with ssr: false, all client code is public. Redirecting a customer to the portal does NOT prevent them from navigating to a staff route manually. The only real boundary is server-side authorization on every NestJS endpoint. Route-based redirects and nav visibility are UX convenience only.

&#8212; SCOPE &#8212;

	Single login screen (email + password) using the minimal auth layout, separate from the main app shell

	Backend resolves user type (staff vs customer) and role, returns both in the JWT

	Conditional post-login redirect: staff to agent dashboard, customer to portal home

	Session handling: store and refresh JWT, handle expiry gracefully

	Route protection: Nuxt middleware redirecting unauthenticated users to login, and redirecting authenticated users away from login

	Type-aware route guards: staff cannot access portal-only routes and vice versa

	Logout: clears session and redirects to login

	Forgot password / password reset flow, working for BOTH user types

	Role-based route guarding scaffolding (consumed later by 
    
                
            
            SCRUM-34
        
                                                    To Do
            
 permissions)

&#8212; ACCEPTANCE CRITERIA &#8212;

	Staff user logs in with valid credentials and lands on the agent dashboard

	Customer logs in with valid credentials and lands on the portal home

	NestJS guards enforce user type and role on every protected endpoint, independently of any frontend redirect

	A customer manually navigating to a staff route is blocked by the API, not just redirected by the client

	Invalid credentials show a clear, localized error message without revealing whether the email exists or which table it belongs to

	Unauthenticated access to any protected route redirects to login

	After login, user is returned to the route they originally requested, provided their type permits it

	Access token refreshes silently before expiry; expired refresh token forces re-login

	Logout clears all client-side session state and invalidates the refresh token server-side

	Forgot-password flow sends a reset email and allows setting a new password via a time-limited token, for both staff and customers

	Login screen is fully responsive and renders correctly in both Arabic (RTL) and English (LTR)

	Form validation via VeeValidate + Yup with localized error messages

	Rate limiting on login attempts to prevent brute force

&#8212; NOTES &#8212;

	Login screen must NOT use the main app shell layout (
    
                
            
            SCRUM-44
        
                                                    To Do
            
) - it has no sidebar, no user menu

	Language switcher must be available ON the login screen, since users need to choose their language before authenticating

	Customer accounts are created via self-registration or auto-created on first ticket (Phase 5); staff accounts are created by an admin (
    
                
            
            SCRUM-34
        
                                                    To Do
            
)

	Internal ticket comments (
    
                
            
            SCRUM-18
        
                                                    To Do
            
) must never be visible to customers - enforce server-side, not by hiding UI

### Attachments

None.

---
# Story intake

Fill this template for each story you want planned. Keep it copy-paste-friendly: the planner reads **this file and the files in `attachments/`**, nothing else.

- Folder: `.squad/stories/phase-1/SCRUM-43/intake.md`
- Binaries (screenshots, PDFs, exports): put them in `attachments/` next to this file and list them below.
- Do **not** rely on external links (tracker URLs, wiki, chat) — the planner cannot open them. Paste the content you want considered.

This is **not** an implementation prompt. It is the input to the plan-generation meta-prompt bundled with squad-kit (`generate-plan.md` in the installed package).

---

## Feature

- **Feature name (display):**
- **Feature slug (folder under `plans/`):** `phase-1`

## Tracker (metadata only)

- **Tracker type:** `jira`
- **Work item id:** `SCRUM-43` *(used in filenames and plan tables; fill manually if empty)*
- **Work item type:** `Story`
- **Status:** `In Review`
- **Assignee:** ``
- **Labels:** `auth, phase-1-foundation, security-administration`

External tracker links are **not** followed by the planner. Keep the id for naming and traceability only.

---

## Title

*(Paste the work item title verbatim. Prefilled when `squad new-story` fetched from a tracker.)*

```
auth
```

---

## Description

*(Paste the full work item description. Prefilled when fetched from a tracker.)*

```
As a user, I want to log in and out securely so that I can access the system and my session is protected.

Depends on 
    
                
            
            SCRUM-42
        
                                                    In Progress
            
 (JWT auth scaffolding on the backend). This story builds the frontend authentication flow and route protection that every other screen relies on.

&#8212; TWO USER TYPES, ONE LOGIN PAGE &#8212;

The system serves two distinct audiences stored in SEPARATE tables (see 
    
                
            
            SCRUM-42
        
                                                    In Progress
            
 schema requirements):

	STAFF (users table) - agents, team leads, managers, executives, admins. Uses the main app shell (
    
                
            
            SCRUM-44
        
                                                    To Do
            
).

	CUSTOMERS (customers table) - external users of the Phase 5 portal (SCRUM-29/30/31).

Decision: use a SINGLE shared login page. The backend determines the user type from the credentials and returns it in the JWT; the frontend redirects accordingly. This keeps one form to build, translate, and maintain. Splitting into separate login routes later is a routing change only and does not affect the data model.

&#8212; CRITICAL: REDIRECT IS NOT SECURITY &#8212;

Because the frontend runs with ssr: false, all client code is public. Redirecting a customer to the portal does NOT prevent them from navigating to a staff route manually. The only real boundary is server-side authorization on every NestJS endpoint. Route-based redirects and nav visibility are UX convenience only.

&#8212; SCOPE &#8212;

	Single login screen (email + password) using the minimal auth layout, separate from the main app shell

	Backend resolves user type (staff vs customer) and role, returns both in the JWT

	Conditional post-login redirect: staff to agent dashboard, customer to portal home

	Session handling: store and refresh JWT, handle expiry gracefully

	Route protection: Nuxt middleware redirecting unauthenticated users to login, and redirecting authenticated users away from login

	Type-aware route guards: staff cannot access portal-only routes and vice versa

	Logout: clears session and redirects to login

	Forgot password / password reset flow, working for BOTH user types

	Role-based route guarding scaffolding (consumed later by 
    
                
            
            SCRUM-34
        
                                                    To Do
            
 permissions)

&#8212; ACCEPTANCE CRITERIA &#8212;

	Staff user logs in with valid credentials and lands on the agent dashboard

	Customer logs in with valid credentials and lands on the portal home

	NestJS guards enforce user type and role on every protected endpoint, independently of any frontend redirect

	A customer manually navigating to a staff route is blocked by the API, not just redirected by the client

	Invalid credentials show a clear, localized error message without revealing whether the email exists or which table it belongs to

	Unauthenticated access to any protected route redirects to login

	After login, user is returned to the route they originally requested, provided their type permits it

	Access token refreshes silently before expiry; expired refresh token forces re-login

	Logout clears all client-side session state and invalidates the refresh token server-side

	Forgot-password flow sends a reset email and allows setting a new password via a time-limited token, for both staff and customers

	Login screen is fully responsive and renders correctly in both Arabic (RTL) and English (LTR)

	Form validation via VeeValidate + Yup with localized error messages

	Rate limiting on login attempts to prevent brute force

&#8212; NOTES &#8212;

	Login screen must NOT use the main app shell layout (
    
                
            
            SCRUM-44
        
                                                    To Do
            
) - it has no sidebar, no user menu

	Language switcher must be available ON the login screen, since users need to choose their language before authenticating

	Customer accounts are created via self-registration or auto-created on first ticket (Phase 5); staff accounts are created by an admin (
    
                
            
            SCRUM-34
        
                                                    To Do
            
)

	Internal ticket comments (
    
                
            
            SCRUM-18
        
                                                    To Do
            
) must never be visible to customers - enforce server-side, not by hiding UI
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
