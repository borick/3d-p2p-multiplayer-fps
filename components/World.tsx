import React from 'react';
import { usePlane } from '@react-three/cannon';
import { Grid, Stars, Environment } from '@react-three/drei';

export const Ground = () => {
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
        <meshStandardMaterial color="#111111" transparent opacity={0.8} />
      </mesh>
      <Grid 
        args={[100, 100]} 
        cellColor="#444444" 
        sectionColor="#888888" 
        fadeDistance={50}
        sectionThickness={1.5}
        cellThickness={0.8}
        position={[0, 0.01, 0]}
      />
    </group>
  );
};

export const WorldEnvironment = () => {
  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} castShadow />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <Environment preset="night" />
      
      {/* Obstacles for FPS Cover - Visual Only (Physics handled in GameScene via useBox) */}
      <Obstacle position={[5, 1.5, 5]} args={[3, 3, 3]} color="#ff0055" />
      <Obstacle position={[-5, 2, -5]} args={[2, 4, 10]} color="#00ccff" />
      <Obstacle position={[15, 1, -8]} args={[3, 2, 3]} color="#ffaa00" />
      <Obstacle position={[-12, 1.5, 8]} args={[2, 3, 2]} color="#aa00ff" />
      
      {/* Tall Wall */}
      <Obstacle position={[0, 2.5, -15]} args={[20, 5, 1]} color="#333" />
      <Obstacle position={[-15, 2.5, 0]} args={[1, 5, 20]} color="#333" />
    </>
  );
};

const Obstacle = ({ position, args, color }: { position: [number, number, number], args: [number, number, number], color: string }) => {
  // REMOVED usePlane hook here because this component is rendered outside of Physics context in GameScene.
  // The physics body is created separately in GameScene.tsx using PhysicsObstacle.
  return (
    <mesh position={position} castShadow receiveShadow>
       <boxGeometry args={args as any} />
       <meshStandardMaterial color={color} roughness={0.2} metalness={0.8} />
    </mesh>
  );
};
