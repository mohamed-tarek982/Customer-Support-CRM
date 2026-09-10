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
 *   - Below `md` the rows render as stacked cards; from `md` up they render as a
 *     table inside its own `overflow-x-auto`, so the page itself never scrolls
 *     sideways at 320px.
 *   - Every spacing utility is logical (ms-/me-/ps-/pe-/start-/end-), so the
 *     whole screen mirrors in Arabic without a second layout.
 *   - Both dialogs go fullscreen on small viewports; a centred modal with a form
 *     in it is unusable on a phone.
 */
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/yup'
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

const PAGE_SIZE = 25

const rows = ref<UserRow[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const toast = ref('')
const toastVisible = ref(false)

const filters = reactive<UserFilters>({ ...FILTER_DEFAULTS })

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const hasFilters = computed(
  () => Object.keys(toListQuery(filters)).length > 2, // page + pageSize are always present
)

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

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const result = await users.list(toListQuery(filters, page.value, PAGE_SIZE))
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
 * Any filter change also resets to page 1 — staying on page 4 of a result set
 * that now has one page shows an empty table and looks like a failure.
 */
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => ({ ...filters }),
  () => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      page.value = 1
      void load()
    }, 300)
  },
  { deep: true },
)

watch(page, () => void load())

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
        size="large"
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
            variant="text"
            @click="resetFilters"
          >
            {{ $t('users.filters.clear') }}
          </v-btn>
        </div>
      </v-card>

      <div
        v-if="loading"
        class="py-10 text-center text-secondary/70"
      >
        {{ $t('users.loading') }}
      </div>

      <v-card
        v-else-if="rows.length === 0"
        class="p-8 text-center"
      >
        <p class="text-secondary/70">
          {{ hasFilters ? $t('users.emptyFiltered') : $t('users.empty') }}
        </p>
      </v-card>

      <template v-else>
        <!-- Narrow viewports: one card per user. A six-column table at 320px is
             a horizontal scrollbar with a table hidden behind it. -->
        <div class="flex flex-col gap-3 md:hidden">
          <v-card
            v-for="row in rows"
            :key="row.id"
            class="flex flex-col gap-3 p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate font-medium text-secondary">
                  {{ row.name || $t('users.unnamed') }}
                </p>
                <p class="truncate text-sm text-secondary/70">
                  {{ row.email }}
                </p>
              </div>
              <v-chip
                :color="row.isActive ? 'success' : 'secondary'"
                size="small"
                variant="tonal"
              >
                {{ row.isActive ? $t('users.status.active') : $t('users.status.inactive') }}
              </v-chip>
            </div>

            <dl class="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt class="text-secondary/60">
                  {{ $t('users.table.role') }}
                </dt>
                <dd class="text-secondary">
                  {{ roleLabel(row.role) }}
                </dd>
              </div>
              <div>
                <dt class="text-secondary/60">
                  {{ $t('users.table.created') }}
                </dt>
                <dd class="text-secondary">
                  {{ formatDate(new Date(row.createdAt), 'PP') }}
                </dd>
              </div>
            </dl>

            <div class="flex flex-wrap gap-2">
              <v-btn
                variant="tonal"
                size="small"
                class="min-h-11"
                @click="openEdit(row)"
              >
                {{ $t('users.actions.edit') }}
              </v-btn>
              <v-btn
                variant="tonal"
                size="small"
                class="min-h-11"
                @click="openRole(row)"
              >
                {{ $t('users.actions.assignRole') }}
              </v-btn>
              <v-btn
                v-if="row.isActive"
                variant="tonal"
                size="small"
                color="error"
                class="min-h-11"
                :disabled="!canDeactivate(row, actorId)"
                @click="openDeactivate(row)"
              >
                {{ $t('users.actions.deactivate') }}
              </v-btn>
              <v-btn
                v-else
                variant="tonal"
                size="small"
                color="success"
                class="min-h-11"
                :loading="reactivatingId === row.id"
                @click="reactivate(row)"
              >
                {{ $t('users.actions.reactivate') }}
              </v-btn>
            </div>
          </v-card>
        </div>

        <!-- Wide viewports: a real table, scrolling inside its own container so
             the page body never scrolls sideways. -->
        <v-card class="hidden md:block">
          <div class="overflow-x-auto">
            <table class="w-full min-w-[56rem] text-start text-sm">
              <caption class="sr-only">
                {{ $t('users.table.caption') }}
              </caption>
              <thead class="border-b border-secondary/15 text-secondary/70">
                <tr>
                  <th
                    scope="col"
                    class="px-4 py-3 text-start font-medium"
                  >
                    {{ $t('users.table.name') }}
                  </th>
                  <th
                    scope="col"
                    class="px-4 py-3 text-start font-medium"
                  >
                    {{ $t('users.table.email') }}
                  </th>
                  <th
                    scope="col"
                    class="px-4 py-3 text-start font-medium"
                  >
                    {{ $t('users.table.role') }}
                  </th>
                  <th
                    scope="col"
                    class="px-4 py-3 text-start font-medium"
                  >
                    {{ $t('users.table.status') }}
                  </th>
                  <th
                    scope="col"
                    class="px-4 py-3 text-start font-medium"
                  >
                    {{ $t('users.table.created') }}
                  </th>
                  <th
                    scope="col"
                    class="px-4 py-3 text-end font-medium"
                  >
                    {{ $t('users.table.actions') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in rows"
                  :key="row.id"
                  class="border-b border-secondary/10 last:border-0"
                >
                  <td class="px-4 py-3 text-secondary">
                    {{ row.name || $t('users.unnamed') }}
                  </td>
                  <td class="px-4 py-3 text-secondary/80">
                    {{ row.email }}
                  </td>
                  <td class="px-4 py-3 text-secondary/80">
                    {{ roleLabel(row.role) }}
                  </td>
                  <td class="px-4 py-3">
                    <v-chip
                      :color="row.isActive ? 'success' : 'secondary'"
                      size="small"
                      variant="tonal"
                    >
                      {{ row.isActive ? $t('users.status.active') : $t('users.status.inactive') }}
                    </v-chip>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-secondary/80">
                    {{ formatDate(new Date(row.createdAt), 'PP') }}
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-2">
                      <v-btn
                        variant="text"
                        size="small"
                        class="min-h-11"
                        @click="openEdit(row)"
                      >
                        {{ $t('users.actions.edit') }}
                      </v-btn>
                      <v-btn
                        variant="text"
                        size="small"
                        class="min-h-11"
                        @click="openRole(row)"
                      >
                        {{ $t('users.actions.assignRole') }}
                      </v-btn>
                      <v-btn
                        v-if="row.isActive"
                        variant="text"
                        size="small"
                        color="error"
                        class="min-h-11"
                        :disabled="!canDeactivate(row, actorId)"
                        :title="
                          canDeactivate(row, actorId) ? undefined : $t('users.hints.notYourself')
                        "
                        @click="openDeactivate(row)"
                      >
                        {{ $t('users.actions.deactivate') }}
                      </v-btn>
                      <v-btn
                        v-else
                        variant="text"
                        size="small"
                        color="success"
                        class="min-h-11"
                        :loading="reactivatingId === row.id"
                        @click="reactivate(row)"
                      >
                        {{ $t('users.actions.reactivate') }}
                      </v-btn>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </v-card>

        <div
          v-if="pageCount > 1"
          class="flex justify-center"
        >
          <v-pagination
            v-model="page"
            :length="pageCount"
            :total-visible="5"
            density="comfortable"
          />
        </div>
      </template>
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
            variant="text"
            size="large"
            class="w-full sm:w-auto"
            @click="createOpen = false"
          >
            {{ $t('users.actions.cancel') }}
          </v-btn>
          <v-btn
            type="submit"
            form="create-user-form"
            color="primary"
            size="large"
            class="w-full sm:w-auto"
            :loading="creating"
          >
            {{ $t('users.actions.create') }}
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
    >
      {{ toast }}
    </v-snackbar>
  </section>
</template>
