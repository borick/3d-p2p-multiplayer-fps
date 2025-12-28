export const PLAYER_COLORS = [
  '#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33A8', '#33FFF5', '#F5FF33'
];

export const WORLD_SIZE = 100;
export const PLAYER_RADIUS = 0.8;
export const BROADCAST_RATE_MS = 30;
export const MAX_HEALTH = 100;

// WEAPON CONFIG
export const WEAPONS = {
  PISTOL: { id: 0, name: 'Pistol', damage: 15, speed: 0, cooldown: 400, type: 'HITSCAN' },
  ROCKET: { id: 1, name: 'RPG', damage: 80, speed: 20, cooldown: 1500, type: 'PROJECTILE', radius: 6 }
};

export const EXPLOSION_TIME = 500; // ms to show explosion visual

// NETWORK OPS
export const OPS = {
  UPDATE: 0,
  HIT: 1,
  ROCKET_SPAWN: 2, // New: Tell others a rocket was fired
  ITEM_PICKUP: 3   // New: Tell Host I picked up an item
};

export const generateId = () => Math.random().toString(36).substr(2, 9);
export const getRandomColor = () => PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];