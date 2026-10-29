# Browser-first with Three.js, Vite and TypeScript

The priority is a playable build as fast as possible, with an Xbox controller, on a desktop browser. We use Three.js as a renderer (not an engine), Vite for dev server and bundling, and strict TypeScript. The browser Gamepad API maps Xbox controllers to the "standard" layout in Chrome and Firefox, so no input library is needed.

## Considered Options

- **Babylon.js**: a fuller engine (physics, input manager, inspector). Rejected because the game needs almost none of it, and its conventions would shape our code.
- **Godot 4 with web export**: real editor and a native-build path, but slower edit-to-play loop in the browser. Remains the fallback if the game outgrows a hand-rolled loop; the simulation/render split (ADR-0002) keeps game rules portable.
- **PlayCanvas**: editor is cloud-hosted; poor fit for code-first work.

## Consequences

We own the game loop, collision and AI. That is deliberate: the game's feel lives in those systems.
