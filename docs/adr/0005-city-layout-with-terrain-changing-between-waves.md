# City layout by subdivision, with Blocks Rising and Sinking between Waves

Random scattered terrain left large accidental clearings that were the safest place to sit. Each Run now lays out a seeded city instead: a central Plaza (35% of the Arena side) with a few obstacles, framed by Avenues that cut the rest into eight districts, each recursively split by Streets and then Alleys into Plots (`src/sim/city.ts`). The plan is fixed for the Run; which Plots have a standing Block changes only between Waves. Density climbs Wave by Wave to a ceiling, and from Wave 3 a few standing Blocks Sink and others Rise each Wave so routes keep changing.

Changes happen only at the end of the lull, after being shown on the floor for its whole length, because terrain moving under a fast Ship mid-fight would kill players without warning.

## Considered Options

- **Noise-driven scatter** (the previous approach): no hierarchy, so no avenues or streets, and open areas were leftovers rather than designed spaces.
- **Organic road growth, wave function collapse, Voronoi districts**: harder to control Plaza size and road widths, and the latter two do not stay axis-aligned (ADR-0003).
- **Terrain changing mid-Wave**: more dramatic, but needs in-combat telegraphing and makes deaths feel arbitrary.

## Consequences

- Terrain is mutable (`Terrain.raise` / `lower`), but only `World` changes it, and only when a Wave starts. Flow fields are rebuilt then.
- Roads separate every Plot, so open ground stays connected with any combination of Blocks standing; tests check this with every Plot raised.
- A Block never Rises onto the Ship; it stays down for that Wave.
- Hunters never exist during a change, because changes happen only after a Wave is cleared.
