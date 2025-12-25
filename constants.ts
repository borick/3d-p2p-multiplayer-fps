export const PLAYER_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // yellow
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
];

export const WORLD_SIZE = 100;
export const PLAYER_RADIUS = 0.8;
export const BROADCAST_RATE_MS = 30; // ~30 updates per second
export const MAX_HEALTH = 100;
export const BULLET_DAMAGE = 25;

// Random ID generator for quick usage
export const generateId = () => Math.random().toString(36).substr(2, 9);

export const getRandomColor = () => PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
