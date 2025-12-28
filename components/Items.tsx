import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import { Text } from '@react-three/drei';

const Item = ({ data }: { data: any }) => {
    const { tryPickup } = useGameStore();
    const ref = useRef<any>();

    useFrame((state) => {
        if (!ref.current) return;
        
        // 1. Animation: Float up and down (Sine wave)
        const time = state.clock.elapsedTime;
        ref.current.position.y = data.position.y + Math.sin(time * 2) * 0.2;
        
        // 2. Animation: Rotate slowly
        ref.current.rotation.y += 0.02;
        
        // 3. Pickup Logic: Check every frame if we are close enough
        // This is efficient because tryPickup has internal checks to prevent spamming
        tryPickup(data.id);
    });

    // If the item has a respawn timer, it is currently "dead/hidden", so don't render it
    if (data.respawnTime && Date.now() < data.respawnTime) return null;

    // Visual settings based on type
    const isHealth = data.type === 'HEALTH';
    const color = isHealth ? '#22c55e' : '#f97316'; // Green for Health, Orange for Ammo
    const label = isHealth ? '+' : 'RPG';
    const subLabel = isHealth ? 'HP' : 'AMMO';

    return (
        <group ref={ref} position={[data.position.x, data.position.y, data.position.z]}>
            {/* The Box */}
            <mesh castShadow receiveShadow>
                <boxGeometry args={[0.6, 0.6, 0.6]} />
                <meshStandardMaterial 
                    color={color} 
                    emissive={color} 
                    emissiveIntensity={0.4} 
                    roughness={0.3}
                    metalness={0.5}
                />
            </mesh>

            {/* Glowing Inner Core effect */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[0.4, 0.4, 0.4]} />
                <meshBasicMaterial color="white" transparent opacity={0.5} />
            </mesh>

            {/* Floating Text Label */}
            <group position={[0, 0.8, 0]}>
                <Text 
                    fontSize={0.4} 
                    color="white" 
                    anchorX="center" 
                    anchorY="bottom"
                    outlineWidth={0.02}
                    outlineColor="black"
                >
                    {label}
                </Text>
                <Text 
                    position={[0, -0.25, 0]}
                    fontSize={0.15} 
                    color="#ddd" 
                    anchorX="center" 
                    anchorY="top"
                >
                    {subLabel}
                </Text>
            </group>
            
            {/* Ground Shadow (Fake) */}
            <mesh position={[0, -data.position.y + 0.02, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <circleGeometry args={[0.4, 16]} />
                <meshBasicMaterial color="black" transparent opacity={0.3} />
            </mesh>
        </group>
    );
};

export const ItemSystem = () => {
    const { items } = useGameStore();
    return (
        <>
            {Object.values(items).map(item => <Item key={item.id} data={item} />)}
        </>
    );
};