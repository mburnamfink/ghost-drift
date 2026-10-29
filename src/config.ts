/** Every gameplay tuning number. Distances in world units, times in seconds, angles in radians. */
export const CONFIG = {
  sim: {
    stepHz: 120,
    /** Frames that stall longer than this are dropped rather than simulated, to avoid a death spiral. */
    maxFrameTime: 0.25,
  },
  arena: {
    cells: 96,
    cellSize: 4,
    /** Open radius around the Ship's spawn at the Plaza centre, in cells. */
    spawnClearRadius: 4,
  },
  city: {
    /** Road widths in cells. */
    avenue: 5,
    street: 2,
    alley: 1,
    /** Areas longer than this on a side are split by Streets, smaller ones by Alleys. */
    streetAbove: 28,
    /** Plots are split until both sides are at most this many cells. */
    maxPlotCells: 12,
    minPlotCells: 4,
    /** Plots trimmed by open ground or the Edge are dropped if either side ends up shorter. */
    minTrimmedPlot: 2,
    /** Chance a plot is left as permanent open ground. */
    emptyPlotChance: 0.1,
    minBlockHeight: 4,
    maxBlockHeight: 12,
    plazaObstacleCandidates: 10,
    plazaObstacleHeight: [3, 5],
    /** Fraction of building plots standing in Wave 1, the growth per Wave, and the ceiling. */
    startDensity: 0.6,
    densityPerWave: 0.04,
    maxDensity: 0.9,
    /** Priority multiplier for Plots facing an Avenue or a Plaza. */
    frontagePriority: 8,
    /**
     * Plots within this many cells of the Edge Rise up to `1 + edgePriority` times sooner and stand
     * up to `edgeExtraHeight` taller, so the city thickens toward it.
     */
    edgeBand: 10,
    edgePriority: 3,
    edgeExtraHeight: 5,
    /** Edge Block heights: nearest the city at the low end, taller further out. */
    edgeHeight: [16, 32],
    /** From this Wave on, this many standing Blocks Sink each Wave so routes keep changing. */
    churnFromWave: 3,
    churnPerWave: 3,
    plazaObstaclesAtStart: 3,
    /** One more Plaza obstacle every this many Waves. */
    plazaObstacleEvery: 3,
    maxPlazaObstacles: 7,
  },
  ship: {
    radius: 1.2,
    thrust: 54,
    /** Top speed is thrust / drag. */
    drag: 1.35,
    turnRate: 2.6,
    /** Rate at which sideways velocity is bled off; high values feel planted. */
    grip: 7,
    /** Fraction of the speed grip would scrub in a turn that is turned forward instead, 0 to 1. */
    carve: 0.8,
    slideTurnRate: 4.2,
    /** Speed decay rate while Powersliding. The direction of travel is locked, so this is the only cost. */
    slideDrag: 0.4,
    hull: 3,
    hitInvulnerability: 1.2,
    burstCharges: 3,
    burstDuration: 0.45,
    burstSpeed: 85,
  },
  /** Rapid Bolts that bend slightly toward a Hunter near their line of flight. */
  cannon: {
    interval: 0.11,
    speed: 130,
    life: 0.9,
    radius: 0.35,
    /** Half-angle either side of a Bolt's flight within which it notices a Hunter. */
    homingCone: (6 * Math.PI) / 180,
    /** Fastest a Bolt turns toward its Hunter, radians per second. */
    homingRate: 2.5,
  },
  /** Slow Pulses that sweep a short, wide arc and destroy every exposed Hunter in it. */
  shotgun: {
    interval: 0.5,
    range: 18,
    /** Seconds for a Pulse to reach full range. */
    duration: 0.22,
    halfAngle: 0.6,
  },
  /** Behaviour shared by every Hunter type. */
  hunters: {
    accel: 30,
    turnRate: 3,
    /** Hunters closer than this push apart, which spreads them into a net. */
    separation: 6,
    /** Hunters steer straight at a target they can see within this range, else follow a flow field. */
    directSteerRange: 40,
    flowFieldRefresh: 0.2,
  },
  tank: {
    radius: 1.7,
    baseSpeed: 15,
    speedPerWave: 0.6,
    maxSpeed: 24,
    fireRange: 70,
    fireInterval: 2.2,
    /** Seconds ahead of the Ship that Cutters aim to arrive. */
    cutterLead: 1.3,
    /** Within this distance a Cutter stops predicting and chases. */
    cutterCommitDistance: 14,
    cutterFraction: 0.4,
    /** With the Ship in sight and within `engageRange`, a Tank circles at about `standoff`. */
    engageRange: 50,
    standoff: 28,
    /** Distance from `standoff` at which a Tank steers fully inward or outward. */
    standoffBand: 8,
    scoreMultiplier: 1,
  },
  berserker: {
    radius: 1.5,
    /** Faster than any Tank, still slower than the Ship at speed. */
    speed: 27,
    /** Within this distance, with line of sight, it winds up a lunge. */
    lungeRange: 24,
    /** Seconds it stands still, glowing, before lunging; the Ship's chance to sidestep. */
    windup: 0.35,
    lungeSpeed: 58,
    lungeTime: 0.55,
    lungeCooldown: 1.8,
    scoreMultiplier: 1.5,
  },
  sniper: {
    radius: 1.4,
    speed: 12,
    /** Perches are chosen near this distance from the Ship. */
    idealRange: 85,
    /** A Ship closer than this sends the Sniper to a new Perch. */
    fleeDistance: 30,
    maxRange: 140,
    /** Seconds the laser tracks the Ship's projected path before locking. */
    chargeTime: 1.2,
    /** Seconds between the lock and the shot; the lead is exactly this far ahead of the Ship. Long
     * enough to see the lock, react (~0.25 s) and still turn clear. */
    lockTime: 0.6,
    cooldown: 3.5,
    /** Extra width beyond the Ship's radius that the shot still hits. */
    shotWidth: 0.4,
    perchCandidates: 40,
    repickInterval: 8,
    scoreMultiplier: 2.5,
  },
  artillery: {
    radius: 2,
    speed: 9,
    idealRange: 85,
    fleeDistance: 45,
    /** Never fires at a Ship farther away than this. */
    maxRange: 115,
    /** Seconds from launch to impact for the first shell of a Salvo. */
    flightTime: 1.8,
    /** Each shell lands where the Ship will be this many seconds after launch, if it holds course. */
    salvoLeads: [0, 0.7, 1.4],
    /** Extra flight time for each later shell, so impacts ripple along the predicted path. */
    salvoStagger: 0.15,
    blastRadius: 8,
    /** Fires only at a Ship with no Block within this many cells: tall Blocks block the arc. */
    openSkyCells: 2,
    cooldown: 5,
    perchCandidates: 40,
    repickInterval: 10,
    scoreMultiplier: 3,
  },
  shell: {
    speed: 32,
    life: 3,
    radius: 0.5,
  },
  slideCombo: {
    /** Each kill during one Powerslide scores this many times more than the last, up to the cap. */
    maxMultiplier: 8,
  },
  waves: {
    firstCount: 3,
    countPerWave: 2,
    maxCount: 40,
    /** Long enough to read which Blocks are about to Rise or Sink. */
    lull: 3,
    minSpawnDistance: 70,
    /** Score for a Tank; other types multiply it, and every kill is multiplied by the Wave number. */
    killScore: 100,
    /** From this Wave, Tank numbers are cut by `tankReduction` to make room for special Hunters. */
    tankReductionFromWave: 4,
    tankReduction: 0.25,
    berserkerFromWave: 2,
    maxBerserkers: 6,
    sniperFromWave: 3,
    maxSnipers: 5,
    artilleryFromWave: 5,
    maxArtillery: 4,
  },
} as const;

/** Top speed the Ship reaches under full thrust without sliding. */
export const SHIP_TOP_SPEED = CONFIG.ship.thrust / CONFIG.ship.drag;
