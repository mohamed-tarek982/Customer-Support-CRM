/**
 * Where each audience lives.
 *
 * Both sections are folders under pages/ — `pages/staff/**` and
 * `pages/portal/**` — so a route's prefix tells you which audience it belongs
 * to, and "/" belongs to neither (it only dispatches).
 *
 * SINGLE SOURCE OF TRUTH for the two home paths. The login redirect, both route
 * middlewares, and the "/" dispatcher all read from here, so moving a section
 * is one edit rather than a hunt through five files.
 *
 * The user-type union is written out rather than imported from
 * composables/useAuth: this module is imported by utils/auth-schemas.ts, which
 * the unit tests load directly with no Nuxt aliases in play.
 */
export type AudienceUserType = 'staff' | 'customer'

export const STAFF_HOME = '/staff'
export const CLIENT_HOME = '/portal'

/** The landing route for a signed-in user of this type. */
export function homePathFor(userType: AudienceUserType): string {
  return userType === 'customer' ? CLIENT_HOME : STAFF_HOME
}
