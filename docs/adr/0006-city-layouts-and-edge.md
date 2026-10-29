# City Layouts carved from one subdivision, bounded by an Edge

Supersedes the fixed layout in ADR-0005; its Rise/Sink schedule still applies.

A single fixed layout (Plaza, ring road, eight districts) inside a square wall played the same every Run, and the wall read as an arbitrary barrier. Each Run now picks one of four Layouts at random from the seed (`src/sim/city/`):

- **Grid**: straight Avenues edge to edge around a square central Plaza.
- **Circuit**: a wide loop around a dense core, with spurs to side Plazas.
- **Districts**: several Plazas of different sizes joined by Avenues.
- **Hub**: a central Plaza with radiating Avenues crossed by ring roads.

A Layout is only a recipe (`LayoutSpec`): open shapes (rectangles, discs, elliptical rings, thick lines), the Plazas, a boundary made of a union of circles, and a spawn point. One generator turns any recipe into Plots:

1. Cut the whole Arena into Plots with Streets and Alleys, as before.
2. Trim each Plot to the largest rectangle clear of open shapes and inside the boundary.
3. Turn everything outside the boundary, plus any pocket unreachable from the spawn, into the **Edge**: tall Blocks that stand all Run.
4. Plots near the Edge Rise sooner and stand taller, so the city visibly thickens into it.
5. Give some buildings a compound footprint (L, T, U, cross, Z or stepped) by cutting rectangles from the lot's edges. Each Layout weights the shapes differently. Any cut that would seal a pocket reverts to a rectangle.
6. Wall a Layout's lined roads (Circuit's loop, Hub's spokes) on both sides with permanent buildings, gated at intervals, so the shape reads from the first Wave.
7. Join one pair of towers facing each other across a road with an Arch. The Arch is scenery the Ship flies under, and its towers stand all Run.

The Arena is 96 cells (384 units) across.

## Considered Options

- **A separate generator per Layout**: every Layout would need its own connectivity guarantees and Rise/Sink handling. The shared pipeline gives all of them the same invariants for free.
- **Non-axis-aligned or curved Blocks**: these would need polygon collision, line of sight and flow fields, against ADR-0003. Curves are instead approximated by trimming Plots cell by cell, which reads as curved at speed.
- **A visible wall at the boundary**: rejected for the same reason the square wall was. The Edge should feel like the city, not a fence.

## Consequences

- Open ground stays connected with every Plot standing; tests check this for every Layout across several seeds.
- `?map=grid|circuit|districts|hub` forces a Layout. The HUD names the current one.
- The Edge adds a few hundred static Blocks. Each is a separate mesh so occlusion ghosting works on it; merge them if draw calls become a problem.
- The border does not move during a Run.
- Edge Blocks are walls (`Block.wall`): a Burst passes through buildings but bounces off the Edge and the Arena bounds, keeping its speed.
- A Block may be a list of rectangles (`Block.parts`). Collision, line of sight and flow fields still read only the cell grid, so compound shapes cost nothing in the simulation.
