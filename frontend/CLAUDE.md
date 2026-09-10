# Frontend instructions

These apply to everything under `frontend/`, in addition to the rules in the
root `CLAUDE.md` (multilingual, responsive — those are not repeated here).
See the root `README.md` for the full styling-boundaries and RTL writeup;
this file is the day-to-day checklist for Vuetify specifically.

## Use Vuetify's own component for the job, not custom markup

Before hand-rolling a table, dialog, pagination control, menu, chip, or form
field with `<div>`/Tailwind, check whether a Vuetify component already does
it. This codebase has both a Vuetify layer and Tailwind, and the rule from
the root README stands: **Vuetify owns component internals, Tailwind owns
the space between components.** Reaching for a custom Tailwind construction
where Vuetify has a ready component means:

- reimplementing keyboard nav, ARIA, and mobile behaviour Vuetify already
  ships;
- fighting the RTL mirroring, which Vuetify components get for free from
  `vuetify.locale.isRtl` and hand-built markup does not;
- a second place a visual bug can live.

Concretely:

- A list of records → `v-data-table` / `v-data-table-server`, not a `<table>`
  built by hand or a `v-for` of `<v-card>`s. Vuetify's data table already
  handles empty states, loading state, and — via `mobile-breakpoint` — a
  stacked layout on narrow screens, which is what the "responsive tables"
  rule in the root `CLAUDE.md` asks for. See
  `frontend/pages/staff/users/index.vue` for the current reference usage.
- Paging → the data table's built-in footer, not a standalone `v-pagination`
  wired up next to a manually sliced array.
- A modal form → `v-dialog` + `v-card`, with `fullscreen="$vuetify.display.smAndDown"`
  so it goes full-screen on a phone instead of rendering a cramped centered
  box.
- A status/role badge → `v-chip`, not a styled `<span>`.
- A menu of actions → `v-menu` + `v-list`, not a manually positioned
  dropdown.

If a genuine gap exists, say so and build the smallest custom piece needed —
don't rebuild something Vuetify already ships as-is.

## Button color and variant convention

Every `v-btn` on a page communicates its weight through `color` and
`variant`. Pick from this table; don't invent a new combination without a
reason tied to the action's actual weight.

| Role | `color` | `variant` | Example |
| --- | --- | --- | --- |
| Primary action (submit, save, create) | `primary` | *(default — omit)* | "Save changes", "New user" |
| Secondary action (reset, clear filters, alternate path) | `primary` | `outlined` | "Discard", "Clear filters" |
| Low-emphasis action inside a dialog/toolbar (cancel, row-level edit) | *(omit — default)* | `text` | "Cancel", "Edit" row action |
| Destructive action | `error` | matches the button's weight (`text` for a row action, default/no variant for a confirm-dialog's primary button) | "Deactivate", dialog's confirm button |
| Confirming/positive state change | `success` | matches weight, as above | "Reactivate" |

Primary buttons:

```html
<v-btn
  color="primary"
  class="w-full sm:w-auto"
>
  {{ $t('...') }}
</v-btn>
```

Secondary buttons:

```html
<v-btn
  color="primary"
  variant="outlined"
  @click="..."
>
  {{ $t('...') }}
</v-btn>
```

Notes:

- `class="w-full sm:w-auto"` on stacked dialog/form action buttons is the
  established pattern for full-width on a narrow viewport, auto-width from
  `sm` up — keep it on any button that sits in a stacked action row (see
  `frontend/pages/staff/users/index.vue`, `frontend/pages/staff/settings/index.vue`).
- Never pick a `color` by eyeballing a hex. Colors come from
  `frontend/design-tokens/index.ts` via the theme names (`primary`,
  `secondary`, `success`, `warning`, `error`) — see "Design tokens" in the
  root README.
- Icon-only or low-priority row actions inside a table/toolbar follow the
  icon-action pattern below, not a bare `v-btn`.
- Never style a `v-btn` by overriding its internals with Tailwind classes
  (padding, border, background). Layout classes (`w-full`, `sm:w-auto`,
  `min-h-11` for the 44px touch-target floor) are fine; anything that reaches
  into how the button itself looks is not — use `color`/`variant`/`size`.

## Icon actions (table rows, toolbars)

Row-level and toolbar actions are **icon buttons**, not text buttons — a
table row shows an edit/delete/assign icon, never a `<v-btn>` with a word in
it. Every icon action uses this exact pattern:

```html
<v-tooltip :text="$t('users.actions.assignRole')">
  <template #activator="{ props: tooltipProps }">
    <v-btn
      v-bind="tooltipProps"
      color="grey-darken-2"
      :icon="mdiAccountKey"
      variant="text"
      size="small"
      class="min-h-11 min-w-11"
      :aria-label="$t('users.actions.assignRole')"
      @click="assignRole(item)"
    />
  </template>
</v-tooltip>
```

Non-negotiable parts:

- `color="grey-darken-2"`, `variant="text"`, `size="small"` — the same on
  every icon action so a row of them reads as one control set. Only a
  destructive icon changes `color` (to `error`), nothing else.
- `class="min-h-11 min-w-11"` — the 44px touch-target floor from the root
  responsive rule. Layout-only classes; never add padding/border/background.
- Always wrapped in `<v-tooltip :text="...">` **and** given an
  `:aria-label` — both strings through `$t()`, and they say the same thing.
  The tooltip is the sighted label, the `aria-label` is the accessible name;
  an icon button without both is unlabelled.
- `:icon` takes an imported `@mdi/js` path constant (`:icon="mdiPencil"`),
  never an `"mdi-…"` string — see the icon note in `plugins/vuetify.ts`.
- Mirror direction-implying icons (arrows, chevrons) for RTL; a plain
  pencil/trash/key does not need mirroring.

## Border radius

Every surface with an edge carries the same rounded corner — `v-card`,
`v-dialog`, `v-data-table`, `v-btn`, `v-text-field` / `v-select` and other
inputs, `v-chip`, `v-menu`, `v-list`, `v-alert`, `v-sheet`. A square corner
anywhere reads as unfinished.

- The standard is `rounded="lg"`. Set it once in Vuetify's `defaults` in
  `plugins/vuetify.ts` (`defaults: { VCard: { rounded: 'lg' }, VBtn: { rounded: 'lg' }, … }`)
  so components inherit it; only pass `rounded` on an instance that
  genuinely differs (a pill `v-chip` → `rounded="pill"`, a circular icon
  avatar → `rounded="circle"`).
- Use the `rounded` prop / Vuetify `rounded-*` scale. Never set
  `border-radius` with a Tailwind `rounded-*` class or inline style on a
  Vuetify component — that is reaching into component internals, which the
  styling-boundaries rule forbids.
- For the rare non-Vuetify element that needs a matching corner, use
  Tailwind `rounded-lg` so it lines up with the Vuetify `lg`.

## Checklist before opening a PR touching Vuetify UI

1. Is there a Vuetify component for this, and am I using it instead of
   custom markup?
2. Does every `v-btn` match the color/variant table above for its role, and
   is every row/toolbar action an icon button in the pattern above (tooltip
   + `aria-label`, `grey-darken-2` / `text` / `small`, `min-h-11 min-w-11`)?
3. Do all edged surfaces (cards, dialogs, tables, buttons, inputs, chips,
   menus) carry the standard `rounded="lg"` — no square corners, no Tailwind
   `rounded-*` on a Vuetify component?
4. Every user-visible string routed through `$t()`? (root rule, restated
   because it's the one most likely to slip in a new dialog)
5. Checked in English, Arabic, narrow (320px), and wide viewport — the same
   four-state check the root `CLAUDE.md` requires for any UI change.
