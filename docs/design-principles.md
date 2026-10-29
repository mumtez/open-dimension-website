# Design principles

The owner wants Open Dimension calm, minimal and very smooth. Read this before adding any decorative or interactive effect.

## Keep

- **Visual language**: Instrument Serif headlines, Inter body, mono labels, one blue accent, dark and light sheets that slide over each other with rounded top corners.
- **Background**: drifting contour lines and liquid glass panes, drawn by the WebGL2 renderer.
- **Line-art**: the hero tesseract, the Vision schematic (draws on with scroll), the Studio rings. Add no more.
- **Motion**: driven by scroll, intro and hover over rows or buttons. One motion scale (`--t-*` tokens, `RATE_*` constants).
- **Pinned scenes**: hold for about 2.4 viewports and let scroll step content in (Products' rows, Studio's chips, Vision's words). A pinned scene with nothing happening feels dead.
- **Loved sections**: Vision and Studio. Change them only with the owner's say-so.
- **Copy**: deliberately vague until the owner fills it in. Contact stays a placeholder until they give a real address.

## Retired (the owner removed each of these once)

Blueprint or graph-paper grids and other "engineering cosplay" (HUD readouts, fake telemetry, schematic labels); cursor-reactive particles, ripples, lensing and reticles; wireframe product shapes and the sideways card track; the footer wave mesh; the glass lens over the Vision graph.

## Before shipping a visual change

Run `npm run shoot` and `npm run shoot -- mobile`, and look at the contact sheets in `shots/`. Run `npm run check`.
