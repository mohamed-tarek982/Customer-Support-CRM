import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'auditAction';

/**
 * Action codes for reads that are audited on purpose.
 *
 * `AuditLogInterceptor` audits every successful mutation on its own, deriving
 * the action from the method and route — no registration needed, and nothing
 * below applies to those. This registry is only for the handful of READS worth
 * recording: reads are far too noisy to store wholesale, so each one has to opt
 * in by name, and the name is a stable string the audit UI can filter on rather
 * than a route pattern that changes when the route does.
 *
 * SINGLE SOURCE OF TRUTH — add a code here, then `@AuditAction(...)` the
 * handler. A code that is never referenced is dead, and a handler that invents
 * its own string is invisible to anyone filtering by these.
 */
export const AUDIT_ACTIONS = {
  /** An agent or admin opened a customer's profile (SCRUM-5). */
  customerViewed: 'CUSTOMER_VIEWED',
} as const;

export type AuditActionCode = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Record this handler in the audit log under an explicit action code.
 *
 * On a mutating route this only renames the row, which is rarely what you want.
 * Its real use is a sensitive read: `@AuditAction(AUDIT_ACTIONS.customerViewed)`
 * is what makes a `GET` audited at all.
 */
export const AuditAction = (action: AuditActionCode) => SetMetadata(AUDIT_ACTION_KEY, action);
