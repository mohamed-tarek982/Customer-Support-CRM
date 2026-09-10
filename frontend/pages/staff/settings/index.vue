<script setup lang="ts">
/**
 * Org-wide system settings (SCRUM-36).
 *
 * Reads and writes `/settings`. A save takes effect immediately — the API keeps
 * an in-process cache that it refreshes on write — so there is nothing to
 * restart and no deploy to wait for.
 *
 * The page renders for every staff member: agents see the same values read-only,
 * because the values describe the workspace they are working in. Hiding the
 * submit button is UX, not a boundary — `@Roles('admin')` on the API is.
 */
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/yup'
import {
  LOCALE_OPTIONS,
  SETTINGS_DEFAULTS,
  buildSettingsSchema,
  canEditSettings,
  changedKeys,
  toFormModel,
  type SettingsForm,
} from '~/utils/settings-form'

definePageMeta({ layout: 'staff', middleware: ['auth'], userTypes: ['staff'] })

const { t } = useI18n()
const api = useApi()
const auth = useAuth()

const canEdit = computed(() => canEditSettings(auth.role.value))

const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const submitError = ref('')
const savedVisible = ref(false)

/** The last values the server confirmed. The save diff is taken against these. */
const original = ref<SettingsForm>({ ...SETTINGS_DEFAULTS })

const { defineField, handleSubmit, errors, resetForm, values } = useForm<SettingsForm>({
  validationSchema: toTypedSchema(buildSettingsSchema(t)),
  initialValues: { ...SETTINGS_DEFAULTS },
})

const [orgName, orgNameAttrs] = defineField('orgName')
const [timezone, timezoneAttrs] = defineField('timezone')
const [defaultLocale, defaultLocaleAttrs] = defineField('defaultLocale')
const [dateFormat, dateFormatAttrs] = defineField('dateFormat')
const [customerPortal, customerPortalAttrs] = defineField('customerPortal')

const isDirty = computed(() => Object.keys(changedKeys(original.value, values)).length > 0)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const settings = await api<Record<string, unknown>>('/settings')
    original.value = toFormModel(settings)
    resetForm({ values: { ...original.value } })
  } catch {
    loadError.value = t('settings.errors.load')
  } finally {
    loading.value = false
  }
}

const onSubmit = handleSubmit(async (formValues) => {
  const patch = changedKeys(original.value, formValues)
  if (Object.keys(patch).length === 0) return

  submitError.value = ''
  saving.value = true
  try {
    await api('/settings', { method: 'PUT', body: { patch } })
    // Refetch rather than trusting the local model: the server is the authority
    // on what was stored, including anything another admin changed meanwhile.
    await load()
    savedVisible.value = true
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } }).response?.status
    submitError.value =
      status === 403 ? t('settings.errors.forbidden') : t('settings.errors.validation')
  } finally {
    saving.value = false
  }
})

function onDiscard(): void {
  submitError.value = ''
  resetForm({ values: { ...original.value } })
}

onMounted(load)
</script>

<template>
  <section class="flex flex-col gap-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold text-secondary">
        {{ $t('settings.title') }}
      </h1>
      <p class="max-w-2xl text-sm text-secondary/70">
        {{ $t('settings.subtitle') }}
      </p>
    </header>

    <v-alert
      v-if="!canEdit"
      type="info"
      variant="tonal"
      density="comfortable"
    >
      {{ $t('settings.readOnlyNotice') }}
    </v-alert>

    <v-alert
      v-if="loadError"
      type="error"
      variant="tonal"
    >
      {{ loadError }}
    </v-alert>

    <v-alert
      v-if="submitError"
      type="error"
      variant="tonal"
    >
      {{ submitError }}
    </v-alert>

    <div
      v-if="loading"
      class="py-10 text-center text-secondary/70"
    >
      {{ $t('settings.loading') }}
    </div>

    <form
      v-else
      novalidate
      class="flex flex-col gap-6"
      @submit.prevent="onSubmit"
    >
      <v-card class="p-4 sm:p-6">
        <h2 class="mb-4 text-lg font-semibold text-secondary">
          {{ $t('settings.sections.general') }}
        </h2>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <v-text-field
            v-model="orgName"
            v-bind="orgNameAttrs"
            :label="$t('settings.fields.orgName')"
            :hint="$t('settings.hints.orgName')"
            persistent-hint
            :disabled="!canEdit"
            :error-messages="errors.orgName ? [errors.orgName] : []"
          />

          <!-- TODO: swap for a timezone select once the list has a home (SCRUM-41). -->
          <v-text-field
            v-model="timezone"
            v-bind="timezoneAttrs"
            :label="$t('settings.fields.timezone')"
            :hint="$t('settings.hints.timezone')"
            persistent-hint
            :disabled="!canEdit"
            :error-messages="errors.timezone ? [errors.timezone] : []"
          />
        </div>
      </v-card>

      <v-card class="p-4 sm:p-6">
        <h2 class="mb-4 text-lg font-semibold text-secondary">
          {{ $t('settings.sections.localisation') }}
        </h2>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <v-select
            v-model="defaultLocale"
            v-bind="defaultLocaleAttrs"
            :items="LOCALE_OPTIONS"
            :label="$t('settings.fields.defaultLocale')"
            :hint="$t('settings.hints.defaultLocale')"
            persistent-hint
            :disabled="!canEdit"
            :error-messages="errors.defaultLocale ? [errors.defaultLocale] : []"
          />

          <v-text-field
            v-model="dateFormat"
            v-bind="dateFormatAttrs"
            :label="$t('settings.fields.dateFormat')"
            :hint="$t('settings.hints.dateFormat')"
            persistent-hint
            :disabled="!canEdit"
            :error-messages="errors.dateFormat ? [errors.dateFormat] : []"
          />
        </div>
      </v-card>

      <v-card class="p-4 sm:p-6">
        <h2 class="mb-4 text-lg font-semibold text-secondary">
          {{ $t('settings.sections.features') }}
        </h2>

        <v-switch
          v-model="customerPortal"
          v-bind="customerPortalAttrs"
          color="primary"
          :label="$t('settings.fields.features.customerPortal')"
          :hint="$t('settings.hints.customerPortal')"
          persistent-hint
          :disabled="!canEdit"
        />
      </v-card>

      <div
        v-if="canEdit"
        class="flex flex-col gap-3 sm:flex-row sm:justify-end"
      >
        <v-btn
          type="button"
          variant="text"
          size="large"
          :disabled="saving || !isDirty"
          @click="onDiscard"
        >
          {{ $t('settings.actions.reset') }}
        </v-btn>

        <v-btn
          type="submit"
          color="primary"
          size="large"
          :loading="saving"
          :disabled="!isDirty"
        >
          {{ $t('settings.actions.save') }}
        </v-btn>
      </div>
    </form>

    <v-snackbar
      v-model="savedVisible"
      color="success"
      :timeout="4000"
    >
      {{ $t('settings.saved') }}
    </v-snackbar>
  </section>
</template>
