# Coding standards (judgement calls)

Mechanical rules live in tooling, not here: `npm run check` runs eslint, stylelint (durations must use the `--t-*` tokens) and the smoke test.

- **Frame loop**: `tick()` -> `update()` -> `render()` reads layout only through cached metrics (`measure()`), except the glass pane and line-art rects. Write DOM through the cached `sty()` / `txt()` helpers. Allocate nothing per frame.
- **One motion scale**: new durations and rates come from the `--t-*` tokens and `RATE_*` constants. Choose among them; add a new value only with a reason.
- **Design constraints**: a new decorative or interactive effect is checked against `docs/design-principles.md`.
- **Fallbacks stay whole**: a visual added to the GL renderer has a sensible state under `html:not(.gl)` and `.no-motion`.
- **Coupled constants**: changing the Products pin height or `STEP` updates both (see `docs/architecture.md`).
