<script setup lang="ts">
/**
 * Forgot-password request (SCRUM-43). The API always answers 202 with an empty
 * body whether or not the email exists, and this page mirrors that: on submit it
 * always shows the same "if the email exists, a link is on its way" message. It
 * must never reveal whether the address is registered.
 */
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/yup'
import { buildForgotSchema } from '~/utils/auth-schemas'

definePageMeta({ layout: 'auth', middleware: ['guest'] })

const { t } = useI18n()
const auth = useAuth()

const submitted = ref(false)
const loading = ref(false)

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(buildForgotSchema(t)),
})
const [email, emailAttrs] = defineField('email')

const onSubmit = handleSubmit(async (values) => {
  loading.value = true
  try {
    await auth.forgot(values.email)
  } catch {
    // Swallow: a failure here must not tell the user anything either.
  } finally {
    loading.value = false
    submitted.value = true
  }
})
</script>

<template>
  <v-card class="p-6">
    <h1 class="mb-6 text-2xl font-semibold text-secondary">
      {{ $t('auth.forgot.title') }}
    </h1>

    <v-alert
      v-if="submitted"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      {{ $t('auth.forgot.confirmation') }}
    </v-alert>

    <form
      v-if="!submitted"
      novalidate
      @submit.prevent="onSubmit"
    >
      <v-text-field
        v-model="email"
        v-bind="emailAttrs"
        type="email"
        autocomplete="username"
        :label="$t('auth.login.email')"
        :error-messages="errors.email ? [errors.email] : []"
        class="mb-4"
      />

      <v-btn
        type="submit"
        color="primary"
        block
        :loading="loading"
      >
        {{ $t('auth.forgot.submit') }}
      </v-btn>
    </form>

    <div class="mt-4 text-center">
      <NuxtLink
        to="/login"
        class="text-sm font-medium text-primary hover:underline"
      >
        {{ $t('auth.login.title') }}
      </NuxtLink>
    </div>
  </v-card>
</template>
