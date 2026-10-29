/** Every gameplay tuning number. Distances in world units, times in seconds, angles in radians. */
export const CONFIG = {
  sim: {
    stepHz: 120,
    /** Frames that stall longer than this are dropped rather than simulated, to avoid a death spiral. */
    maxFrameTime: 0.25,
  },
  arena: {
    cells: 64,
    cellSize: 4,
    /** Open radius around the Ship's spawn at the Plaza centre, in cells. */
    spawnClearRadius: 4,
  },
  city: {
    /** Plaza side as a fraction of the Arena side. */
    plazaFraction: 0.35,
    /** Road widths in cells. The ring road runs inside the Arena wall. */
    ringRoad: 2,
    avenue: 3,
    street: 2,
    alley: 1,
    /** Plots are split until both sides are at most this many cells. */
    maxPlotCells: 7,
    minPlotCells: 3,
    /** Chance a plot is left as permanent open ground. */
    emptyPlotChance: 0.1,
    minBlockHeight: 4,
    maxBlockHeight: 12,
    plazaObstacleCandidates: 10,
    plazaObstacleHeight: [3, 5],
    /** Fraction of building plots standing in Wave 1, the growth per Wave, and the ceiling. */
    startDensity: 0.5,
    densityPerWave: 0.04,
    maxDensity: 0.9,
    /** Priority multiplier for Plots facing an Avenue, the ring road or the Plaza. */
    frontagePriority: 3,
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
    slideTurnRate: 4.2,
    /** Speed decay rate while Powersliding. The direction of travel is locked, so this is the only cost. */
    slideDrag: 0.4,
    hull: 3,
    hitInvulnerability: 1.2,
    burstCharges: 3,
    burstDuration: 0.45,
    burstSpeed: 85,
    fireInterval: 0.11,
  },
  bolt: {
    speed: 130,
    life: 0.9,
    radius: 0.35,
  },
  hunter: {
    radius: 1.7,
    baseSpeed: 15,
    speedPerWave: 0.6,
    maxSpeed: 24,
    accel: 30,
    turnRate: 3,
    /** Hunters closer than this push apart, which spreads them into a net. */
    separation: 6,
    fireRange: 70,
    fireInterval: 2.2,
    /** Seconds ahead of the Ship that Cutters aim to arrive. */
    cutterLead: 1.3,
    /** Within this distance a Cutter stops predicting and chases. */
    cutterCommitDistance: 14,
    cutterFraction: 0.4,
    flowFieldRefresh: 0.2,
  },
  shell: {
    speed: 32,
    life: 3,
    radius: 0.5,
  },
  waves: {
    firstCount: 3,
    countPerWave: 2,
    maxCount: 40,
    /** Long enough to read which Blocks are about to Rise or Sink. */
    lull: 3,
    minSpawnDistance: 70,
    killScore: 100,
  },
} as const;

/** Top speed the Ship reaches under full thrust without sliding. */
export const SHIP_TOP_SPEED = CONFIG.ship.thrust / CONFIG.ship.drag;
