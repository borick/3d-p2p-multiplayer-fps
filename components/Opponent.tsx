import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PlayerState } from '../types';
import { PLAYER_RADIUS, MAX_HEALTH } from '../constants';
import { Vector3, Quaternion, Euler } from 'three';
import { Text, Billboard } from '@react-three/drei';

interface OpponentProps {
  player: PlayerState;
}

export const Opponent: React.FC<OpponentProps> = ({ player }) => {
  const meshRef = useRef<any>(null);
  const healthBarRef = useRef<any>(null);
  
  useFrame(() => {
    if (meshRef.current) {
        // Position Interp
        const currentPos = meshRef.current.position;
        const targetPos = new Vector3(player.position.x, player.position.y, player.position.z);
        currentPos.lerp(targetPos, 0.3);

        // Rotation Interp (Yaw)
        const currentRot = meshRef.current.rotation;
        // Simple lerp for Y rotation to avoid snapping
        // Note: Euler lerping can be tricky with wrap-around, simplified here
        meshRef.current.rotation.y = player.yaw;
    }
    
    // Animate Health bar width
    if (healthBarRef.current) {
        healthBarRef.current.scale.x = Math.max(0, player.health / MAX_HEALTH);
    }
  });

  return (
    <group ref={meshRef} position={[player.position.x, player.position.y, player.position.z]} userData={{ id: player.id }}>
        {/* Body */}
        <mesh castShadow>
          <capsuleGeometry args={[PLAYER_RADIUS * 0.8, 1.5, 4, 8]} />
          <meshStandardMaterial color={player.color} />
        </mesh>
        
        {/* "Head" / Visor to show facing direction */}
        <mesh position={[0, 0.5, -0.6]} castShadow>
            <boxGeometry args={[0.6, 0.3, 0.4]} />
            <meshStandardMaterial color="#222" />
        </mesh>

        {/* Gun placeholder */}
        <mesh position={[0.5, 0, -0.8]}>
            <boxGeometry args={[0.2, 0.2, 0.8]} />
            <meshStandardMaterial color="#444" />
        </mesh>

        {/* Health Bar (Billboarded) */}
        <Billboard position={[0, 1.8, 0]}>
            {/* Background */}
            <mesh position={[0, 0, 0]}>
                <planeGeometry args={[1.5, 0.15]} />
                <meshBasicMaterial color="black" />
            </mesh>
            {/* Health */}
            <mesh ref={healthBarRef} position={[-0.75, 0, 0.01]} geometry-translate={[0.75, 0, 0]}>
                 <planeGeometry args={[1.5, 0.12]} />
                 <meshBasicMaterial color={player.health > 50 ? "#00ff00" : "red"} />
            </mesh>
        </Billboard>

        {/* Name Tag */}
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
