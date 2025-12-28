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
  lastSequence?: number; // To track packet ordering
}

export enum GameStatus {
  LOBBY = 'LOBBY',
  CONNECTING = 'CONNECTING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR',
}

// Optimization: Union type for payloads to enforce strict structure
export type PeerMessage = 
  | [number, Record<string, any>] // UPDATE: [OP.UPDATE, { playerId: [x,y,z,yaw,health,seq] }]
  | [number, string, string];     // HIT: [OP.HIT, targetId, shooterId]