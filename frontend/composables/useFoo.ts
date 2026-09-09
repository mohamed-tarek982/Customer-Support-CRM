/**
 * Auto-import proof for SCRUM-42.
 *
 * pages/index.vue calls useFoo() with no import statement. If Nuxt's
 * auto-import scanning of composables/ ever breaks, that page stops compiling.
 */
export function useFoo(): { message: string; scannedAt: string } {
  return {
    message: 'Auto-imported from composables/useFoo.ts with no import statement.',
    scannedAt: new Date().toISOString(),
  }
}
