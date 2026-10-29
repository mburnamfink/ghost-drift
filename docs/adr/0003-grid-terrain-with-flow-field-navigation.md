# Grid terrain with flow-field navigation

The Arena is a uniform square grid; each cell is open or covered by a Block, a rectangle of whole cells. Blocks are always separated by at least one open cell, so open ground stays connected. Collision against terrain is circle-vs-grid, and Hunters navigate by following flow fields (breadth-first distance maps over the grid) rather than per-unit pathfinding.

One flow field toward the Ship and one toward its predicted position are rebuilt a few times per second and shared by every Hunter, so cost does not grow with Hunter count. That matters because the design is many slow units converging on one fast target; the two fields give Chasers and Cutters, which together produce being Boxed in.

## Considered Options

- **Free-form polygon terrain with A\* or navmesh**: more varied shapes, but per-unit path queries scale badly with swarm size and the blocky look is the intended style anyway.

## Consequences

Terrain shapes are axis-aligned rectangles snapped to cells. Burst passes through Blocks, so a Ship that ends a Burst inside a Block is moved to the nearest open cell.
