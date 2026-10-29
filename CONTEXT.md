# Quantum Breach

A fast hover vehicle survives endless waves of slower enemies in a blocky simulated arena. Speed is the player's defense: hunters can only kill a ship that stops moving.

## Language

### The player

**Ship**:
The player's hover vehicle. Fast, agile, fragile.
_Avoid_: Player (when meaning the vehicle), craft, tank

**Heading**:
The direction the Ship's nose points. Guns fire along the Heading. Can differ from the direction of travel.
_Avoid_: Facing, rotation

**Hull**:
The Ship's remaining hit points. At zero the run ends.
_Avoid_: Health, HP, shields

**Powerslide**:
A held maneuver in which the Ship keeps travelling in a straight line, slowly losing speed, while its Heading turns freely. Thrust does nothing until it ends.
_Avoid_: Drift, strafe mode

**Burst**:
A short forward surge during which the Ship cannot be hurt and passes through Blocks. Limited Charges.
_Avoid_: Dash, boost, phase

**Charge**:
One use of Burst. The Ship holds at most three; all are restored when a Wave is cleared.

### The opposition

**Hunter**:
Any enemy unit. Slower than the Ship at speed; deadly to a slow one.
_Avoid_: Enemy (in code), mob, tank

**Chaser**:
A Hunter role that steers toward where the Ship is now.

**Cutter**:
A Hunter role that steers toward where the Ship is about to be, to close its escape routes.
_Avoid_: Interceptor, flanker

**Boxed in**:
The failure state the game is built around: Hunters have closed every exit around a slowed Ship.

### The world

**Arena**:
The bounded square play space. Its outer wall cannot be passed, even during Burst.
_Avoid_: Map, level

**Block**:
One solid cell of Arena terrain. Stops Ships, Hunters and shots.
_Avoid_: Wall (reserved for the Arena edge), obstacle, tile

**Density**:
How tightly Blocks are packed in a region. Open ground is fast and safe; dense ground is a maze of chokepoints.

### A run

**Wave**:
A group of Hunters released together. Destroying all of them clears the Wave and starts a short lull before the next.
_Avoid_: Level, round

**Run**:
One play-through from the first Wave to the Ship's destruction. Endless; ends only in defeat.
_Avoid_: Game, session

**Bolt**:
A shot fired by the Ship.

**Shell**:
A shot fired by a Hunter.
_Avoid_: Bullet, projectile (for either, when the owner matters)
