import { configure } from 'vee-validate'

/**
 * VeeValidate is installed by @vee-validate/nuxt; this only sets project-wide
 * behaviour.
 *
 * Note the accepted duplication called out in SCRUM-42: validation schemas are
 * written twice, in Yup here and in class-validator DTOs on the API. That is
 * deliberate. The frontend needs instant field-level feedback, the backend
 * cannot trust anything the frontend sends, and a shared schema package would
 * couple two release cycles for very little gain.
 */
export default defineNuxtPlugin(() => {
  configure({
    validateOnBlur: true,
    validateOnChange: false,
    validateOnInput: false,
    validateOnModelUpdate: true,
  })
})
