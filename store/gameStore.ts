import { create } from 'zustand';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { GameStatus, PlayerState, PeerMessage, Projectile, WorldItem } from '../types';
import { 
  generateId, 
  getRandomColor, 
  BROADCAST_RATE_MS, 
  MAX_HEALTH, 
  WEAPONS,
  OPS 
} from '../constants';

// --- CONFIG ---
const PEER_CONFIG = {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ]
    }
};

interface GameStore {
  status: GameStatus;
  myId: string;
  hostId: string | null;
  isHost: boolean;
  players: Record<string, PlayerState>;
  projectiles: Projectile[];
  items: Record<string, WorldItem>; // Items on the map
  myColor: string;
  error: string | null;
  
  initialize: () => void;
  hostGame: () => Promise<string>;
  joinGame: (targetHostId: string) => Promise<void>;
  updateMyState: (pos: {x: number, y: number, z: number}, yaw: number) => void;
  
  // ACTIONS
  fireWeapon: (origin: {x:number, y:number, z:number}, direction: {x:number, y:number, z:number}) => void;
  tryPickup: (itemId: string) => void;
  switchWeapon: () => void;
  sendHit: (targetId: string, damage: number) => void; // Updated signature
  
  disconnect: () => void;
}

let peer: Peer | null = null;
let connections: DataConnection[] = [];
let broadcastInterval: any = null;
let gameLoop: any = null;
let sequenceNumber = 0;

// Helper: Vector math
const add = (v1: any, v2: any) => ({ x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z });
const dist = (v1: any, v2: any) => Math.sqrt((v1.x-v2.x)**2 + (v1.y-v2.y)**2 + (v1.z-v2.z)**2);

const packPlayer = (p: PlayerState, seq: number): number[] => [
  Number(p.position.x.toFixed(2)),
  Number(p.position.y.toFixed(2)),
  Number(p.position.z.toFixed(2)),
  Number(p.yaw.toFixed(2)),
  p.health,
  seq,
  p.currentWeapon,
  p.ammoRocket
];

// Initial Items on the map
const INITIAL_ITEMS: Record<string, WorldItem> = {
    'rocket_1': { id: 'rocket_1', type: 'AMMO_ROCKET', position: { x: 5, y: 1, z: 5 } },
    'rocket_2': { id: 'rocket_2', type: 'AMMO_ROCKET', position: { x: -5, y: 1, z: -5 } },
    'health_1': { id: 'health_1', type: 'HEALTH', position: { x: 0, y: 1, z: 0 } },
};

const createInitialPlayer = (id: string, color: string): PlayerState => ({
  id,
  position: { x: (Math.random() * 10) - 5, y: 5, z: (Math.random() * 10) - 5 },
  yaw: 0,
  color,
  health: MAX_HEALTH,
  lastSequence: 0,
  currentWeapon: 0, // Pistol
  ammoRocket: 0 // Start with 0 rockets
});

export const useGameStore = create<GameStore>((set, get) => ({
  status: GameStatus.LOBBY,
  myId: '',
  hostId: null,
  isHost: false,
  players: {},
  projectiles: [],
  items: INITIAL_ITEMS, // Client gets copy, but Host manages respawns
  myColor: getRandomColor(),
  error: null,

  initialize: () => {},

  hostGame: async () => {
    set({ status: GameStatus.CONNECTING, error: null });
    if (peer) peer.destroy();
    const newId = generateId();
    peer = new Peer(newId, PEER_CONFIG);

    return new Promise((resolve) => {
      peer!.on('open', (id) => {
        set({ 
          status: GameStatus.PLAYING, 
          myId: id, 
          hostId: id, 
          isHost: true, 
          players: { [id]: createInitialPlayer(id, get().myColor) },
          items: JSON.parse(JSON.stringify(INITIAL_ITEMS)) // Deep copy
        });

        // HOST LOOP (Logic + Network)
        if (broadcastInterval) clearInterval(broadcastInterval);
        
        // 1. Network Broadcast (30ms)
        broadcastInterval = setInterval(() => {
          sequenceNumber++;
          const state = get();
          const packedState: Record<string, any> = {};
          
          Object.values(state.players).forEach(p => {
             packedState[p.id] = packPlayer(p, sequenceNumber);
             packedState[p.id].push(p.color); 
          });

          // Send Players + Active Item Status (if strictly needed, or just rely on events)
          const msg: PeerMessage = [OPS.UPDATE, packedState];
          connections.forEach(conn => { if (conn.open) conn.send(msg); });
        }, BROADCAST_RATE_MS);

        // 2. Physics Loop (Projectiles) - Run at 60fps roughly
        if (gameLoop) clearInterval(gameLoop);
        gameLoop = setInterval(() => {
            set(state => {
                const now = Date.now();
                const nextProjectiles = state.projectiles
                    .map(p => ({
                        ...p,
                        position: add(p.position, p.velocity)
                    }))
                    .filter(p => now - p.createdAt < 3000); // Despawn after 3s

                // Check for Rocket Hits (Host Authority)
                const hitProjectiles: string[] = [];
                nextProjectiles.forEach(p => {
                    // Simple ground collision
                    if (p.position.y <= 0) {
                        hitProjectiles.push(p.id);
                        // EXPLOSION LOGIC
                        Object.values(state.players).forEach(player => {
                            const d = dist(p.position, player.position);
                            if (d < WEAPONS.ROCKET.radius) {
                                // Linear damage falloff
                                const dmg = Math.floor(WEAPONS.ROCKET.damage * (1 - d/WEAPONS.ROCKET.radius));
                                if (dmg > 0) get().sendHit(player.id, dmg);
                            }
                        });
                    }
                });

                // Check Item Respawns
                const nextItems = { ...state.items };
                let itemsChanged = false;
                Object.values(nextItems).forEach(item => {
                    if (item.respawnTime && now > item.respawnTime) {
                        item.respawnTime = undefined; // Respawned
                        itemsChanged = true;
                    }
                });

                return { 
                    projectiles: nextProjectiles.filter(p => !hitProjectiles.includes(p.id)),
                    items: itemsChanged ? nextItems : state.items
                };
            });
        }, 16);

        resolve(id);
      });

      peer!.on('connection', (conn) => {
        connections.push(conn);
        conn.on('data', (data: any) => {
           if (!Array.isArray(data)) return;
           const [op, payload, extra] = data as [number, any, any];

           // --- HOST HANDLERS ---
           if (op === OPS.UPDATE) {
             const pId = conn.peer;
             const [x, y, z, yaw, hp, seq, wpn, ammo] = payload;
             set(state => ({
                 players: {
                     ...state.players,
                     [pId]: {
                         ...state.players[pId],
                         position: {x,y,z}, yaw,
                         currentWeapon: wpn, ammoRocket: ammo,
                         lastSequence: seq
                     }
                 }
             }));
           } 
           else if (op === OPS.HIT) {
              get().sendHit(payload, extra); // payload=target, extra=damage
           }
           else if (op === OPS.ROCKET_SPAWN) {
              // Client fired rocket, Host tracks it
              const [origin, velocity] = payload;
              set(state => ({
                  projectiles: [...state.projectiles, {
                      id: generateId(),
                      ownerId: conn.peer,
                      position: origin,
                      velocity: velocity,
                      createdAt: Date.now()
                  }]
              }));
              // Forward to other clients so they see it too? 
              // For simplicity, we let Host Sync projectiles via UPDATE or separate logic
              // But here we'll just broadcast the event
              const msg: PeerMessage = [OPS.ROCKET_SPAWN, payload, conn.peer]; // Forward
              connections.forEach(c => { if(c !== conn && c.open) c.send(msg) });
           }
           else if (op === OPS.ITEM_PICKUP) {
               const itemId = payload;
               set(state => {
                   const item = state.items[itemId];
                   if (item && !item.respawnTime) {
                       // Valid Pickup
                       // Tell Client "Yes, you got it" (Logic simplified: we update state, next tick syncs)
                       return {
                           items: {
                               ...state.items,
                               [itemId]: { ...item, respawnTime: Date.now() + 10000 } // 10s Respawn
                           }
                       };
                   }
                   return state;
               });
           }
        });
      });
    });
  },

  joinGame: async (targetHostId) => {
    // ... Standard Join Logic ...
    // (Collapsed for brevity - mostly same as before, see specific handlers below)
    set({ status: GameStatus.CONNECTING });
    if (peer) peer.destroy();
    peer = new Peer(generateId(), PEER_CONFIG);
    
    return new Promise((resolve, reject) => {
       peer!.on('open', id => {
           set({ myId: id, isHost: false, hostId: targetHostId, items: INITIAL_ITEMS });
           const conn = peer!.connect(targetHostId, { reliable: true });
           connections = [conn];

           conn.on('open', () => {
               set({ status: GameStatus.PLAYING, players: { [id]: createInitialPlayer(id, get().myColor) }});
               
               // CLIENT BROADCAST
               if (broadcastInterval) clearInterval(broadcastInterval);
               broadcastInterval = setInterval(() => {
                   sequenceNumber++;
                   const me = get().players[id];
                   if (me && conn.open) {
                       const packed = packPlayer(me, sequenceNumber);
                       conn.send([OPS.UPDATE, packed]); // Don't need color every time
                   }
               }, BROADCAST_RATE_MS);

               // CLIENT PHYSICS (Visual Only)
               if (gameLoop) clearInterval(gameLoop);
               gameLoop = setInterval(() => {
                   set(state => ({
                       projectiles: state.projectiles.map(p => ({
                           ...p, position: add(p.position, p.velocity)
                       })).filter(p => Date.now() - p.createdAt < 3000)
                   }));
               }, 16);
               
               resolve();
           });

           conn.on('data', (data: any) => {
               if(!Array.isArray(data)) return;
               const [op, payload, extra] = data;

               if (op === OPS.UPDATE) {
                   set(state => {
                       const nextPlayers = { ...state.players };
                       Object.entries(payload as Record<string,any>).forEach(([pid, d]) => {
                           const [x,y,z,yaw,hp,seq,wpn,ammo,col] = d;
                           if (pid === state.myId) {
                               if(nextPlayers[pid]) {
                                   nextPlayers[pid].health = hp; // Trust server HP
                               }
                           } else {
                               nextPlayers[pid] = {
                                   id: pid, position:{x,y,z}, yaw, health:hp,
                                   currentWeapon: wpn, ammoRocket: ammo, color: nextPlayers[pid]?.color || col
                               };
                           }
                       });
                       return { players: nextPlayers };
                   });
               }
               else if (op === OPS.ROCKET_SPAWN) {
                   const [origin, velocity] = payload;
                   set(state => ({
                       projectiles: [...state.projectiles, {
                           id: generateId(), ownerId: extra, position: origin, velocity, createdAt: Date.now()
                       }]
                   }));
               }
           });
       });
       // ... Error handlers ...
    });
  },

  // --- ACTIONS ---

  fireWeapon: (origin, direction) => {
      const { players, myId, isHost } = get();
      const me = players[myId];
      if (!me) return;

      if (me.currentWeapon === WEAPONS.ROCKET.id) {
          if (me.ammoRocket > 0) {
              // Deduct Ammo
              set(s => ({ players: { ...s.players, [myId]: { ...me, ammoRocket: me.ammoRocket - 1 } } }));
              
              const velocity = { 
                  x: direction.x * 0.5, // Slower than hitscan 
                  y: direction.y * 0.5, 
                  z: direction.z * 0.5 
              };
              
              // Local Visual
              set(s => ({
                  projectiles: [...s.projectiles, {
                      id: generateId(), ownerId: myId, position: origin, velocity, createdAt: Date.now()
                  }]
              }));

              // Network
              const msg: PeerMessage = [OPS.ROCKET_SPAWN, [origin, velocity], myId];
              connections.forEach(c => c.open && c.send(msg));
          }
      } 
      // Pistol logic handles via sendHit usually
  },

  sendHit: (targetId, damage) => {
      const { isHost, players } = get();
      if (isHost) {
          set(state => {
              const p = state.players[targetId];
              if (!p) return state;
              const nh = p.health - damage;
              // Respawn logic
              if (nh <= 0) {
                  return { players: { ...state.players, [targetId]: { ...p, health: MAX_HEALTH, position: {x:0, y:10, z:0}, ammoRocket: 0 } } };
              }
              return { players: { ...state.players, [targetId]: { ...p, health: nh } } };
          });
      } else {
          // Client request hit (Pistol)
          const msg: PeerMessage = [OPS.HIT, targetId, damage];
          connections.forEach(c => c.open && c.send(msg));
      }
  },

  tryPickup: (itemId) => {
      const { items, myId, players } = get();
      const item = items[itemId];
      if (item && !item.respawnTime) {
          const me = players[myId];
          const dist = Math.sqrt((me.position.x - item.position.x)**2 + (me.position.z - item.position.z)**2);
          
          if (dist < 1.5) {
              // Predictive Pickup
              set(s => {
                  const p = s.players[myId];
                  let newAmmo = p.ammoRocket;
                  let newHealth = p.health;
                  
                  if (item.type === 'AMMO_ROCKET') newAmmo += 3;
                  if (item.type === 'HEALTH') newHealth = Math.min(100, newHealth + 25);

                  // Mark item hidden locally immediately
                  return {
                      players: { ...s.players, [myId]: { ...p, ammoRocket: newAmmo, health: newHealth } },
                      items: { ...s.items, [itemId]: { ...item, respawnTime: Date.now() + 10000 } }
                  };
              });
              
              // Tell Host
              const msg: PeerMessage = [OPS.ITEM_PICKUP, itemId];
              connections.forEach(c => c.open && c.send(msg));
          }
      }
  },

  switchWeapon: () => {
      set(s => {
          const me = s.players[s.myId];
          if(!me) return s;
          const next = me.currentWeapon === 0 ? 1 : 0;
          return { players: { ...s.players, [s.myId]: { ...me, currentWeapon: next } } };
      });
  },

  updateMyState: (pos, yaw) => { /* Same as before */ },
  disconnect: () => { /* Same as before */ }
}));