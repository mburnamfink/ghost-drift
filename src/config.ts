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
    /** Open radius around the Ship's spawn, in cells. */
    spawnClearRadius: 4,
    /** Noise period, in cells, of the large-scale Density field. */
    densityPeriod: 16,
    placementAttempts: 900,
    /** Chance a candidate Block is kept at maximum Density. */
    placementChance: 0.9,
    /** Block footprint range, in cells per side. */
    minBlockCells: 2,
    maxBlockCells: 6,
    /** Open cells always left between Blocks, so corridors never close. */
    blockGap: 1,
    minBlockHeight: 3,
    maxBlockHeight: 12,
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
    lull: 2.5,
    minSpawnDistance: 70,
    killScore: 100,
  },
} as const;

/** Top speed the Ship reaches under full thrust without sliding. */
export const SHIP_TOP_SPEED = CONFIG.ship.thrust / CONFIG.ship.drag;
