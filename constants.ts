export const PLAYER_COLORS = [
  '#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33A8', '#33FFF5', '#F5FF33'
];

export const WORLD_SIZE = 100;
export const PLAYER_RADIUS = 0.8;
export const BROADCAST_RATE_MS = 30;
export const MAX_HEALTH = 100;
export const BULLET_DAMAGE = 25;

// === NETWORK OPERATION CODES ===
// If you don't have this, the game will fail silently!
export const OPS = {
  UPDATE: 0,
  HIT: 1
};

export const generateId = () => Math.random().toString(36).substr(2, 9);
export const getRandomColor = () => PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];