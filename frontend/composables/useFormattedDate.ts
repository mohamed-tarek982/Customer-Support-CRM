// NO MOMENT. date-fns is the project's date library. Moment.js is deprecated,
// has a mutable API that makes date bugs action-at-a-distance, and does not
// tree-shake, so it costs every page in the bundle. Do not add it.
import { format, formatDistanceToNow } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'

/**
 * Locale-aware date formatting. Arabic dates go through the `ar` locale so the
 * RTL pages read correctly rather than showing English month names.
 */
export function useFormattedDate() {
  const { locale } = useI18n()

  const dateFnsLocale = computed(() => (locale.value === 'ar' ? ar : enUS))

  function formatDate(value: Date | number, pattern = 'PPp'): string {
    return format(value, pattern, { locale: dateFnsLocale.value })
  }

  function fromNow(value: Date | number): string {
    return formatDistanceToNow(value, { addSuffix: true, locale: dateFnsLocale.value })
  }

  return { formatDate, fromNow }
}
