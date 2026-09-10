# Project instructions

These rules apply to all work in this repo. They are defaults, not reminders to
ask for: assume every task inherits them.

## Every page and component must be multilingual

- No user-visible string is ever hardcoded. Use `$t('...')` / `useI18n()` in
  Vue templates and composables, `useI18n()` for programmatic strings.
- Add every new key to **both** `frontend/i18n/locales/en.json` and
  `frontend/i18n/locales/ar.json` in the same change. A key present in one file
  and missing in the other is a bug, not a follow-up.
- Locales and their text direction come from `frontend/i18n/locale-config.ts`.
  Read direction from there, never hardcode `ltr`/`rtl`.
- Arabic is RTL, so layouts must be direction-agnostic: use logical Tailwind
  utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`) instead of
  `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`. Mirror icons and
  chevrons that imply direction.
- Dates, numbers and currency go through the shared formatting helpers so they
  follow the active locale. Never build a date string by hand.

## Every page and component must be responsive

- Mobile-first: write the small-screen layout first, then widen with Tailwind
  breakpoints (`sm:`, `md:`, `lg:`, `xl:`).
- Target 320px width as the floor. Nothing may cause horizontal page scroll.
  Wide content (tables, code, charts) scrolls inside its own
  `overflow-x-auto` container.
- Tables need a usable narrow-screen form: horizontal scroll or a stacked
  card layout, not a squeezed grid.
- Touch targets stay at least 44px. Navigation, dialogs and side panels must
  collapse or become full-screen on small viewports.
- Use relative units and fluid containers; avoid fixed pixel widths on
  anything that holds text.

## Definition of done for any UI change

A change is not finished until it has been considered in all four states:
English, Arabic, narrow viewport, wide viewport.
