export const PLAYER_COLORS = [
  '#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33A8', '#33FFF5', '#F5FF33'
];

export const WORLD_SIZE = 100;
export const PLAYER_RADIUS = 0.8;
export const BROADCAST_RATE_MS = 30; // Network Tick Rate
export const MAX_HEALTH = 100;

// WEAPON CONFIG
export const WEAPONS = {
  PISTOL: { 
    id: 0, 
    name: 'Pistol', 
    damage: 15, 
    speed: 0, // Hitscan
    cooldown: 400, 
    type: 'HITSCAN' 
  },
  ROCKET: { 
    id: 1, 
    name: 'RPG', 
    damage: 80, 
    speed: 20, 
    cooldown: 1500, 
    type: 'PROJECTILE', 
    radius: 6 
  }
};

export const EXPLOSION_TIME = 500; 

// NETWORK OPS (Binary Headers)
export const OPS = {
  UPDATE: 0,       // Sync Position/HP
  HIT: 1,          // Report Hit
  ROCKET_SPAWN: 2, // Spawn Projectile
  ITEM_PICKUP: 3   // Claim Item
};

export const generateId = () => Math.random().toString(36).substr(2, 9);
export const getRandomColor = () => PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];