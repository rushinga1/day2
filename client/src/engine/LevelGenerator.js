/**
 * Mrdevgame – Procedural Level Generator
 * 
 * Structure:
 *   10 Worlds  × 10 Levels  × 10 Stages  =  1,000 unique stages
 *   10 Worlds  × 10 Levels              =    100 named levels
 *
 * Each stage is deterministically generated from its (world, level, stage) seed.
 */

// ── Seeded PRNG (Mulberry32) ──────────────────────────────────────────────────
function createRNG(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngSeed(world, level, stage) {
  // Mix the three numbers into a unique seed
  return ((world * 397) ^ (level * 1597) ^ (stage * 6571)) + world * 100000 + level * 1000 + stage;
}

// ── World themes ──────────────────────────────────────────────────────────────
export const WORLDS = [
  { id: 1,  name: 'Grasslands',   emoji: '🌿', bgColor: '#0a1f0a', platformColor: '#2d6a2d', accentColor: '#4ade80' },
  { id: 2,  name: 'Sky Islands',  emoji: '☁️', bgColor: '#0c1a2e', platformColor: '#1e40af', accentColor: '#60a5fa' },
  { id: 3,  name: 'Lava Caves',   emoji: '🌋', bgColor: '#1a0a0a', platformColor: '#7f1d1d', accentColor: '#f97316' },
  { id: 4,  name: 'Ice Tundra',   emoji: '❄️', bgColor: '#0c1a2e', platformColor: '#1e3a5f', accentColor: '#67e8f9' },
  { id: 5,  name: 'Dark Void',    emoji: '🌑', bgColor: '#09050f', platformColor: '#3b0764', accentColor: '#a78bfa' },
  { id: 6,  name: 'Speed Zone',   emoji: '⚡', bgColor: '#1a1200', platformColor: '#78350f', accentColor: '#fbbf24' },
  { id: 7,  name: 'Ghost Town',   emoji: '👻', bgColor: '#0f0f0f', platformColor: '#374151', accentColor: '#d1d5db' },
  { id: 8,  name: 'The Jungle',   emoji: '🌴', bgColor: '#071a07', platformColor: '#14532d', accentColor: '#86efac' },
  { id: 9,  name: 'Troll Zone',   emoji: '😈', bgColor: '#1a0a1a', platformColor: '#6b21a8', accentColor: '#d946ef' },
  { id: 10, name: 'Hell',         emoji: '🔥', bgColor: '#1c0000', platformColor: '#991b1b', accentColor: '#ef4444' },
];

// ── Physics presets per world ─────────────────────────────────────────────────
function worldPhysics(worldId) {
  const presets = {
    1:  { gravity: 0.45, speed: 4.5, jump: -10 },   // Grasslands – gentle
    2:  { gravity: 0.28, speed: 4.5, jump: -9  },   // Sky Islands – floaty
    3:  { gravity: 0.60, speed: 5.0, jump: -11 },   // Lava – heavy
    4:  { gravity: 0.50, speed: 6.5, jump: -10 },   // Ice – slippery fast
    5:  { gravity: 0.50, speed: 5.0, jump: -10 },   // Void – normal
    6:  { gravity: 0.50, speed: 8.0, jump: -11 },   // Speed – fast
    7:  { gravity: 0.40, speed: 4.0, jump: -10 },   // Ghost – slow
    8:  { gravity: 0.55, speed: 5.0, jump: -10 },   // Jungle – normal
    9:  { gravity: 0.50, speed: 5.0, jump: -10 },   // Troll – normal (traps do the work)
    10: { gravity: 0.70, speed: 6.0, jump: -12 },   // Hell – hardest physics
  };
  return presets[worldId] || presets[1];
}

// ── Platform generator (VERTICAL – climb upward) ──────────────────────────
function generatePlatforms(rng, world, level, stage) {
  const difficulty = (world - 1) * 10 + (level - 1); // 0–99
  const platforms  = [];
  const W = 800, H = 450;

  // Starting ground at the bottom
  platforms.push({ x: 0, y: H - 50, width: W, height: 50 }); // Full width ground to prevent immediate deaths

  // Climb upward: each platform is higher than the last
  const count   = Math.floor(5 + difficulty * 0.12 + rng() * 4);
  let   currentY = H - 50;  // start at ground level

  for (let i = 0; i < count; i++) {
    // Engine limits: speed=5, jumpForce=-10, gravity=0.5.
    // Max vertical jump height is ~100px.
    // Max horizontal distance during a jump is ~200px (but much less if jumping high).
    
    // Step UP (climb direction) - safely bounded to max 85px
    const stepUp  = 55 + rng() * (15 + difficulty * 0.15);
    currentY -= stepUp;
    if (currentY < 60) break; // stop near top

    const prevPlat = platforms[platforms.length - 1];
    const width    = 100 - difficulty * 0.3 + rng() * 60;
    
    // Horizontal placement: ensure it's close enough to the previous platform
    // Max safe horizontal gap is ~90px when jumping upward
    const maxReachX = 90;
    
    // The valid X range where the player can actually jump to it from the previous platform
    const minX = Math.max(10, prevPlat.x - width - maxReachX);
    const maxX = Math.min(W - width - 10, prevPlat.x + prevPlat.width + maxReachX);
    
    let x = minX + rng() * (maxX - minX);

    platforms.push({
      x: Math.round(x),
      y: Math.round(currentY),
      width: Math.max(60, Math.round(width)), // don't make them too narrow
      height: 18
    });
  }

  return platforms;
}

// ── Trap generator ─────────────────────────────────────────────────────────────
function generateTraps(rng, platforms, world, level, stage) {
  const difficulty  = (world - 1) * 10 + (level - 1);
  const traps       = [];
  const trollWorld  = world === 9;
  const hellWorld   = world === 10;

  // Trap probability increases with difficulty
  const trapChance = 0.15 + difficulty * 0.008;

  for (const pl of platforms) {
    if (pl.height === 50) continue; // skip ground sections, add traps separately

    if (rng() < trapChance) {
      // Spike trap on top of a platform
      traps.push({
        x: pl.x + pl.width / 2 - 10,
        y: pl.y - 16,
        width: 20, height: 16,
        color: '#ef4444',
        active: true, visible: true
      });
    }
  }

  // Troll world: add fake floor traps (look identical to real platforms)
  if (trollWorld || hellWorld) {
    const numFakeFloors = 1 + Math.floor(difficulty * 0.05 + rng() * 3);
    for (let i = 0; i < numFakeFloors; i++) {
      const x = 100 + rng() * 500;
      const y = 350 + rng() * 50;
      const w = 80 + rng() * 100;
      traps.push({
        x: Math.round(x), y: Math.round(y),
        width: Math.round(w), height: 20,
        color: '#475569', // Same grey as platforms — the troll!
        active: true, visible: true
      });
    }
  }

  // Hell world: ceiling spikes
  if (hellWorld) {
    const spikeCount = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < spikeCount; i++) {
      traps.push({
        x: 100 + i * 120 + rng() * 60,
        y: 0, width: 30, height: 20,
        color: '#dc2626',
        active: true, visible: true
      });
    }
  }

  // Stage bonus: pit traps (gaps in the ground) — later stages only
  if (stage > 5) {
    const pitCount = Math.floor((stage - 5) * 0.4 + rng() * 2);
    for (let i = 0; i < pitCount; i++) {
      traps.push({
        x: 150 + i * 180 + rng() * 100,
        y: 380, width: 50 + rng() * 40, height: 80,
        color: '#000000',
        active: true, visible: false // invisible pit!
      });
    }
  }

  return traps;
}

// ── Exit generator (TOP of the level) ────────────────────────────────────────
function generateExit(rng, platforms, world, stage) {
  // Exit is always at the highest (topmost) platform
  const topPlatform = platforms.reduce((best, p) => p.y < best.y ? p : best, platforms[0]);
  const trollMode   = world === 9 && stage > 5;

  return {
    x:      topPlatform.x + Math.floor(topPlatform.width / 2) - 20,
    y:      topPlatform.y - 62,
    width:  40,
    height: 60,
    type:   trollMode ? 'troll' : 'normal'
  };
}

// ── Main export ────────────────────────────────────────────────────────────────
/**
 * Generates a complete level config for the given world/level/stage.
 * @param {number} worldId  1–10
 * @param {number} levelId  1–10
 * @param {number} stageId  1–10
 * @returns level object compatible with GameEngine
 */
export function generateLevel(worldId, levelId, stageId) {
  const seed      = rngSeed(worldId, levelId, stageId);
  const rng       = createRNG(seed);
  const world     = WORLDS[worldId - 1];
  const physics   = worldPhysics(worldId);
  const platforms = generatePlatforms(rng, worldId, levelId, stageId);
  const traps     = generateTraps(rng, platforms, worldId, levelId, stageId);
  const exit      = generateExit(rng, platforms, worldId, stageId);

  return {
    id:    `${worldId}-${levelId}-${stageId}`,
    name:  `${world.emoji} ${world.name} — Level ${levelId}-${stageId}`,
    world: worldId,
    level: levelId,
    stage: stageId,
    worldTheme: world,
    config: {
      ...physics,
      platforms,
      traps,
      exit
    }
  };
}

/**
 * Returns metadata for all 100 named levels (10 worlds × 10 levels each)
 */
export function getAllLevelMeta() {
  const result = [];
  for (const world of WORLDS) {
    for (let l = 1; l <= 10; l++) {
      result.push({
        id:      `${world.id}-${l}`,
        worldId: world.id,
        levelId: l,
        name:    `${world.emoji} ${world.name} Lv.${l}`,
        world
      });
    }
  }
  return result;
}
