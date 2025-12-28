import React from 'react';
import { usePlane } from '@react-three/cannon';
import { Grid, Stars, Environment } from '@react-three/drei';

// The Floor
export const Ground = () => {
  // Static physics plane at y=0
  const [ref] = usePlane(() => ({ 
    rotation: [-Math.PI / 2, 0, 0], 
    position: [0, 0, 0],
    type: 'Static',
    material: { friction: 0.1 }
  }));

  return (
    <group>
      <mesh ref={ref as any} receiveShadow>
        <planeGeometry args={[100, 100]} />
        {/* Dark floor material so visuals pop */}
        <meshStandardMaterial color="#111" roughness={0.8} />
      </mesh>
      
      {/* Tron-like Grid */}
      <Grid 
        args={[100, 100]} 
        cellColor="#222" 
        sectionColor="#444" 
        fadeDistance={50}
        sectionThickness={1.5}
        cellThickness={0.8}
        position={[0, 0.01, 0]}
      />
    </group>
  );
};

// Lighting and Sky
export const WorldEnvironment = () => {
  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} castShadow />
      
      {/* Background Stars */}
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      {/* Reflection Map */}
      <Environment preset="night" />
    </>
  );
};