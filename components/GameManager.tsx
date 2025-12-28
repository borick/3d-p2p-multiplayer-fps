import React from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import { WEAPONS } from '../constants';

// Helper for vector math (manual to avoid garbage collection overhead)
const add = (v1: any, v2: any) => ({ x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z });
const dist = (v1: any, v2: any) => Math.sqrt((v1.x-v2.x)**2 + (v1.y-v2.y)**2 + (v1.z-v2.z)**2);

export const GameManager = () => {
  const { 
    isHost, 
    projectiles, 
    items, 
    players, 
    updateProjectiles, 
    updateItems,
    sendHit 
  } = useGameStore();

  useFrame((state, delta) => {
    // CRITICAL: Only the HOST runs the world physics.
    // Clients just receive the results via network updates.
    if (!isHost) return;

    const now = Date.now();
    let projectilesChanged = false;
    
    // --- 1. PROJECTILE PHYSICS ---
    if (projectiles.length > 0) {
        const hitProjectiles: string[] = [];
        
        const nextProjectiles = projectiles
            .map(p => {
                // Move rocket: current_pos + velocity
                // (Velocity includes speed factor calculated at spawn)
                return {
                    ...p,
                    position: add(p.position, p.velocity)
                };
            })
            .filter(p => now - p.createdAt < 3000); // Despawn after 3 seconds if no hit

        // Collision Detection
        nextProjectiles.forEach(p => {
            let hasHit = false;

            // A. Ground Collision
            if (p.position.y <= 0) {
                hasHit = true;
                // Splash Damage Logic
                Object.values(players).forEach(player => {
                    const d = dist(p.position, player.position);
                    if (d < WEAPONS.ROCKET.radius) {
                        // Linear damage falloff: Closer = More Damage
                        const dmg = Math.floor(WEAPONS.ROCKET.damage * (1 - d/WEAPONS.ROCKET.radius));
                        if (dmg > 0) sendHit(player.id, dmg);
                    }
                });
            }

            // B. Direct Player Collision
            if (!hasHit) {
                Object.values(players).forEach(player => {
                    if (player.id === p.ownerId) return; // Don't hit yourself immediately
                    
                    const d = dist(p.position, player.position);
                    // Hitbox size approx 1.0
                    if (d < 1.0) { 
                        hasHit = true;
                        // Direct Hit Damage
                        sendHit(player.id, WEAPONS.ROCKET.damage);
                    }
                });
            }

            if (hasHit) {
                hitProjectiles.push(p.id);
            }
        });

        // Update Store if projectiles moved or were destroyed
        // We filter out the ones that hit something or timed out
        const survivingProjectiles = nextProjectiles.filter(p => !hitProjectiles.includes(p.id));
        
        // Optimization: Only trigger React update if count changed or positions changed
        // (For simplicity here we update every frame projectiles exist)
        if (projectiles.length > 0 || survivingProjectiles.length > 0) {
            updateProjectiles(survivingProjectiles);
        }
    }

    // --- 2. ITEM RESPAWNS ---
    let itemsChanged = false;
    const nextItems = { ...items };
    
    Object.keys(nextItems).forEach(key => {
        const item = nextItems[key];
        // If item is hidden (has respawnTime) and time has passed...
        if (item.respawnTime && now > item.respawnTime) {
            // ... Respawn it (set respawnTime to undefined)
            nextItems[key] = { ...item, respawnTime: undefined };
            itemsChanged = true;
        }
    });

    if (itemsChanged) {
        updateItems(nextItems);
    }
  });

  // This component renders nothing visible
  return null;
};