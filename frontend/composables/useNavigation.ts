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
}

/** Staff workspace: agents and admins. */
export const STAFF_NAV: readonly NavItem[] = [
  { to: '/staff', labelKey: 'nav.staff.dashboard', icon: 'dashboard', exact: true },
  { to: '/staff/tickets', labelKey: 'nav.staff.tickets', icon: 'ticket' },
  { to: '/staff/customers', labelKey: 'nav.staff.customers', icon: 'users' },
  { to: '/staff/knowledge-base', labelKey: 'nav.staff.knowledgeBase', icon: 'book' },
  { to: '/staff/reports', labelKey: 'nav.staff.reports', icon: 'chart' },
  { to: '/staff/settings', labelKey: 'nav.staff.settings', icon: 'settings' },
]

/** Customer portal: the people raising the tickets. */
export const CLIENT_NAV: readonly NavItem[] = [
  { to: '/portal', labelKey: 'nav.client.overview', icon: 'dashboard', exact: true },
  { to: '/portal/tickets', labelKey: 'nav.client.myTickets', icon: 'ticket' },
  { to: '/portal/tickets/new', labelKey: 'nav.client.newTicket', icon: 'plus', exact: true },
  { to: '/portal/knowledge-base', labelKey: 'nav.client.knowledgeBase', icon: 'book' },
  { to: '/portal/profile', labelKey: 'nav.client.profile', icon: 'user' },
]

export function useNavigation() {
  return { STAFF_NAV, CLIENT_NAV }
}
