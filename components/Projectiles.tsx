import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import { Vector3 } from 'three';

const Rocket = ({ data }: { data: any }) => {
    const ref = useRef<any>();
    
    // We use a ref for the lookAt target to avoid creating new Vectors every frame
    const lookTarget = useRef(new Vector3());

    useFrame(() => {
        if(ref.current) {
            // Update position from the store data
            ref.current.position.set(data.position.x, data.position.y, data.position.z);
            
            // Calculate where the rocket is going so it points the right way
            lookTarget.current.set(
                data.position.x + data.velocity.x, 
                data.position.y + data.velocity.y, 
                data.position.z + data.velocity.z
            );
            
            ref.current.lookAt(lookTarget.current);
        }
    });

    return (
        <group ref={ref}>
            {/* Main Body */}
            <mesh rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
                <meshStandardMaterial color="#444" />
            </mesh>
            
            {/* Warhead (Red Tip) */}
            <mesh position={[0, 0, 0.25]}>
                <sphereGeometry args={[0.08, 8, 8]} />
                <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
            </mesh>
            
            {/* Fins */}
            <mesh position={[0, 0, -0.2]}>
                <boxGeometry args={[0.2, 0.02, 0.1]} />
                <meshStandardMaterial color="#333" />
            </mesh>
            <mesh position={[0, 0, -0.2]} rotation={[0, 0, Math.PI/2]}>
                <boxGeometry args={[0.2, 0.02, 0.1]} />
                <meshStandardMaterial color="#333" />
            </mesh>
        </group>
    );
};

export const ProjectileSystem = () => {
    const { projectiles } = useGameStore();
    return (
        <>
            {projectiles.map(p => <Rocket key={p.id} data={p} />)}
        </>
    );
};