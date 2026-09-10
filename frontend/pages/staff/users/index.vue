<script setup lang="ts">
/**
 * Staff user administration (SCRUM-34).
 *
 * Create, edit, deactivate, reactivate and re-role the people who work in the
 * CRM. Every endpoint behind this page is `@Roles('admin')`, so the guard below
 * is UX convenience: it spares a non-admin a screen full of 403s. REDIRECT IS
 * NOT SECURITY — an agent who types the URL still gets nothing from the API.
 *
 * Layout notes, because this screen has the project's first real table:
 *   - The roster is a `v-data-table-server`. Server-side, because the API
 *     paginates and filters; the client only ever holds one page, so the table
 *     is told the total separately via `items-length`.
 *   - `mobile-breakpoint="md"` is what keeps 320px usable: below it Vuetify
 *     stacks each row into a labelled block instead of a six-column grid, so
 *     the page never scrolls sideways and there is no second layout to
 *     maintain.
 *   - Sorting is off on every column. The API orders by creation date and takes
 *     no sort parameter, and a header that looks clickable but reorders only
 *     the current page is worse than no sorting at all.
 *   - Every spacing utility is logical (ms-/me-/ps-/pe-/start-/end-) and the
 *     actions column is aligned to `end`, so the whole screen mirrors in Arabic
 *     without a second layout.
 *   - Both dialogs go fullscreen on small viewports; a centred modal with a form
 *     in it is unusable on a phone.
 */
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/yup'
import { mdiAccountCheck, mdiAccountOff, mdiPencil, mdiShieldAccount } from '@mdi/js'
import {
  CREATE_USER_DEFAULTS,
  FILTER_DEFAULTS,
  buildCreateUserSchema,
  buildUpdateUserSchema,
  canDeactivate,
  canManageUsers,
  changedUserFields,
  roleOptions,
  toListQuery,
  toUpdateForm,
  userErrorKey,
  type CreateUserForm,
  type UpdateUserForm,
  type UserFilters,
  type UserRole,
  type UserRow,
} from '~/utils/users-form'

definePageMeta({ layout: 'staff', middleware: ['auth'], userTypes: ['staff'] })

const { t } = useI18n()
const auth = useAuth()
const users = useUsersApi()
const { formatDate } = useFormattedDate()

const isAdmin = computed(() => canManageUsers(auth.role.value))
const actorId = computed(() => auth.session.value?.sub ?? null)

/** Capped at 100 to match the API's `USERS_MAX_PAGE_SIZE`; asking for more is a 400. */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const rows = ref<UserRow[]>([])
const total = ref(0)
const page = ref(1)
const itemsPerPage = ref(25)
const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const toast = ref('')
const toastVisible = ref(false)

const filters = reactive<UserFilters>({ ...FILTER_DEFAULTS })

const hasFilters = computed(
  () => Object.keys(toListQuery(filters)).length > 2, // page + pageSize are always present
)

/**
 * Column definitions. Rebuilt on a locale change so the headers translate, and
 * they double as the field labels in the stacked mobile layout — one definition
 * drives both, which is the reason this is a data table rather than two markup
 * blocks kept in sync by hand.
 */
const headers = computed(() => [
  { title: t('users.table.name'), key: 'name', sortable: false },
  { title: t('users.table.email'), key: 'email', sortable: false },
  { title: t('users.table.role'), key: 'role', sortable: false },
  { title: t('users.table.status'), key: 'isActive', sortable: false },
  { title: t('users.table.created'), key: 'createdAt', sortable: false },
  {
    title: t('users.table.actions'),
    key: 'actions',
    sortable: false,
    align: 'end' as const,
    width: 260,
  },
])

/** Status filter and status column share one source, so the two never disagree. */
const statusOptions = computed(() => [
  { value: null, title: t('users.filters.anyStatus') },
  { value: true, title: t('users.status.active') },
  { value: false, title: t('users.status.inactive') },
])

const roleFilterOptions = computed(() => [
  { value: null, title: t('users.filters.anyRole') },
  ...roleOptions(t),
])

const roleSelectOptions = computed(() => roleOptions(t))

/** Falls back to the raw value so an unrecognised role still renders as
 * something rather than as a blank cell. */
function roleLabel(role: string): string {
  const match = roleSelectOptions.value.find((option) => option.value === role)
  return match ? match.title : role
}

/**
 * Label for the row's deactivate action, icon-only in the table so this is the
 * only place its meaning appears before a click. Swaps to the "not yourself"
 * reason when the button is disabled, rather than leaving a disabled button
 * with no explanation.
 */
function deactivateLabel(row: UserRow): string {
  return canDeactivate(row, actorId.value) ? t('users.actions.deactivate') : t('users.hints.notYourself')
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const result = await users.list(toListQuery(filters, page.value, itemsPerPage.value))
    rows.value = result.items
    total.value = result.total
  } catch (error: unknown) {
    loadError.value = t(userErrorKey(error))
  } finally {
    loading.value = false
  }
}

/**
 * Debounced so typing a name is one request rather than one per keystroke.
 *
 * A filter change also returns to page 1: staying on page 4 of a result set that
 * now has one page shows an empty table and reads as a failure. Resetting the
 * page is enough to trigger a reload on its own, so this only calls `load`
 * directly when the page was already 1 — otherwise the same filter change would
 * fire two identical requests.
 */
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => ({ ...filters }),
  () => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      if (page.value !== 1) page.value = 1
      else void load()
    }, 300)
  },
  { deep: true },
)

// The table drives both of these through v-model, so paging and resizing the
// page reload from one place rather than from an options-changed handler whose
// firing on mount would race the initial load.
watch([page, itemsPerPage], () => void load())

function resetFilters(): void {
  Object.assign(filters, FILTER_DEFAULTS)
}

function announce(key: string): void {
  toast.value = t(key)
  toastVisible.value = true
}

/** One place turns a failed mutation into localized copy, so every dialog and
 * row action reports failures the same way. */
function reportFailure(error: unknown): void {
  actionError.value = t(userErrorKey(error))
}

// --- Create -----------------------------------------------------------------

const createOpen = ref(false)
const creating = ref(false)

const createForm = useForm<CreateUserForm>({
  validationSchema: toTypedSchema(buildCreateUserSchema(t)),
  initialValues: { ...CREATE_USER_DEFAULTS },
})

const [newEmail, newEmailAttrs] = createForm.defineField('email')
const [newName, newNameAttrs] = createForm.defineField('name')
const [newRole, newRoleAttrs] = createForm.defineField('role')
const [newBranchId, newBranchIdAttrs] = createForm.defineField('branchId')
const [newDepartmentId, newDepartmentIdAttrs] = createForm.defineField('departmentId')
const [newPassword, newPasswordAttrs] = createForm.defineField('password')

function openCreate(): void {
  actionError.value = ''
  createForm.resetForm({ values: { ...CREATE_USER_DEFAULTS } })
  createOpen.value = true
}

const onCreate = createForm.handleSubmit(async (values) => {
  actionError.value = ''
  creating.value = true
  try {
    await users.create({
      ...values,
      branchId: values.branchId || null,
      departmentId: values.departmentId || null,
    })
    createOpen.value = false
    announce('users.toasts.created')
    await load()
  } catch (error: unknown) {
    reportFailure(error)
  } finally {
    creating.value = false
  }
})

// --- Edit -------------------------------------------------------------------

const editOpen = ref(false)
const saving = ref(false)
const editing = ref<UserRow | null>(null)
/** The values the server last confirmed. The PATCH diff is taken against these. */
const editOriginal = ref<UpdateUserForm | null>(null)

const editFormApi = useForm<UpdateUserForm>({
  validationSchema: toTypedSchema(buildUpdateUserSchema(t)),
})

const [editEmail, editEmailAttrs] = editFormApi.defineField('email')
const [editName, editNameAttrs] = editFormApi.defineField('name')
const [editRole, editRoleAttrs] = editFormApi.defineField('role')
const [editBranchId, editBranchIdAttrs] = editFormApi.defineField('branchId')
const [editDepartmentId, editDepartmentIdAttrs] = editFormApi.defineField('departmentId')

function openEdit(row: UserRow): void {
  actionError.value = ''
  editing.value = row
  editOriginal.value = toUpdateForm(row)
  editFormApi.resetForm({ values: { ...editOriginal.value } })
  editOpen.value = true
}

const onEdit = editFormApi.handleSubmit(async (values) => {
  const target = editing.value
  const original = editOriginal.value
  if (!target || !original) return

  const patch = changedUserFields(original, values)
  if (Object.keys(patch).length === 0) {
    editOpen.value = false
    return
  }

  actionError.value = ''
  saving.value = true
  try {
    await users.update(target.id, patch)
    editOpen.value = false
    announce('users.toasts.updated')
    await load()
  } catch (error: unknown) {
    reportFailure(error)
  } finally {
    saving.value = false
  }
})

// --- Assign role ------------------------------------------------------------

const roleOpen = ref(false)
const assigning = ref(false)
const roleTarget = ref<UserRow | null>(null)
const pendingRole = ref<UserRole>('agent')

function openRole(row: UserRow): void {
  actionError.value = ''
  roleTarget.value = row
  pendingRole.value = toUpdateForm(row).role
  roleOpen.value = true
}

async function confirmRole(): Promise<void> {
  const target = roleTarget.value
  if (!target) return

  actionError.value = ''
  assigning.value = true
  try {
    await users.assignRole(target.id, pendingRole.value)
    roleOpen.value = false
    announce('users.toasts.roleAssigned')
    await load()
  } catch (error: unknown) {
    reportFailure(error)
  } finally {
    assigning.value = false
  }
}

// --- Deactivate / reactivate ------------------------------------------------

const confirmOpen = ref(false)
const confirming = ref(false)
const deactivateTarget = ref<UserRow | null>(null)

/** Disabling an account ends its sessions, so it asks first. Re-enabling one is
 * harmless and reversible, so it does not. */
function openDeactivate(row: UserRow): void {
  actionError.value = ''
  deactivateTarget.value = row
  confirmOpen.value = true
}

async function confirmDeactivate(): Promise<void> {
  const target = deactivateTarget.value
  if (!target) return

  actionError.value = ''
  confirming.value = true
  try {
    await users.deactivate(target.id)
    confirmOpen.value = false
    announce('users.toasts.deactivated')
    await load()
  } catch (error: unknown) {
    reportFailure(error)
  } finally {
    confirming.value = false
  }
}

const reactivatingId = ref<string | null>(null)

async function reactivate(row: UserRow): Promise<void> {
  actionError.value = ''
  reactivatingId.value = row.id
  try {
    await users.reactivate(row.id)
    announce('users.toasts.reactivated')
    await load()
  } catch (error: unknown) {
    reportFailure(error)
  } finally {
    reactivatingId.value = null
  }
}

onMounted(() => {
  if (isAdmin.value) void load()
  else loading.value = false
})
</script>

<template>
  <section class="flex flex-col gap-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold text-secondary">
          {{ $t('users.title') }}
        </h1>
        <p class="max-w-2xl text-sm text-secondary/70">
          {{ $t('users.subtitle') }}
        </p>
      </div>

      <v-btn
        v-if="isAdmin"
        color="primary"
        class="w-full sm:w-auto"
        @click="openCreate"
      >
        {{ $t('users.actions.create') }}
      </v-btn>
    </header>

    <!-- The API is the boundary; this only keeps an agent off a screen that
         would answer every request with a 403. -->
    <v-alert
      v-if="!isAdmin"
      type="info"
      variant="tonal"
      density="comfortable"
    >
      {{ $t('users.adminOnlyNotice') }}
    </v-alert>

    <template v-else>
      <v-alert
        v-if="loadError"
        type="error"
        variant="tonal"
      >
        {{ loadError }}
      </v-alert>

      <v-alert
        v-if="actionError"
        type="error"
        variant="tonal"
        closable
        @click:close="actionError = ''"
      >
        {{ actionError }}
      </v-alert>

      <v-card class="p-4 sm:p-6">
        <h2 class="sr-only">
          {{ $t('users.filters.legend') }}
        </h2>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <v-text-field
            v-model="filters.q"
            :label="$t('users.filters.search')"
            :placeholder="$t('users.filters.searchPlaceholder')"
            clearable
            hide-details
            density="comfortable"
          />

          <v-select
            v-model="filters.role"
            :items="roleFilterOptions"
            :label="$t('users.filters.role')"
            hide-details
            density="comfortable"
          />

          <v-select
            v-model="filters.isActive"
            :items="statusOptions"
            :label="$t('users.filters.status')"
            hide-details
            density="comfortable"
          />

          <!-- TODO: swap both for pickers once branch/department management
               ships (SCRUM-41). Until then an id is the only handle there is. -->
          <v-text-field
            v-model="filters.branchId"
            :label="$t('users.filters.branch')"
            :hint="$t('users.hints.branchId')"
            clearable
            hide-details
            density="comfortable"
          />
        </div>

        <div
          v-if="hasFilters"
          class="mt-4 flex justify-end"
        >
          <v-btn
            color="primary"
            variant="outlined"
            @click="resetFilters"
          >
            {{ $t('users.filters.clear') }}
          </v-btn>
        </div>
      </v-card>

      <!--
        `items-length` comes from the API rather than from `items.length`: the
        client holds one page, and the footer's "1-25 of 90" has to count rows
        the browser has never seen.
      -->
      <v-data-table-server
        v-model:page="page"
        v-model:items-per-page="itemsPerPage"
        :headers="headers"
        :items="rows"
        :items-length="total"
        :loading="loading"
        :items-per-page-options="PAGE_SIZE_OPTIONS"
        :loading-text="$t('users.loading')"
        :aria-label="$t('users.table.caption')"
        mobile-breakpoint="md"
        item-value="id"
        hover
      >
        <template #no-data>
          <p class="py-8 text-center text-secondary/70">
            {{ hasFilters ? $t('users.emptyFiltered') : $t('users.empty') }}
          </p>
        </template>

        <template #[`item.name`]="{ item }">
          {{ item.name || $t('users.unnamed') }}
        </template>

        <template #[`item.role`]="{ item }">
          {{ roleLabel(item.role) }}
        </template>

        <template #[`item.isActive`]="{ item }">
          <v-chip
            :color="item.isActive ? 'success' : 'secondary'"
            size="small"
            variant="tonal"
          >
            {{ item.isActive ? $t('users.status.active') : $t('users.status.inactive') }}
          </v-chip>
        </template>

        <!-- Never a hand-built date string: the helper formats through the
             active locale, so Arabic gets Arabic month names. -->
        <template #[`item.createdAt`]="{ item }">
          {{ formatDate(new Date(item.createdAt), 'PP') }}
        </template>

        <!--
          Icon-only row actions. A text label per action does not fit a dense
          row four times over on a narrow screen; the icon does. Each label
          still exists for assistive tech via `aria-label`, and for a sighted
          pointer user via `v-tooltip` on hover and keyboard focus — the
          translation just moved off the button face, it was not dropped.
        -->
        <template #[`item.actions`]="{ item }">
          <div class="flex flex-wrap justify-end gap-1">
            <v-tooltip :text="$t('users.actions.edit')">
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  :icon="mdiPencil"
                  color="grey-darken-2"
                  variant="text"
                  size="small"
                  class="min-h-11 min-w-11"
                  :aria-label="$t('users.actions.edit')"
                  @click="openEdit(item)"
                />
              </template>
            </v-tooltip>
            <v-tooltip :text="$t('users.actions.assignRole')">
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  color="grey-darken-2"
                  :icon="mdiShieldAccount"
                  variant="text"
                  size="small"
                  class="min-h-11 min-w-11"
                  :aria-label="$t('users.actions.assignRole')"
                  @click="openRole(item)"
                />
              </template>
            </v-tooltip>
            <v-tooltip
              v-if="item.isActive"
              :text="deactivateLabel(item)"
            >
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  :icon="mdiAccountOff"
                  variant="text"
                  size="small"
                  color="error"
                  class="min-h-11 min-w-11"
                  :disabled="!canDeactivate(item, actorId)"
                  :aria-label="deactivateLabel(item)"
                  @click="openDeactivate(item)"
                />
              </template>
            </v-tooltip>
            <v-tooltip
              v-else
              :text="$t('users.actions.reactivate')"
            >
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  :icon="mdiAccountCheck"
                  variant="text"
                  size="small"
                  color="success"
                  class="min-h-11 min-w-11"
                  :loading="reactivatingId === item.id"
                  :aria-label="$t('users.actions.reactivate')"
                  @click="reactivate(item)"
                />
              </template>
            </v-tooltip>
          </div>
        </template>
      </v-data-table-server>
    </template>

    <!-- Create ------------------------------------------------------------ -->
    <v-dialog
      v-model="createOpen"
      max-width="640"
      :fullscreen="$vuetify.display.smAndDown"
      scrollable
    >
      <v-card>
        <v-card-title class="text-lg font-semibold">
          {{ $t('users.dialogs.createTitle') }}
        </v-card-title>

        <v-card-text>
          <form
            id="create-user-form"
            novalidate
            class="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2"
            @submit.prevent="onCreate"
          >
            <v-text-field
              v-model="newName"
              v-bind="newNameAttrs"
              :label="$t('users.fields.name')"
              :error-messages="createForm.errors.value.name ? [createForm.errors.value.name] : []"
            />
            <v-text-field
              v-model="newEmail"
              v-bind="newEmailAttrs"
              type="email"
              autocomplete="off"
              :label="$t('users.fields.email')"
              :error-messages="createForm.errors.value.email ? [createForm.errors.value.email] : []"
            />
            <v-select
              v-model="newRole"
              v-bind="newRoleAttrs"
              :items="roleSelectOptions"
              :label="$t('users.fields.role')"
              :error-messages="createForm.errors.value.role ? [createForm.errors.value.role] : []"
            />
            <v-text-field
              v-model="newPassword"
              v-bind="newPasswordAttrs"
              type="password"
              autocomplete="new-password"
              :label="$t('users.fields.password')"
              :hint="$t('users.hints.password')"
              persistent-hint
              :error-messages="
                createForm.errors.value.password ? [createForm.errors.value.password] : []
              "
            />
            <v-text-field
              v-model="newBranchId"
              v-bind="newBranchIdAttrs"
              :label="$t('users.fields.branchId')"
              :hint="$t('users.hints.branchId')"
              persistent-hint
            />
            <v-text-field
              v-model="newDepartmentId"
              v-bind="newDepartmentIdAttrs"
              :label="$t('users.fields.departmentId')"
              :hint="$t('users.hints.departmentId')"
              persistent-hint
            />
          </form>
        </v-card-text>

        <v-card-actions class="flex flex-col gap-2 p-4 sm:flex-row sm:justify-end">
          <v-btn
            class="w-full sm:w-auto"
            @click="createOpen = false"
          >
            {{ $t('users.actions.cancel') }}
          </v-btn>
          <v-btn
            type="submit"
            form="create-user-form"
            color="primary"
            class="w-full sm:w-auto"
            :loading="creating"
            variant="tonal"
          >
            <span class="font-semibold">   {{ $t('users.actions.create') }} </span>
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Edit -------------------------------------------------------------- -->
    <v-dialog
      v-model="editOpen"
      max-width="640"
      :fullscreen="$vuetify.display.smAndDown"
      scrollable
    >
      <v-card>
        <v-card-title class="text-lg font-semibold">
          {{ $t('users.dialogs.editTitle') }}
        </v-card-title>

        <v-card-text>
          <form
            id="edit-user-form"
            novalidate
            class="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2"
            @submit.prevent="onEdit"
          >
            <v-text-field
              v-model="editName"
              v-bind="editNameAttrs"
              :label="$t('users.fields.name')"
              :error-messages="
                editFormApi.errors.value.name ? [editFormApi.errors.value.name] : []
              "
            />
            <v-text-field
              v-model="editEmail"
              v-bind="editEmailAttrs"
              type="email"
              :label="$t('users.fields.email')"
              :error-messages="
                editFormApi.errors.value.email ? [editFormApi.errors.value.email] : []
              "
            />
            <v-select
              v-model="editRole"
              v-bind="editRoleAttrs"
              :items="roleSelectOptions"
              :label="$t('users.fields.role')"
              :error-messages="
                editFormApi.errors.value.role ? [editFormApi.errors.value.role] : []
              "
            />
            <v-text-field
              v-model="editBranchId"
              v-bind="editBranchIdAttrs"
              :label="$t('users.fields.branchId')"
              :hint="$t('users.hints.branchId')"
              persistent-hint
            />
            <v-text-field
              v-model="editDepartmentId"
              v-bind="editDepartmentIdAttrs"
              :label="$t('users.fields.departmentId')"
              :hint="$t('users.hints.departmentId')"
              persistent-hint
            />
          </form>

          <p class="mt-4 text-sm text-secondary/60">
            {{ $t('users.hints.noPasswordOnEdit') }}
          </p>
        </v-card-text>

        <v-card-actions class="flex flex-col gap-2 p-4 sm:flex-row sm:justify-end">
          <v-btn
            variant="text"
            size="large"
            class="w-full sm:w-auto"
            @click="editOpen = false"
          >
            {{ $t('users.actions.cancel') }}
          </v-btn>
          <v-btn
            type="submit"
            form="edit-user-form"
            color="primary"
            size="large"
            class="w-full sm:w-auto"
            :loading="saving"
          >
            {{ $t('users.actions.save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Assign role ------------------------------------------------------- -->
    <v-dialog
      v-model="roleOpen"
      max-width="480"
      :fullscreen="$vuetify.display.smAndDown"
    >
      <v-card>
        <v-card-title class="text-lg font-semibold">
          {{ $t('users.dialogs.roleTitle') }}
        </v-card-title>

        <v-card-text class="flex flex-col gap-4">
          <p class="text-sm text-secondary/70">
            {{ $t('users.dialogs.roleBody', { name: roleTarget?.email ?? '' }) }}
          </p>
          <v-select
            v-model="pendingRole"
            :items="roleSelectOptions"
            :label="$t('users.fields.role')"
          />
        </v-card-text>

        <v-card-actions class="flex flex-col gap-2 p-4 sm:flex-row sm:justify-end">
          <v-btn
            variant="text"
            size="large"
            class="w-full sm:w-auto"
            @click="roleOpen = false"
          >
            {{ $t('users.actions.cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            size="large"
            class="w-full sm:w-auto"
            :loading="assigning"
            @click="confirmRole"
          >
            {{ $t('users.actions.assignRole') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Deactivate confirmation ------------------------------------------- -->
    <v-dialog
      v-model="confirmOpen"
      max-width="480"
    >
      <v-card>
        <v-card-title class="text-lg font-semibold">
          {{ $t('users.dialogs.deactivateTitle') }}
        </v-card-title>

        <v-card-text class="flex flex-col gap-2">
          <p class="text-sm text-secondary/80">
            {{ $t('users.dialogs.deactivateBody', { name: deactivateTarget?.email ?? '' }) }}
          </p>
          <p class="text-sm text-secondary/60">
            {{ $t('users.dialogs.deactivateConsequence') }}
          </p>
        </v-card-text>

        <v-card-actions class="flex flex-col gap-2 p-4 sm:flex-row sm:justify-end">
          <v-btn
            variant="text"
            size="large"
            class="w-full sm:w-auto"
            @click="confirmOpen = false"
          >
            {{ $t('users.actions.cancel') }}
          </v-btn>
          <v-btn
            color="error"
            size="large"
            class="w-full sm:w-auto"
            :loading="confirming"
            @click="confirmDeactivate"
          >
            {{ $t('users.actions.deactivate') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar
      v-model="toastVisible"
      color="success"
      :timeout="4000"
      location="bottom left"
    >
      {{ toast }}
    </v-snackbar>
  </section>
</template>
