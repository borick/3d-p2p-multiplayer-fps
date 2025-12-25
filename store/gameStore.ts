import { create } from 'zustand';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { GameStatus, PlayerState, PeerMessage } from '../types';
import { generateId, getRandomColor, BROADCAST_RATE_MS, MAX_HEALTH, BULLET_DAMAGE } from '../constants';

interface GameStore {
  status: GameStatus;
  myId: string;
  hostId: string | null;
  isHost: boolean;
  players: Record<string, PlayerState>;
  myColor: string;
  error: string | null;
  
  // Actions
  initialize: () => void;
  hostGame: () => Promise<string>;
  joinGame: (targetHostId: string) => Promise<void>;
  updateMyState: (pos: {x: number, y: number, z: number}, yaw: number) => void;
  sendHit: (targetId: string) => void;
  disconnect: () => void;
}

// Keep peer instance outside of store state
let peer: Peer | null = null;
let connections: DataConnection[] = [];
let broadcastInterval: any = null;

const createInitialPlayer = (id: string, color: string): PlayerState => ({
  id,
  position: { x: (Math.random() * 10) - 5, y: 5, z: (Math.random() * 10) - 5 },
  yaw: 0,
  color,
  health: MAX_HEALTH
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
    // @ts-ignore - PeerJS constructor handling for different module formats
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

        if (broadcastInterval) clearInterval(broadcastInterval);
        broadcastInterval = setInterval(() => {
          const state = get().players;
          const msg: PeerMessage = { type: 'UPDATE', payload: state };
          connections.forEach(conn => { if (conn.open) conn.send(msg); });
        }, BROADCAST_RATE_MS);

        resolve(id);
      });

      peer!.on('connection', (conn) => {
        connections.push(conn);
        conn.on('data', (data: any) => {
           const msg = data as PeerMessage;
           
           if (msg.type === 'UPDATE') {
             // Host receives movement update
             const clientPlayer = msg.payload as PlayerState;
             set(state => ({
               players: { 
                 ...state.players, 
                 [clientPlayer.id]: {
                   ...clientPlayer,
                   // Host is authority on health, don't let client overwrite it easily unless we want to trust client health
                   // For now, let's persist Host's version of health for the client
                   health: state.players[clientPlayer.id]?.health ?? MAX_HEALTH
                 } 
               }
             }));
           } else if (msg.type === 'HIT') {
             // Host receives HIT event
             const targetId = msg.payload as string;
             set(state => {
               const target = state.players[targetId];
               if (!target) return state;
               
               let newHealth = target.health - BULLET_DAMAGE;
               let newPos = target.position;

               // Respawn logic
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
        });
      });

      peer!.on('error', (err) => {
        console.error("Peer error:", err);
        set({ error: "Connection error: " + err.type, status: GameStatus.ERROR });
      });
    });
  },

  joinGame: async (targetHostId: string) => {
    set({ status: GameStatus.CONNECTING, error: null });
    if (peer) peer.destroy();
    
    const newId = generateId();
    // @ts-ignore
    peer = new Peer(newId);

    return new Promise<void>((resolve, reject) => {
      peer!.on('open', (id) => {
        set({ myId: id, isHost: false, hostId: targetHostId });
        
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
             const myState = get().players[id];
             if (myState) {
               const msg: PeerMessage = { type: 'UPDATE', payload: myState };
               if (conn.open) conn.send(msg);
             }
           }, BROADCAST_RATE_MS);
           
           resolve();
        });

        conn.on('data', (data: any) => {
          const msg = data as PeerMessage;
          if (msg.type === 'UPDATE') {
            const worldState = msg.payload as Record<string, PlayerState>;
            set(state => {
              const myCurrentState = state.players[state.myId];
              const myServerState = worldState[state.myId];

              // If server says we respawned (large distance jump or health reset from 0), accept server pos
              let myNextState = myCurrentState || myServerState;
              
              if (myCurrentState && myServerState) {
                  // Sync Health from server
                  const newHealth = myServerState.health;
                  
                  // Check for respawn (teleport)
                  const dist = Math.sqrt(
                    Math.pow(myCurrentState.position.x - myServerState.position.x, 2) + 
                    Math.pow(myCurrentState.position.z - myServerState.position.z, 2)
                  );
                  
                  if (dist > 5) {
                    // Force teleport
                    myNextState = { ...myServerState };
                  } else {
                    // Keep local movement, accept health
                    myNextState = { ...myCurrentState, health: newHealth };
                  }
              }

              return {
                players: {
                  ...worldState,
                  [state.myId]: myNextState
                }
              };
            });
          }
        });

        conn.on('close', () => {
          set({ status: GameStatus.ERROR, error: "Disconnected from host" });
        });
        
        setTimeout(() => {
          if (!conn.open) {
            set({ status: GameStatus.ERROR, error: "Connection timeout. Host not found." });
            reject();
          }
        }, 5000);
      });

      peer!.on('error', (err) => {
         set({ error: "Could not connect to peer server or host.", status: GameStatus.ERROR });
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
    const { isHost, players } = get();
    if (isHost) {
      // Logic duplicated from hostGame message handler for local host actions
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
      // Send to host
      const msg: PeerMessage = { type: 'HIT', payload: targetId };
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