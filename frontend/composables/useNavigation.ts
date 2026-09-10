/**
 * Sidebar contents for the two authenticated audiences.
 *
 * Kept out of the layouts so the nav is one list per audience that both the
 * shell and any future breadcrumb/command-palette can read, and so adding a
 * page means touching one array instead of a template.
 *
 * `labelKey` is an i18n key, never a literal string — the app ships in English
 * and Arabic and the sidebar has to mirror with the rest of the shell.
 *
 * NOTE: several destinations below are Phase 5 screens that do not exist yet
 * (SCRUM-29/30/31). They resolve to the 404 page until those pages land.
 */
import type { IconName } from '~/components/AppNavIcon.vue'

export interface NavItem {
  /** Route path. Must match a page file once the page exists. */
  to: string
  /** i18n key for the visible label. */
  labelKey: string
  icon: IconName
  /**
   * Match the route exactly instead of by prefix. Index routes ("/staff", "/portal")
   * need this or they stay highlighted on every child page.
   */
  exact?: boolean
  /**
   * Restrict the entry to these roles. Absent means every member of the
   * audience sees it. Hiding an entry is housekeeping, not a boundary — the
   * page's own guard and the API's `@Roles(...)` are what actually stop a
   * non-admin who types the URL.
   */
  roles?: readonly string[]
}

/** Staff workspace: agents and admins. */
export const STAFF_NAV: readonly NavItem[] = [
  { to: '/staff', labelKey: 'nav.staff.dashboard', icon: 'dashboard', exact: true },
  { to: '/staff/tickets', labelKey: 'nav.staff.tickets', icon: 'ticket' },
  { to: '/staff/customers', labelKey: 'nav.staff.customers', icon: 'users' },
  { to: '/staff/knowledge-base', labelKey: 'nav.staff.knowledgeBase', icon: 'book' },
  { to: '/staff/reports', labelKey: 'nav.staff.reports', icon: 'chart' },
  // Admin-only (SCRUM-34). Distinct icon from Customers, which already uses
  // 'users' — two identical glyphs in one sidebar is a navigation bug.
  { to: '/staff/users', labelKey: 'nav.staff.users', icon: 'shield', roles: ['admin'] },
  { to: '/staff/settings', labelKey: 'nav.staff.settings', icon: 'settings' },
]

/**
 * The staff sidebar as a given role should see it.
 *
 * A missing role hides every gated entry rather than showing them: the session
 * has not resolved yet, and flashing an admin link at an agent for one frame is
 * worse than one frame of a shorter sidebar.
 */
export function staffNavFor(role: string | null | undefined): NavItem[] {
  return STAFF_NAV.filter((item) => !item.roles || (role ? item.roles.includes(role) : false))
}

/** Customer portal: the people raising the tickets. */
export const CLIENT_NAV: readonly NavItem[] = [
  { to: '/portal', labelKey: 'nav.client.overview', icon: 'dashboard', exact: true },
  { to: '/portal/tickets', labelKey: 'nav.client.myTickets', icon: 'ticket' },
  { to: '/portal/tickets/new', labelKey: 'nav.client.newTicket', icon: 'plus', exact: true },
  { to: '/portal/knowledge-base', labelKey: 'nav.client.knowledgeBase', icon: 'book' },
  { to: '/portal/profile', labelKey: 'nav.client.profile', icon: 'user' },
]

export function useNavigation() {
  return { STAFF_NAV, CLIENT_NAV, staffNavFor }
}
