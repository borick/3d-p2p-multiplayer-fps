import { create } from 'zustand';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { GameStatus, PlayerState, PeerMessage } from '../types';
import { 
  generateId, 
  getRandomColor, 
  BROADCAST_RATE_MS, 
  MAX_HEALTH, 
  BULLET_DAMAGE,
  // We assume these are added to constants.ts as discussed:
  // export const OPS = { UPDATE: 0, HIT: 1 };
  OPS 
} from '../constants';

interface GameStore {
  status: GameStatus;
  myId: string;
  hostId: string | null;
  isHost: boolean;
  players: Record<string, PlayerState>;
  myColor: string;
  error: string | null;
  initialize: () => void;
  hostGame: () => Promise<string>;
  joinGame: (targetHostId: string) => Promise<void>;
  updateMyState: (pos: {x: number, y: number, z: number}, yaw: number) => void;
  sendHit: (targetId: string) => void;
  disconnect: () => void;
}

// Internal singleton variables (not part of React state)
let peer: Peer | null = null;
let connections: DataConnection[] = [];
let broadcastInterval: any = null;
let sequenceNumber = 0; // Increments every tick to track packet freshness

// --- HELPER: Serialization (Compression) ---
// Converts a Player Object into a tiny array: [x, y, z, yaw, health, sequence]
const packPlayer = (p: PlayerState, seq: number): number[] => [
  Number(p.position.x.toFixed(2)),
  Number(p.position.y.toFixed(2)),
  Number(p.position.z.toFixed(2)),
  Number(p.yaw.toFixed(2)),
  p.health,
  seq
];

const createInitialPlayer = (id: string, color: string): PlayerState => ({
  id,
  position: { x: (Math.random() * 10) - 5, y: 5, z: (Math.random() * 10) - 5 },
  yaw: 0,
  color,
  health: MAX_HEALTH,
  lastSequence: 0 
});

export const useGameStore = create<GameStore>((set, get) => ({
  status: GameStatus.LOBBY,
  myId: '',
  hostId: null,
  isHost: false,
  players: {},
  myColor: getRandomColor(),
  error: null,

  initialize: () => {},

  hostGame: async () => {
    set({ status: GameStatus.CONNECTING, error: null });
    if (peer) peer.destroy();
    
    const newId = generateId();
    peer = new Peer(newId);

    return new Promise((resolve) => {
      peer!.on('open', (id) => {
        const initialPlayer = createInitialPlayer(id, get().myColor);
        set({ 
          status: GameStatus.PLAYING, 
          myId: id, 
          hostId: id, 
          isHost: true,
          players: { [id]: initialPlayer }
        });

        // --- HOST BROADCAST LOOP ---
        if (broadcastInterval) clearInterval(broadcastInterval);
        broadcastInterval = setInterval(() => {
          sequenceNumber++;
          const state = get().players;
          
          // Pack the entire world state into a dictionary of arrays
          const packedState: Record<string, any> = {};
          
          Object.values(state).forEach(p => {
             // Host acts as the authority on Sequence for the world state
             packedState[p.id] = packPlayer(p, sequenceNumber);
             // We append color to the end for new players (Position 6)
             packedState[p.id].push(p.color); 
          });

          // Network Message: [OP_CODE, PAYLOAD]
          const msg: PeerMessage = [OPS.UPDATE, packedState];
          
          connections.forEach(conn => { 
            if (conn.open) conn.send(msg); 
          });
        }, BROADCAST_RATE_MS);

        resolve(id);
      });

      peer!.on('connection', (conn) => {
        connections.push(conn);
        
        conn.on('data', (data: any) => {
           // Expecting: [OP, PAYLOAD, EXTRA]
           const [op, payload, extra] = data as [number, any, any];

           if (op === OPS.UPDATE) {
             // CLIENT -> HOST Update
             // Payload is [x, y, z, yaw, health, seq, color]
             const pId = conn.peer;
             const [x, y, z, yaw, hp, seq, col] = payload;

             set(state => {
               const existing = state.players[pId];
               
               // NETWORKING FIX: Packet Discard
               // If we received a packet with seq 50, but we already processed 51, ignore 50.
               if (existing && existing.lastSequence && seq < existing.lastSequence) {
                 return state;
               }

               return {
                 players: { 
                   ...state.players, 
                   [pId]: {
                     id: pId,
                     position: { x, y, z },
                     yaw,
                     health: state.players[pId]?.health ?? MAX_HEALTH, // Host ignores client health claims
                     color: existing ? existing.color : col,
                     lastSequence: seq
                   }
                 }
               };
             });
           } 
           else if (op === OPS.HIT) {
             // CLIENT -> HOST Hit Notification
             const targetId = payload as string;
             const shooterId = extra as string;
             
             set(state => {
               const target = state.players[targetId];
               const shooter = state.players[shooterId];
               
               // SECURITY FIX: Basic Validation
               if (!target || !shooter) return state; 
               if (shooter.health <= 0) return state; // Dead players can't shoot

               // Host calculates damage
               let newHealth = target.health - BULLET_DAMAGE;
               let newPos = target.position;

               // Respawn Logic
               if (newHealth <= 0) {
                 newHealth = MAX_HEALTH;
                 newPos = { x: (Math.random() * 20) - 10, y: 5, z: (Math.random() * 20) - 10 };
               }

               return {
                 players: {
                   ...state.players,
                   [targetId]: { ...target, health: newHealth, position: newPos }
                 }
               };
             });
           }
        });

        conn.on('close', () => {
           connections = connections.filter(c => c !== conn);
           // Remove player immediately on disconnect
           set(state => {
             const { [conn.peer]: _, ...rest } = state.players;
             return { players: rest };
           });
        });
      });
    });
  },

  joinGame: async (targetHostId: string) => {
    set({ status: GameStatus.CONNECTING, error: null });
    if (peer) peer.destroy();
    
    const newId = generateId();
    peer = new Peer(newId);

    return new Promise<void>((resolve, reject) => {
      peer!.on('open', (id) => {
        set({ myId: id, isHost: false, hostId: targetHostId });
        
        // NETWORKING FIX: Removed { reliable: true }
        // We want UDP-like behavior (fire and forget) for movement to prevent lag spikes.
        const conn = peer!.connect(targetHostId);
        connections = [conn];

        conn.on('open', () => {
           const initialPlayer = createInitialPlayer(id, get().myColor);
           set({ 
             status: GameStatus.PLAYING,
             players: { [id]: initialPlayer }
           });

           // --- CLIENT BROADCAST LOOP ---
           if (broadcastInterval) clearInterval(broadcastInterval);
           broadcastInterval = setInterval(() => {
             sequenceNumber++;
             const myState = get().players[id];
             
             if (myState && conn.open) {
               // Send packed data: [x, y, z, yaw, hp, seq, color]
               const packed = [...packPlayer(myState, sequenceNumber), myState.color];
               conn.send([OPS.UPDATE, packed]);
             }
           }, BROADCAST_RATE_MS);
           
           resolve();
        });

        conn.on('data', (data: any) => {
          const [op, payload] = data as [number, Record<string, any>];
          
          if (op === OPS.UPDATE) {
            set(state => {
              const nextPlayers = { ...state.players };
              
              // Payload is a dict: { "playerA": [x,y,z...], "playerB": [x,y,z...] }
              Object.entries(payload).forEach(([pId, data]) => {
                const [x, y, z, yaw, hp, seq, col] = data;

                if (pId === state.myId) {
                  // If this is ME, only accept Health updates from server
                  // (We trust our own local position more than the server's echo)
                  if (nextPlayers[pId]) {
                    nextPlayers[pId].health = hp;
                  }
                } else {
                  // If this is an ENEMY, update fully
                  const existing = nextPlayers[pId];
                  
                  // Discard old packets
                  if (existing && existing.lastSequence && seq < existing.lastSequence) return;

                  nextPlayers[pId] = {
                    id: pId,
                    position: { x, y, z },
                    yaw,
                    health: hp,
                    color: existing?.color || col,
                    lastSequence: seq
                  };
                }
              });

              return { players: nextPlayers };
            });
          }
        });

        conn.on('close', () => {
          set({ status: GameStatus.ERROR, error: "Disconnected from host" });
        });
        
        // Timeout check
        setTimeout(() => {
            if (!conn.open) {
                set({ status: GameStatus.ERROR, error: "Connection timeout." });
                reject();
            }
        }, 5000);
      });

      peer!.on('error', (err) => {
         console.error(err);
         set({ error: "Connection error.", status: GameStatus.ERROR });
         reject(err);
      });
    });
  },

  updateMyState: (pos, yaw) => {
    const { myId, players } = get();
    if (!myId || !players[myId]) return;
    set(state => ({
      players: {
        ...state.players,
        [myId]: {
          ...state.players[myId],
          position: pos,
          yaw: yaw
        }
      }
    }));
  },

  sendHit: (targetId: string) => {
    const { isHost, players, myId } = get();
    
    if (isHost) {
      // Host Logic: Apply damage immediately
      set(state => {
         const target = state.players[targetId];
         if (!target) return state;
         let newHealth = target.health - BULLET_DAMAGE;
         let newPos = target.position;
         if (newHealth <= 0) {
           newHealth = MAX_HEALTH;
           newPos = { x: (Math.random() * 20) - 10, y: 5, z: (Math.random() * 20) - 10 };
         }
         return {
           players: {
             ...state.players,
             [targetId]: { ...target, health: newHealth, position: newPos }
           }
         };
      });
    } else {
      // Client Logic: Send HIT Request -> [OP, Target, Shooter]
      const msg: PeerMessage = [OPS.HIT, targetId, myId];
      connections.forEach(conn => { if (conn.open) conn.send(msg); });
    }
  },

  disconnect: () => {
    if (peer) peer.destroy();
    if (broadcastInterval) clearInterval(broadcastInterval);
    connections = [];
    set({ status: GameStatus.LOBBY, players: {}, hostId: null });
  }
}));