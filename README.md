# Quantum Breach

A browser arena shooter: a fast hover Ship survives endless Waves of slower Hunters in blocky terrain. Keep moving or get Boxed in.

## Run it

```sh
npm install
npm run dev
```

Open the printed URL in Chrome or Firefox. Plug in an Xbox controller and press any button so the browser detects it, or use the keyboard. Controls are listed in [docs/design.md](docs/design.md#controls).

## Scripts

| Script           | Does                           |
| ---------------- | ------------------------------ |
| `npm run dev`    | Dev server with hot reload     |
| `npm run build`  | Typecheck and build to `dist/` |
| `npm run check`  | Typecheck, lint and unit tests |
| `npm run format` | Format with Prettier           |

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
