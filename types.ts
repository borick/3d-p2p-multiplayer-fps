export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface PlayerState {
  id: string;
  position: Position;
  yaw: number;
  color: string;
  health: number;
  lastSequence?: number;
  // NEW: Weapon State
  currentWeapon: number; // 0 = Pistol, 1 = Rocket
  ammoRocket: number;
}

export interface Projectile {
  id: string;
  ownerId: string;
  position: Position;
  velocity: Position; // Direction * Speed
  createdAt: number;
}

export interface WorldItem {
  id: string;
  type: 'AMMO_ROCKET' | 'HEALTH';
  position: Position;
  respawnTime?: number; // If set, item is currently hidden/respawning
}

export enum GameStatus {
  LOBBY = 'LOBBY',
  CONNECTING = 'CONNECTING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR',
}

export type PeerMessage = 
  | [number, any] 
  | [number, any, any];