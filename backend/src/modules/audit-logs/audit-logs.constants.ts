/**
 * Audit-trail reading (SCRUM-35).
 *
 * The write side of `AuditLog` belongs to `AuditLogInterceptor` and is a
 * contract this module only consumes — nothing here may change a column.
 */

/** Default page size for `GET /audit-logs`, and the ceiling a caller may ask
 * for. Mirrors the users list rather than inventing a second convention, so an
 * admin moving between the two screens gets the same paging. */
export const AUDIT_LOGS_PAGE_SIZE = 25;
export const AUDIT_LOGS_MAX_PAGE_SIZE = 100;

/**
 * Machine-readable failure codes, so the UI picks its own copy per locale
 * instead of parsing an English sentence out of the body. Same convention as
 * `USER_ERROR_CODES`.
 */
export const AUDIT_LOG_ERROR_CODES = {
  invalidDateRange: 'INVALID_DATE_RANGE',
} as const;
