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

// --- FIX: GOOGLE STUN SERVERS ---
// This tells the browser how to punch through routers/firewalls.
const PEER_CONFIG = {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ]
    }
};

let peer: Peer | null = null;
let connections: DataConnection[] = [];
let broadcastInterval: any = null;
let sequenceNumber = 0;

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
    // APPLY CONFIG HERE
    peer = new Peer(newId, PEER_CONFIG);

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

        if (broadcastInterval) clearInterval(broadcastInterval);
        broadcastInterval = setInterval(() => {
          sequenceNumber++;
          const state = get().players;
          const packedState: Record<string, any> = {};
          
          Object.values(state).forEach(p => {
             packedState[p.id] = packPlayer(p, sequenceNumber);
             packedState[p.id].push(p.color); 
          });

          const msg: PeerMessage = [OPS.UPDATE, packedState];
          connections.forEach(conn => { if (conn.open) conn.send(msg); });
        }, BROADCAST_RATE_MS);

        resolve(id);
      });

      peer!.on('connection', (conn) => {
        connections.push(conn);
        
        conn.on('data', (data: any) => {
           // Basic error handling for malformed packets
           if (!Array.isArray(data)) return;

           const [op, payload, extra] = data as [number, any, any];

           if (op === OPS.UPDATE) {
             const pId = conn.peer;
             const [x, y, z, yaw, hp, seq, col] = payload;

             set(state => {
               const existing = state.players[pId];
               if (existing && existing.lastSequence && seq < existing.lastSequence) return state;

               return {
                 players: { 
                   ...state.players, 
                   [pId]: {
                     id: pId,
                     position: { x, y, z },
                     yaw,
                     health: state.players[pId]?.health ?? MAX_HEALTH,
                     color: existing ? existing.color : col,
                     lastSequence: seq
                   }
                 }
               };
             });
           } else if (op === OPS.HIT) {
             const targetId = payload as string;
             const shooterId = extra as string;
             
             set(state => {
               const target = state.players[targetId];
               const shooter = state.players[shooterId];
               if (!target || !shooter) return state;
               if (shooter.health <= 0) return state;

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
           }
        });

        conn.on('close', () => {
           connections = connections.filter(c => c !== conn);
           set(state => {
             const { [conn.peer]: _, ...rest } = state.players;
             return { players: rest };
           });
        });
      });
      
      peer!.on('error', (err) => {
        console.error("Peer Error", err);
        // Don't crash lobby on minor network blips
        if (err.type === 'peer-unavailable') {
            // ignore
        } else {
            set({ status: GameStatus.ERROR, error: "Host Error: " + err.type });
        }
      });
    });
  },

  joinGame: async (targetHostId: string) => {
    set({ status: GameStatus.CONNECTING, error: null });
    if (peer) peer.destroy();
    
    const newId = generateId();
    // APPLY CONFIG HERE
    peer = new Peer(newId, PEER_CONFIG);

    return new Promise<void>((resolve, reject) => {
      peer!.on('open', (id) => {
        set({ myId: id, isHost: false, hostId: targetHostId });
        
        // Use Reliable (TCP) to ensure the initial handshake works
        const conn = peer!.connect(targetHostId, { reliable: true });
        connections = [conn];

        conn.on('open', () => {
           const initialPlayer = createInitialPlayer(id, get().myColor);
           set({ 
             status: GameStatus.PLAYING,
             players: { [id]: initialPlayer }
           });

           if (broadcastInterval) clearInterval(broadcastInterval);
           broadcastInterval = setInterval(() => {
             sequenceNumber++;
             const myState = get().players[id];
             if (myState && conn.open) {
               const packed = [...packPlayer(myState, sequenceNumber), myState.color];
               conn.send([OPS.UPDATE, packed]);
             }
           }, BROADCAST_RATE_MS);
           
           resolve();
        });

        conn.on('data', (data: any) => {
          if (!Array.isArray(data)) return;
          const [op, payload] = data as [number, Record<string, any>];
          
          if (op === OPS.UPDATE) {
            set(state => {
              const nextPlayers = { ...state.players };
              Object.entries(payload).forEach(([pId, data]) => {
                const [x, y, z, yaw, hp, seq, col] = data;

                if (pId === state.myId) {
                  if (nextPlayers[pId]) nextPlayers[pId].health = hp;
                } else {
                  const existing = nextPlayers[pId];
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
        
        setTimeout(() => {
            if (!conn.open) {
                set({ status: GameStatus.ERROR, error: "Connection timeout. Host not found or blocked." });
                reject();
            }
        }, 8000); // Increased timeout to 8s
      });

      peer!.on('error', (err) => {
         console.error("Peer Error", err);
         set({ error: "Could not connect: " + err.type, status: GameStatus.ERROR });
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
        [myId]: { ...state.players[myId], position: pos, yaw: yaw }
      }
    }));
  },

  sendHit: (targetId: string) => {
    const { isHost, players, myId } = get();
    if (isHost) {
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