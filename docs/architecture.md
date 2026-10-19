# Architecture and couplings

No build step. `index.html`, `styles.css`, `main.js`, plus `assets/vendor/lenis.min.js` and self-hosted fonts. A single fixed `<canvas id="gl">` draws every visual; HTML text sits above it.

## Couplings the code does not announce

- **Products pin height**: `.products { height: calc(var(--vh) * 3.35) }` in `styles.css` must equal the viewport-heights `main.js` needs: `STEP` (0.55) per row, with the last row holding. Change one, retune the other.
- **Pinned scenes**: Vision, Products and Studio are tall sections (`height` in `styles.css`) holding a `position: sticky` `.stage`. Each is listed in the pinned checks in `main.js` (`update()` depth math, `render()` background); add a new pinned scene there too.
- **Glass panes**: any element with class `glass` becomes a GL pane. Its look comes from the `look` table keyed by class (`pill`, `tagline`, `hl`, `chip`) near the end of the pane setup in `main.js`. New glass elements need a kind there.
- **Scenes**: every `[data-scene]` (hero, vision, products, studio, contact) has a `data-theme` (`dark` or `light`). The renderer paints scene backgrounds, rounded sheet corners and contour colour from it, and the nav and section indicator pick their colour from it.
- **Parallax**: `data-depth` on an element offsets it by scroll; the matching background layer uses a fixed depth in `render()`. Keep depths small so layers stay aligned.
- **Intro chain**: loader counter in `main.js` -> `startIntro()` adds `html.ready` -> CSS keyframes (`.motion.ready ...`) and the pane fade-in timings in `render()`. A 9-second watchdog in `index.html` drops to the static page if `ready` never arrives.
- **Fallbacks**: `html.motion` / `html.no-motion` (reduced motion), `html.gl` (WebGL2 running; CSS glass and plain scenes apply when absent), `prefers-reduced-transparency` (opaque panes).
- **Line-art budget**: `MAXSEG` in `main.js` caps line segments per frame.

## Commands

`npm run serve` (http://localhost:8080), `npm run shoot [mobile]` (contact sheet in `shots/`), `npm run check` (syntax, eslint, stylelint, smoke test). Add `?perf` to the URL for a frame-time overlay.
