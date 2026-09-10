<script setup lang="ts">
/**
 * Audit trail (SCRUM-35).
 *
 * Read-only, on purpose and permanently: every row here was written by the
 * backend's global interceptor, and there is no control on this screen that can
 * change one. The endpoint behind it is `@Roles('admin')`, so the guard below is
 * UX convenience — it spares a non-admin a screen full of 403s. REDIRECT IS NOT
 * SECURITY: an agent who types the URL still gets nothing from the API.
 *
 * Layout notes:
 *   - The trail is a `v-data-table-server`, matching the users roster. The API
 *     paginates and filters, so the client only ever holds one page and the
 *     table is told the total separately via `items-length`.
 *   - `mobile-breakpoint="md"` keeps 320px usable: below it Vuetify stacks each
 *     row into a labelled block instead of a six-column grid, so the page never
 *     scrolls sideways.
 *   - Metadata goes in an expandable row rather than a column. It is a JSON
 *     blob of arbitrary size and cannot share a row with five other fields; the
 *     `<pre>` it renders in carries its own `overflow-x-auto` so a long line
 *     scrolls inside the panel and not the page.
 *   - Sorting is off on every column. The API orders newest-first and takes no
 *     sort parameter, and a header that reorders only the current page of an
 *     audit trail is worse than no sorting at all.
 *   - Every spacing utility is logical (ms-/me-/ps-/pe-/start-/end-), so the
 *     screen mirrors in Arabic without a second layout. The `<pre>` is the one
 *     deliberate exception: JSON and route paths are LTR content, so the panel
 *     pins `dir="ltr"` rather than mirroring a payload into nonsense.
 */
import { mdiChevronDown, mdiChevronUp } from '@mdi/js'
import {
  AUDIT_LOG_FILTER_DEFAULTS,
  actionPath,
  actionVerb,
  auditLogErrorKey,
  canReadAuditLogs,
  formatMetadata,
  hasActiveFilters,
  hasMetadata,
  isInvalidRange,
  toAuditLogListQuery,
  verbColor,
  type AuditLogFilters,
  type AuditLogRow,
} from '~/utils/audit-logs-form'

definePageMeta({ layout: 'staff', middleware: ['auth'], userTypes: ['staff'] })

const { t } = useI18n()
const auth = useAuth()
const auditLogs = useAuditLogsApi()
const { formatDate } = useFormattedDate()

const isAdmin = computed(() => canReadAuditLogs(auth.role.value))

/** Capped at 100 to match the API's `AUDIT_LOGS_MAX_PAGE_SIZE`; asking for more
 * is a 400. */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const rows = ref<AuditLogRow[]>([])
const total = ref(0)
const page = ref(1)
const itemsPerPage = ref(25)
const loading = ref(true)
const loadError = ref('')
const expanded = ref<string[]>([])

const filters = reactive<AuditLogFilters>({ ...AUDIT_LOG_FILTER_DEFAULTS })

const filtered = computed(() => hasActiveFilters(filters))
const invalidRange = computed(() => isInvalidRange(filters))

/**
 * Column definitions. Rebuilt on a locale change so the headers translate, and
 * they double as the field labels in the stacked mobile layout — one definition
 * drives both, which is why this is a data table rather than two markup blocks
 * kept in sync by hand.
 */
const headers = computed(() => [
  { title: t('auditLogs.table.timestamp'), key: 'createdAt', sortable: false },
  { title: t('auditLogs.table.actor'), key: 'actorUserId', sortable: false },
  { title: t('auditLogs.table.action'), key: 'action', sortable: false },
  { title: t('auditLogs.table.resourceType'), key: 'resourceType', sortable: false },
  { title: t('auditLogs.table.resourceId'), key: 'resourceId', sortable: false },
  {
    title: t('auditLogs.table.details'),
    key: 'data-table-expand',
    sortable: false,
    align: 'end' as const,
  },
])

async function load(): Promise<void> {
  // The API refuses an inverted range with a 400. Catching it here keeps the
  // message under the field instead of replacing the table with an error box.
  if (invalidRange.value) {
    rows.value = []
    total.value = 0
    loading.value = false
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    const result = await auditLogs.list(toAuditLogListQuery(filters, page.value, itemsPerPage.value))
    rows.value = result.items
    total.value = result.total
  } catch (error: unknown) {
    loadError.value = t(auditLogErrorKey(error))
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/**
 * Debounced so typing an id is one request rather than one per keystroke.
 *
 * A filter change also returns to page 1: staying on page 4 of a result set that
 * now has one page shows an empty table and reads as a failure. Resetting the
 * page triggers a reload on its own, so this only calls `load` directly when the
 * page was already 1 — otherwise one filter change fires two identical requests.
 */
let filterTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => ({ ...filters }),
  () => {
    if (filterTimer) clearTimeout(filterTimer)
    filterTimer = setTimeout(() => {
      if (page.value !== 1) page.value = 1
      else void load()
    }, 300)
  },
  { deep: true },
)

// The table drives both of these through v-model, so paging and resizing reload
// from one place rather than from an options-changed handler whose firing on
// mount would race the initial load.
watch([page, itemsPerPage], () => void load())

onBeforeUnmount(() => {
  if (filterTimer) clearTimeout(filterTimer)
})

function resetFilters(): void {
  Object.assign(filters, AUDIT_LOG_FILTER_DEFAULTS)
}

onMounted(() => {
  if (isAdmin.value) void load()
  else loading.value = false
})
</script>

<template>
  <section class="flex flex-col gap-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold text-secondary">
        {{ $t('auditLogs.title') }}
      </h1>
      <p class="max-w-2xl text-sm text-secondary/70">
        {{ $t('auditLogs.subtitle') }}
      </p>
    </header>

    <!-- The API is the boundary; this only keeps an agent off a screen that
         would answer every request with a 403. -->
    <v-alert
      v-if="!isAdmin"
      type="info"
      variant="tonal"
      density="comfortable"
    >
      {{ $t('auditLogs.adminOnlyNotice') }}
    </v-alert>

    <template v-else>
      <v-alert
        v-if="loadError"
        type="error"
        variant="tonal"
      >
        {{ loadError }}
      </v-alert>

      <v-card class="p-4 sm:p-6">
        <h2 class="sr-only">
          {{ $t('auditLogs.filters.legend') }}
        </h2>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <v-text-field
            v-model="filters.q"
            :label="$t('auditLogs.filters.search')"
            :placeholder="$t('auditLogs.filters.searchPlaceholder')"
            clearable
            hide-details
            density="comfortable"
          />

          <v-text-field
            v-model="filters.action"
            :label="$t('auditLogs.filters.action')"
            :placeholder="$t('auditLogs.filters.actionPlaceholder')"
            clearable
            hide-details
            density="comfortable"
          />

          <!-- TODO: swap for a user picker once the roster exposes a lookup
               endpoint (SCRUM-34 covers the list, not a typeahead). Until then
               an id is the only handle there is. -->
          <v-text-field
            v-model="filters.actorUserId"
            :label="$t('auditLogs.filters.actor')"
            :hint="$t('auditLogs.hints.actorId')"
            clearable
            hide-details
            density="comfortable"
          />

          <v-text-field
            v-model="filters.resourceType"
            :label="$t('auditLogs.filters.resourceType')"
            :hint="$t('auditLogs.hints.resourceType')"
            clearable
            hide-details
            density="comfortable"
          />

          <v-text-field
            v-model="filters.resourceId"
            :label="$t('auditLogs.filters.resourceId')"
            clearable
            hide-details
            density="comfortable"
          />

          <!--
            Native date inputs rather than a picker: they localize themselves,
            mirror in RTL without help, and are the only date control that is
            usable one-handed at 320px.
          -->
          <v-text-field
            v-model="filters.from"
            type="date"
            :label="$t('auditLogs.filters.from')"
            :max="filters.to || undefined"
            clearable
            hide-details
            density="comfortable"
          />

          <v-text-field
            v-model="filters.to"
            type="date"
            :label="$t('auditLogs.filters.to')"
            :min="filters.from || undefined"
            clearable
            hide-details
            density="comfortable"
          />
        </div>

        <v-alert
          v-if="invalidRange"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-4"
        >
          {{ $t('auditLogs.errors.invalidDateRange') }}
        </v-alert>

        <div
          v-if="filtered"
          class="mt-4 flex justify-end"
        >
          <v-btn
            color="primary"
            variant="outlined"
            @click="resetFilters"
          >
            {{ $t('auditLogs.filters.clear') }}
          </v-btn>
        </div>
      </v-card>

      <!--
        `items-length` comes from the API rather than from `items.length`: the
        client holds one page, and the footer's "1-25 of 900" has to count rows
        the browser has never seen.
      -->
      <v-data-table-server
        v-model:page="page"
        v-model:items-per-page="itemsPerPage"
        v-model:expanded="expanded"
        :headers="headers"
        :items="rows"
        :items-length="total"
        :loading="loading"
        :items-per-page-options="PAGE_SIZE_OPTIONS"
        :loading-text="$t('auditLogs.loading')"
        :aria-label="$t('auditLogs.table.caption')"
        mobile-breakpoint="md"
        item-value="id"
        show-expand
        hover
      >
        <template #no-data>
          <p class="py-8 text-center text-secondary/70">
            {{ filtered ? $t('auditLogs.emptyFiltered') : $t('auditLogs.empty') }}
          </p>
        </template>

        <!-- Never a hand-built date string: the helper formats through the
             active locale, so Arabic gets Arabic month names. -->
        <template #[`item.createdAt`]="{ item }">
          {{ formatDate(new Date(item.createdAt), 'PPpp') }}
        </template>

        <!-- The interceptor writes a null actor for an unauthenticated
             mutation, a failed login being the everyday case. Those rows are
             the ones an admin most wants to see, so they render as an em dash
             rather than being hidden or blank. -->
        <template #[`item.actorUserId`]="{ item }">
          <span
            v-if="item.actorUserId"
            dir="ltr"
            class="font-mono text-xs"
          >{{ item.actorUserId }}</span>
          <span
            v-else
            class="text-secondary/60"
          >{{ $t('auditLogs.anonymous') }}</span>
        </template>

        <template #[`item.action`]="{ item }">
          <div class="flex flex-wrap items-center gap-2">
            <v-chip
              v-if="actionVerb(item.action)"
              :color="verbColor(actionVerb(item.action))"
              size="small"
              variant="tonal"
            >
              {{ actionVerb(item.action) }}
            </v-chip>
            <span
              dir="ltr"
              class="font-mono text-xs"
            >{{ actionPath(item.action) }}</span>
          </div>
        </template>

        <template #[`item.resourceId`]="{ item }">
          <span
            v-if="item.resourceId"
            dir="ltr"
            class="font-mono text-xs"
          >{{ item.resourceId }}</span>
          <span
            v-else
            class="text-secondary/60"
          >{{ $t('auditLogs.none') }}</span>
        </template>

        <!--
          The expand toggle, replaced so a row with nothing recorded does not
          offer a control that opens an empty panel.
        -->
        <template #[`item.data-table-expand`]="{ item, internalItem, isExpanded, toggleExpand }">
          <v-tooltip
            v-if="hasMetadata(item)"
            :text="$t('auditLogs.actions.toggleDetails')"
          >
            <template #activator="{ props: tooltipProps }">
              <v-btn
                v-bind="tooltipProps"
                :icon="isExpanded(internalItem) ? mdiChevronUp : mdiChevronDown"
                color="grey-darken-2"
                variant="text"
                size="small"
                class="min-h-11 min-w-11"
                :aria-label="$t('auditLogs.actions.toggleDetails')"
                :aria-expanded="isExpanded(internalItem)"
                @click="toggleExpand(internalItem)"
              />
            </template>
          </v-tooltip>
          <span
            v-else
            class="text-secondary/60"
          >{{ $t('auditLogs.none') }}</span>
        </template>

        <!--
          `dir="ltr"` and `overflow-x-auto` are both load-bearing: the payload is
          JSON, which is LTR whatever the page locale is, and a long line has to
          scroll inside this panel rather than sideways-scrolling the page.

          A truncated body arrives as the literal string `[TRUNCATED]` and is
          rendered as-is. It is not JSON and must not be parsed as any.
        -->
        <template #expanded-row="{ columns, item }">
          <tr>
            <td
              :colspan="columns.length"
              class="p-0"
            >
              <div class="bg-secondary/5 p-4">
                <p class="mb-2 text-xs font-semibold uppercase text-secondary/70">
                  {{ $t('auditLogs.table.details') }}
                </p>
                <pre
                  dir="ltr"
                  class="max-h-80 overflow-x-auto overflow-y-auto text-xs leading-relaxed"
                >{{ formatMetadata(item.metadata) }}</pre>
              </div>
            </td>
          </tr>
        </template>
      </v-data-table-server>
    </template>
  </section>
</template>
