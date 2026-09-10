<script setup lang="ts">
/**
 * Shared login for both audiences (SCRUM-43). The API decides staff vs customer
 * from the credentials and puts `userType` in the token; this page only redirects.
 *
 * The 401 copy is deliberately singular — `auth.errors.invalidCredentials` —
 * and never distinguishes "no such email" from "wrong password" from "wrong
 * table". The API returns one generic 401 for all three; the UI must not undo
 * that. Everything else (unreachable API, 429, 5xx) gets its own line via
 * `authErrorKey`, so a dead backend never reads as a wrong password.
 */
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/yup'
import { authErrorKey, buildLoginSchema, resolvePostLoginTarget } from '~/utils/auth-schemas'

definePageMeta({ layout: 'auth', middleware: ['guest'] })

const { t } = useI18n()
const auth = useAuth()
const route = useRoute()
const router = useRouter()

const submitError = ref('')
const loading = ref(false)
const resetDone = computed(() => route.query.reset === '1')

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(buildLoginSchema(t)),
})
const [email, emailAttrs] = defineField('email')
const [password, passwordAttrs] = defineField('password')

const onSubmit = handleSubmit(async (values) => {
  submitError.value = ''
  loading.value = true
  try {
    const session = await auth.login(values.email, values.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
    const target = resolvePostLoginTarget(redirect, session.userType, (path) => {
      return router.resolve(path).meta.userTypes
    })
    await navigateTo(target)
  } catch (err) {
    submitError.value = t(authErrorKey(err))
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <v-card class="p-6">
    <h1 class="mb-6 text-2xl font-semibold text-secondary">
      {{ $t('auth.login.title') }}
    </h1>

    <v-alert
      v-if="resetDone"
      type="success"
      variant="tonal"
      class="mb-4"
    >
      {{ $t('auth.reset.success') }}
    </v-alert>

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
        v-model="email"
        v-bind="emailAttrs"
        type="email"
        autocomplete="username"
        :label="$t('auth.login.email')"
        :error-messages="errors.email ? [errors.email] : []"
        class="mb-2"
      />

      <v-text-field
        v-model="password"
        v-bind="passwordAttrs"
        type="password"
        autocomplete="current-password"
        :label="$t('auth.login.password')"
        :error-messages="errors.password ? [errors.password] : []"
        class="mb-4"
      />

      <v-btn
        type="submit"
        color="primary"
        block
        :loading="loading"
      >
        {{ $t('auth.login.submit') }}
      </v-btn>
    </form>

    <div class="mt-4 text-center">
      <NuxtLink
        to="/forgot-password"
        class="text-sm font-medium text-primary hover:underline"
      >
        {{ $t('auth.login.forgot') }}
      </NuxtLink>
    </div>
  </v-card>
</template>
