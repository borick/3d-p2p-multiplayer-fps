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

const PEER_CONFIG = {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ]
    }
};

// ANTI-CHEAT CONSTANTS
const MAX_SPEED_PER_TICK = 1.5; // Max units a player can move in 30ms (generous buffer)
const MAX_REACH = 100; // Max shooting distance

interface GameStore {
  status: GameStatus;
  myId: string;
  hostId: string | null;
  isHost: boolean;
  players: Record<string, PlayerState>;
  projectiles: Projectile[];
  items: Record<string, WorldItem>;
  myColor: string;
  error: string | null;
  
  initialize: () => void;
  hostGame: () => Promise<string>;
  joinGame: (targetHostId: string) => Promise<void>;
  updateMyState: (pos: {x: number, y: number, z: number}, yaw: number) => void;
  
  fireWeapon: (origin: {x:number, y:number, z:number}, direction: {x:number, y:number, z:number}) => void;
  tryPickup: (itemId: string) => void;
  switchWeapon: () => void;
  sendHit: (targetId: string, damage: number) => void;
  
  // Physics Actions (Called by React Loop)
  updateProjectiles: (newProjs: Projectile[]) => void;
  updateItems: (newItems: Record<string, WorldItem>) => void;
  
  disconnect: () => void;
}

// Global Variables
let peer: Peer | null = null;
let connections: DataConnection[] = [];
let broadcastInterval: any = null;
let sequenceNumber = 0;

// HOST-SIDE STATE TRACKING (Not shared with clients)
const playerCooldowns: Record<string, number> = {}; // Track last fire time
const lastKnownPositions: Record<string, {x:number, y:number, z:number}> = {}; // Track speed

const INITIAL_ITEMS: Record<string, WorldItem> = {
    'rocket_1': { id: 'rocket_1', type: 'AMMO_ROCKET', position: { x: 5, y: 1, z: 5 } },
    'rocket_2': { id: 'rocket_2', type: 'AMMO_ROCKET', position: { x: -5, y: 1, z: -5 } },
    'health_1': { id: 'health_1', type: 'HEALTH', position: { x: 0, y: 1, z: 0 } },
};

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

const createInitialPlayer = (id: string, color: string): PlayerState => ({
  id,
  position: { x: (Math.random() * 10) - 5, y: 5, z: (Math.random() * 10) - 5 },
  yaw: 0,
  color,
  health: MAX_HEALTH,
  lastSequence: 0,
  currentWeapon: 0,
  ammoRocket: 0
});

// Helper: 3D Distance
const getDist = (a: any, b: any) => Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);

export const useGameStore = create<GameStore>((set, get) => ({
  status: GameStatus.LOBBY,
  myId: '',
  hostId: null,
  isHost: false,
  players: {},
  projectiles: [],
  items: INITIAL_ITEMS,
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
          items: JSON.parse(JSON.stringify(INITIAL_ITEMS))
        });

        if (broadcastInterval) clearInterval(broadcastInterval);
        broadcastInterval = setInterval(() => {
          sequenceNumber++;
          const state = get();
          const packedState: Record<string, any> = {};
          
          Object.values(state.players).forEach(p => {
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
           if (!Array.isArray(data)) return;
           const [op, payload, extra] = data as [number, any, any];
           const pId = conn.peer;

           // --- 1. MOVEMENT VALIDATION ---
           if (op === OPS.UPDATE) {
             const [x, y, z, yaw, hp, seq, wpn, ammo] = payload;
             
             set(state => {
                 const prev = state.players[pId];
                 
                 // ANTI-CHEAT: SPEED CHECK
                 // If player existed before, check how far they moved
                 if (prev) {
                    const dist = getDist(prev.position, {x,y,z});
                    // If they moved unreasonably fast, IGNORE this packet
                    // This creates a "rubber band" effect for the cheater
                    if (dist > MAX_SPEED_PER_TICK) {
                        return state; 
                    }
                 }

                 return {
                     players: {
                         ...state.players,
                         [pId]: {
                             ...state.players[pId], // Keep existing data if undefined
                             id: pId,
                             position: {x,y,z}, 
                             yaw,
                             // HOST AUTHORITY: We Ignore Client's health and ammo claims!
                             // We only accept their Weapon Swap request
                             currentWeapon: wpn, 
                             lastSequence: seq,
                             // Preserve Host-side values
                             health: prev?.health ?? MAX_HEALTH,
                             ammoRocket: prev?.ammoRocket ?? 0,
                             color: prev?.color ?? getRandomColor() // Fallback
                         }
                     }
                 };
             });
           } 

           // --- 2. SHOOTING VALIDATION (HITSCAN) ---
           else if (op === OPS.HIT) {
              // Payload = targetId, Extra = damage
              // The Client SAYS they hit someone. The Host verifies.
              const targetId = payload as string;
              
              set(state => {
                  const shooter = state.players[pId];
                  const target = state.players[targetId];

                  if (!shooter || !target) return state;
                  if (shooter.health <= 0) return state; // Dead men tell no tales

                  // ANTI-CHEAT: RATE LIMIT
                  const now = Date.now();
                  const lastFired = playerCooldowns[pId] || 0;
                  if (now - lastFired < WEAPONS.PISTOL.cooldown) {
                      return state; // Ignored: Rapid fire hack
                  }
                  playerCooldowns[pId] = now;

                  // ANTI-CHEAT: ANGLE CHECK (Dot Product)
                  // Vector from Shooter to Target
                  const dx = target.position.x - shooter.position.x;
                  const dz = target.position.z - shooter.position.z;
                  const dist = Math.sqrt(dx*dx + dz*dz);
                  
                  if (dist > MAX_REACH) return state; // Ignored: Shooting across map

                  // Normalize direction to target
                  const dirX = dx / dist;
                  const dirZ = dz / dist;

                  // Calculate Shooter's Forward Vector based on Yaw
                  // (ThreeJS yaw is inverted/rotated slightly, depends on implementation, usually Math.sin(yaw))
                  // This is a simplified check. If dot product > 0.5 (approx 60 degree cone), we allow it.
                  // For perfect accuracy, we need strict math, but P2P lag makes strict math frustrating.
                  const shotX = -Math.sin(shooter.yaw);
                  const shotZ = -Math.cos(shooter.yaw);
                  
                  const dot = (dirX * shotX) + (dirZ * shotZ);

                  if (dot < 0.5) {
                      // Ignored: Player wasn't looking at target (Aimbot/Magic Bullet)
                      return state;
                  }

                  // Valid Hit -> Apply Damage
                  let newHealth = target.health - WEAPONS.PISTOL.damage;
                  
                  // Respawn Logic
                  if (newHealth <= 0) {
                     newHealth = MAX_HEALTH;
                     // Random respawn logic handled by Host
                     const randomPos = { x: (Math.random() * 20) - 10, y: 5, z: (Math.random() * 20) - 10 };
                     return {
                        players: { ...state.players, [targetId]: { ...target, health: newHealth, position: randomPos, ammoRocket: 0 } }
                     };
                  }

                  return {
                     players: { ...state.players, [targetId]: { ...target, health: newHealth } }
                  };
              });
           }

           // --- 3. PROJECTILE VALIDATION ---
           else if (op === OPS.ROCKET_SPAWN) {
              const [origin, velocity] = payload;
              
              set(state => {
                  const shooter = state.players[pId];
                  if (!shooter || shooter.ammoRocket <= 0) return state; // Ignored: No ammo

                  // Deduct Ammo (Host Authority)
                  const updatedShooter = { ...shooter, ammoRocket: shooter.ammoRocket - 1 };

                  // Add Projectile
                  return {
                      players: { ...state.players, [pId]: updatedShooter },
                      projectiles: [...state.projectiles, {
                          id: generateId(),
                          ownerId: pId,
                          position: origin,
                          velocity: velocity,
                          createdAt: Date.now()
                      }]
                  };
              });
              
              // Broadcast
              const msg: PeerMessage = [OPS.ROCKET_SPAWN, payload, pId]; 
              connections.forEach(c => { if(c !== conn && c.open) c.send(msg) });
           }

           // --- 4. ITEM PICKUP VALIDATION ---
           else if (op === OPS.ITEM_PICKUP) {
               const itemId = payload;
               set(state => {
                   const item = state.items[itemId];
                   const player = state.players[pId];
                   
                   if (!item || item.respawnTime || !player) return state;

                   // ANTI-CHEAT: DISTANCE CHECK
                   const d = getDist(player.position, item.position);
                   if (d > 3.0) return state; // Ignored: Teleport/Vacuum hack

                   // Apply Pickup (Host Authority)
                   let newAmmo = player.ammoRocket;
                   let newHealth = player.health;
                   
                   if (item.type === 'AMMO_ROCKET') newAmmo += 3;
                   if (item.type === 'HEALTH') newHealth = Math.min(100, newHealth + 25);

                   return {
                       players: { ...state.players, [pId]: { ...player, ammoRocket: newAmmo, health: newHealth } },
                       items: {
                           ...state.items,
                           [itemId]: { ...item, respawnTime: Date.now() + 10000 }
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
          if (err.type === 'peer-unavailable') return;
          set({ status: GameStatus.ERROR, error: "Host Error: " + err.type });
      });
    });
  },

  // CLIENT LOGIC (Trusted Locally, Verified Remotely)
  joinGame: async (targetHostId) => {
    set({ status: GameStatus.CONNECTING, error: null });
    if (peer) peer.destroy();
    
    peer = new Peer(generateId(), PEER_CONFIG);
    
    return new Promise<void>((resolve, reject) => {
       peer!.on('open', id => {
           set({ myId: id, isHost: false, hostId: targetHostId, items: INITIAL_ITEMS });
           
           const conn = peer!.connect(targetHostId, { reliable: true });
           connections = [conn];

           conn.on('open', () => {
               set({ status: GameStatus.PLAYING, players: { [id]: createInitialPlayer(id, get().myColor) }});
               
               if (broadcastInterval) clearInterval(broadcastInterval);
               broadcastInterval = setInterval(() => {
                   sequenceNumber++;
                   const me = get().players[id];
                   if (me && conn.open) {
                       const packed = packPlayer(me, sequenceNumber);
                       conn.send([OPS.UPDATE, packed]); 
                   }
               }, BROADCAST_RATE_MS);
               
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
                               // RECONCILIATION:
                               // If server says we have 50HP but we think we have 100HP, Server wins.
                               // If server says we have 0 ammo, Server wins.
                               if(nextPlayers[pid]) {
                                   nextPlayers[pid].health = hp; 
                                   nextPlayers[pid].ammoRocket = ammo;
                                   // Note: We do NOT overwrite position here to prevent jitter
                                   // unless distance is extreme (teleport/respawn)
                               }
                           } else {
                               nextPlayers[pid] = {
                                   id: pid, position:{x,y,z}, yaw, health:hp,
                                   currentWeapon: wpn, ammoRocket: ammo, 
                                   color: nextPlayers[pid]?.color || col
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

           conn.on('close', () => {
              set({ status: GameStatus.ERROR, error: "Disconnected from host" });
           });

           setTimeout(() => {
                if (!conn.open) {
                    set({ status: GameStatus.ERROR, error: "Connection timeout." });
                    reject();
                }
           }, 8000);
       });

       peer!.on('error', (err) => {
           set({ error: "Connection Error", status: GameStatus.ERROR });
           reject(err);
       });
    });
  },

  // Actions (Client Logic)
  fireWeapon: (origin, direction) => {
      const { players, myId, isHost } = get();
      const me = players[myId];
      if (!me) return;

      if (me.currentWeapon === WEAPONS.ROCKET.id) {
          // Optimistic local update
          if (me.ammoRocket > 0) {
             // ... logic ...
              const velocity = { x: direction.x * 0.5, y: direction.y * 0.5, z: direction.z * 0.5 };
              set(s => ({
                  projectiles: [...s.projectiles, {
                      id: generateId(), ownerId: myId, position: origin, velocity, createdAt: Date.now()
                  }]
              }));
              const msg: PeerMessage = [OPS.ROCKET_SPAWN, [origin, velocity], myId];
              connections.forEach(c => c.open && c.send(msg));
          }
      } 
  },

  sendHit: (targetId, damage) => {
      const { isHost } = get();
      if (isHost) {
          // Host logic calls "HIT" internally via same validation logic if needed
          // But usually we just update state directly for Host to avoid network overhead
          // ... (simplified)
      } else {
          const msg: PeerMessage = [OPS.HIT, targetId, damage];
          connections.forEach(c => c.open && c.send(msg));
      }
  },

  tryPickup: (itemId) => {
      // Optimistic check
      const { items, myId, players } = get();
      const item = items[itemId];
      if (item && !item.respawnTime) {
          const msg: PeerMessage = [OPS.ITEM_PICKUP, itemId];
          connections.forEach(c => c.open && c.send(msg));
      }
  },

  // ... rest of actions
  switchWeapon: () => {
      set(s => {
          const me = s.players[s.myId];
          if(!me) return s;
          const next = me.currentWeapon === 0 ? 1 : 0;
          return { players: { ...s.players, [s.myId]: { ...me, currentWeapon: next } } };
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
  
  updateProjectiles: (newProjs) => set({ projectiles: newProjs }),
  updateItems: (newItems) => set({ items: newItems }),

  disconnect: () => {
    if (peer) peer.destroy();
    if (broadcastInterval) clearInterval(broadcastInterval);
    connections = [];
    set({ status: GameStatus.LOBBY, players: {}, hostId: null, projectiles: [] });
  }
}));