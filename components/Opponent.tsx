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
  
  // Optimization: Pre-allocate Vector3 to avoid Garbage Collection stutter in the loop
  const targetPos = useMemo(() => new Vector3(), []);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
        // 1. Update Target Vector from Props
        targetPos.set(player.position.x, player.position.y, player.position.z);
        
        // 2. Frame-Rate Independent Damping
        // Formula: 1 - damping ^ delta
        // This ensures the movement looks the same at 30FPS and 144FPS
        const smoothFactor = 1 - Math.pow(0.001, delta); 

        // Smoothly move mesh towards the target network position
        meshRef.current.position.lerp(targetPos, smoothFactor);
        
        // 3. Rotation Interpolation (Yaw)
        // Handle wrapping (so they don't spin 360 deg when going from 3.14 to -3.14)
        let currentRot = meshRef.current.rotation.y;
        let targetRot = player.yaw;
        
        let rotDiff = targetRot - currentRot;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        
        meshRef.current.rotation.y += rotDiff * smoothFactor;
    }

    // 4. Health Bar Update
    if (healthBarRef.current) {
        // Lerp scale for a nice visual health drop effect
        const currentScale = healthBarRef.current.scale.x;
        const targetScale = Math.max(0, player.health / MAX_HEALTH);
        healthBarRef.current.scale.x += (targetScale - currentScale) * (delta * 10);
    }
  });

  return (
    <group 
      ref={meshRef} 
      // Initialize position immediately to prevent flying in from (0,0,0) on spawn
      position={[player.position.x, player.position.y, player.position.z]} 
      userData={{ id: player.id }}
    >
        {/* Character Body */}
        <mesh castShadow>
          <capsuleGeometry args={[PLAYER_RADIUS * 0.8, 1.5, 4, 8]} />
          <meshStandardMaterial color={player.color} />
        </mesh>

        {/* Eyes / Visor (Visual indication of direction) */}
        <mesh position={[0, 0.5, -0.6]} castShadow>
            <boxGeometry args={[0.6, 0.3, 0.4]} />
            <meshStandardMaterial color="#333" />
        </mesh>
        
        {/* Weapon (Visual only) */}
        <mesh position={[0.5, 0, -0.8]}>
            <boxGeometry args={[0.2, 0.2, 0.8]} />
            <meshStandardMaterial color="#666" />
        </mesh>

        {/* Floating UI Elements */}
        <Billboard position={[0, 1.8, 0]}>
            {/* Health Bar Background */}
            <mesh position={[0, 0, 0]}>
                <planeGeometry args={[1.5, 0.15]} />
                <meshBasicMaterial color="black" />
            </mesh>
            {/* Dynamic Health Bar */}
            <mesh ref={healthBarRef} position={[-0.75, 0, 0.01]} geometry-translate={[0.75, 0, 0]}>
                 <planeGeometry args={[1.5, 0.12]} />
                 <meshBasicMaterial color={player.health > 50 ? "#22c55e" : "#ef4444"} />
            </mesh>
        </Billboard>

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