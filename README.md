# Ghost Drift

_They say one pilot is holding Arcadia alone._

An arcade shooter in the browser. You fly an experimental hovertank, the last defender of the city of Arcadia against an invading army. You're faster than anything they field, so speed is your armor: drift through the streets, powerslide past their guns, and fight as long as you can. Keep moving or get boxed in.

## Run it

```sh
npm install
npm run dev
```

Open the printed URL in Chrome or Firefox. Plug in an Xbox controller and press any button so the browser detects it, or use the keyboard. Controls are listed in [docs/design.md](docs/design.md#controls).

Add `?seed=1234` to the URL to replay the same Arena and Hunter behavior every Run. Add `?wave=5` to start a Run at a later Wave, with the city grown to match, to try later Hunter types quickly. Add `?map=grid` (or `circuit`, `districts`, `hub`) to force a city Layout instead of a random one. Add `?demo` to watch the game play itself: an autopilot flies real Runs and restarts after each death; Esc pauses. Add `?blocks=plain` to draw every building as a plain box. Add `?debug=overhead` for a top-down view of the whole city, useful when tuning layouts. If the controller does nothing, add `?debug=pad` to see every device the browser reports, which one the game picked, and its live buttons and axes.

## Scripts

| Script           | Does                                             |
| ---------------- | ------------------------------------------------ |
| `npm run dev`    | Dev server with hot reload                       |
| `npm run build`  | Typecheck and build to `dist/`                   |
| `npm run check`  | Typecheck, lint, formatting check and unit tests |
| `npm run format` | Format with Prettier                             |

Formatting is Prettier's job, never by hand. A pre-commit hook formats and lints staged files (installed by `npm install`), CI fails on unformatted code, and `.vscode/` turns on format-on-save. Wrap hand-aligned data, such as a lookup table, in `// prettier-ignore`.

## Layout

```
src/
  config.ts   all tuning numbers
  core/       math, RNG, fixed-step loop; no game rules
  input/      keyboard + gamepad → Controls
  sim/        game rules: pure 2D, no Three.js or DOM (ADR-0002)
  render/     Three.js scene that mirrors sim state
  ui/         DOM HUD and screens
  main.ts     wiring
```

## Docs

- [docs/design.md](docs/design.md): rules, controls, scope, roadmap
- [CONTEXT.md](CONTEXT.md): glossary; code uses these names
- [docs/adr/](docs/adr/): architecture decisions
