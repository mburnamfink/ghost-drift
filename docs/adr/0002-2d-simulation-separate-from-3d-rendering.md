# 2D simulation, decoupled from 3D rendering

The game is drawn in 3D but all gameplay happens on a flat plane: nothing jumps, falls or flies over Blocks. The simulation (`src/sim/`) is therefore pure 2D TypeScript with no Three.js or DOM imports, stepped at a fixed rate with a seeded RNG. The renderer (`src/render/`) reads simulation state each frame and never writes to it; input (`src/input/`) is reduced to a plain `Controls` value before the simulation sees it.

This keeps game rules unit-testable without a browser, makes a Run reproducible from its seed and recorded inputs, and keeps rules portable if the renderer changes (ADR-0001).

## Consequences

- Simulation `(x, y)` maps to Three.js `(x, 0, y)`; Heading angle `θ` maps to `rotation.y = -θ`. Models are authored facing local +X.
- The simulation steps at 120 Hz with no render interpolation. At this rate stepping jitter is not visible on 60–144 Hz displays; add interpolation only if that changes.
- Anything that needs real height (jumps, overpasses, artillery arcs that matter) would break this ADR and needs a new one.
