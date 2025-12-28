import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { PlayerState } from '../types';
import { PLAYER_RADIUS, MAX_HEALTH } from '../constants';
import { Vector3 } from 'three';
import { Text, Billboard } from '@react-three/drei';

interface OpponentProps {
  player: PlayerState;
}

export const Opponent: React.FC<OpponentProps> = ({ player }) => {
  const meshRef = useRef<any>(null);
  const healthBarRef = useRef<any>(null);
  
  // Optimization: Recycle Vector3 to avoid Garbage Collection lag
  const targetPos = useMemo(() => new Vector3(), []);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
        // 1. Update Target
        targetPos.set(player.position.x, player.position.y, player.position.z);
        
        // 2. Smooth Movement (Time-independent Lerp)
        // This ensures enemies move smoothly regardless of your FPS
        const smoothFactor = 1 - Math.pow(0.001, delta); 

        meshRef.current.position.lerp(targetPos, smoothFactor);
        
        // 3. Smooth Rotation
        let currentRot = meshRef.current.rotation.y;
        let targetRot = player.yaw;
        
        // Fix rotation wrapping (so they don't spin 360 unnecessarily)
        let rotDiff = targetRot - currentRot;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        
        meshRef.current.rotation.y += rotDiff * smoothFactor;
    }

    // 4. Animate Health Bar
    if (healthBarRef.current) {
        const currentScale = healthBarRef.current.scale.x;
        const targetScale = Math.max(0, player.health / MAX_HEALTH);
        // Smoothly shrink health bar
        healthBarRef.current.scale.x += (targetScale - currentScale) * (delta * 10);
    }
  });

  return (
    <group 
      ref={meshRef} 
      position={[player.position.x, player.position.y, player.position.z]} 
      userData={{ id: player.id }}
    >
        {/* PLAYER BODY */}
        <mesh castShadow>
          <capsuleGeometry args={[PLAYER_RADIUS * 0.8, 1.5, 4, 8]} />
          <meshStandardMaterial color={player.color} />
        </mesh>

        {/* VISOR (Eyes) */}
        <mesh position={[0, 0.5, -0.6]} castShadow>
            <boxGeometry args={[0.6, 0.3, 0.4]} />
            <meshStandardMaterial color="#333" />
        </mesh>
        
        {/* WEAPON VISUALIZATION */}
        {player.currentWeapon === 1 ? (
            // --- ROCKET LAUNCHER (Gray Cylinder) ---
            <group position={[0.6, 0.2, -0.5]}>
                <mesh rotation={[Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[0.12, 0.12, 1.2]} />
                    <meshStandardMaterial color="#555" />
                </mesh>
                <mesh position={[0, 0, -0.6]}>
                    <boxGeometry args={[0.1, 0.3, 0.1]} />
                    <meshStandardMaterial color="#222" />
                </mesh>
            </group>
        ) : (
            // --- PISTOL (Small Black Box) ---
            <mesh position={[0.5, 0, -0.8]}>
                <boxGeometry args={[0.2, 0.2, 0.6]} />
                <meshStandardMaterial color="#111" />
            </mesh>
        )}

        {/* FLOATING UI */}
        <Billboard position={[0, 1.8, 0]}>
            {/* Health Bar BG */}
            <mesh position={[0, 0, 0]}>
                <planeGeometry args={[1.5, 0.15]} />
                <meshBasicMaterial color="black" />
            </mesh>
            {/* Health Bar FG */}
            <mesh ref={healthBarRef} position={[-0.75, 0, 0.01]} geometry-translate={[0.75, 0, 0]}>
                 <planeGeometry args={[1.5, 0.12]} />
                 <meshBasicMaterial color={player.health > 50 ? "#22c55e" : "#ef4444"} />
            </mesh>
        </Billboard>

        {/* NAME TAG (ID) */}
        <Text
            position={[0, 2.2, 0]}
            fontSize={0.3}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
        >
            {player.id.substring(0, 4)}
        </Text>
    </group>
  );
};