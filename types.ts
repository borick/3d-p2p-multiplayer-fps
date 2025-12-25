export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface PlayerState {
  id: string;
  position: Position;
  yaw: number; // Rotation Y for facing direction
  color: string;
  health: number;
  lastUpdated?: number;
}

export enum GameStatus {
  LOBBY = 'LOBBY',
  CONNECTING = 'CONNECTING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR',
}

export interface PeerMessage {
  type: 'UPDATE' | 'HIT';
  payload: any;
}
