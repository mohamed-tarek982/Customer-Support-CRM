<script setup lang="ts">
/**
 * Set a new password from an emailed token (SCRUM-43).
 *
 * The token comes from `?token=` only — there is no locale binding on the link,
 * so the page renders in whatever language the browser has persisted. A missing
 * or rejected token shows one generic error; the API returns the same message
 * for missing / used / expired so the endpoint cannot be probed.
 */
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/yup'
import { buildResetSchema } from '~/utils/auth-schemas'

definePageMeta({ layout: 'auth', middleware: ['guest'] })

const { t } = useI18n()
const auth = useAuth()
const route = useRoute()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const submitError = ref('')
const loading = ref(false)

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(buildResetSchema(t)),
})
const [newPassword, newPasswordAttrs] = defineField('newPassword')
const [confirmPassword, confirmPasswordAttrs] = defineField('confirmPassword')

const onSubmit = handleSubmit(async (values) => {
  submitError.value = ''
  if (!token.value) {
    submitError.value = t('auth.errors.generic')
    return
  }
  loading.value = true
  try {
    await auth.reset(token.value, values.newPassword)
    await navigateTo({ path: '/login', query: { reset: '1' } })
  } catch {
    submitError.value = t('auth.errors.generic')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <v-card class="p-6">
    <h1 class="mb-6 text-2xl font-semibold text-secondary">
      {{ $t('auth.reset.title') }}
    </h1>

    <v-alert
      v-if="submitError"
      type="error"
      variant="tonal"
      class="mb-4"
    >
      {{ submitError }}
    </v-alert>

    <form
      novalidate
      @submit.prevent="onSubmit"
    >
      <v-text-field
        v-model="newPassword"
        v-bind="newPasswordAttrs"
        type="password"
        autocomplete="new-password"
        :label="$t('auth.reset.newPassword')"
        :error-messages="errors.newPassword ? [errors.newPassword] : []"
        class="mb-2"
      />

      <v-text-field
        v-model="confirmPassword"
        v-bind="confirmPasswordAttrs"
        type="password"
        autocomplete="new-password"
        :label="$t('auth.reset.confirmPassword')"
        :error-messages="errors.confirmPassword ? [errors.confirmPassword] : []"
        class="mb-4"
      />

      <v-btn
        type="submit"
        color="primary"
        block
        :loading="loading"
      >
        {{ $t('auth.reset.submit') }}
      </v-btn>
    </form>
  </v-card>
</template>
