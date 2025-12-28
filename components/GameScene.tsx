import React from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import { WorldEnvironment, Ground } from './World';
import { LocalPlayer } from './Player';
import { Opponent } from './Opponent';
import { useGameStore } from '../store/gameStore';
import { PlayerState } from '../types';
import { useBox } from '@react-three/cannon';

// Import New Systems
import { ProjectileSystem } from './Projectiles';
import { ItemSystem } from './Items';
import { GameManager } from './GameManager';

// Physics Obstacle Component (unchanged)
const PhysicsObstacle = ({ position, args, color }: any) => {
    const [ref] = useBox(() => ({ mass: 0, position, args, type: 'Static' }));
    return (
        <mesh ref={ref as any} castShadow receiveShadow>
            <boxGeometry args={args} />
            <meshStandardMaterial color={color} visible={false} />
        </mesh>
    );
};

export const GameScene = () => {
  const { players, myId } = useGameStore();

  return (
    <Canvas shadows camera={{ fov: 75 }}>
      {/* Lights and Sky */}
      <WorldEnvironment />

      {/* --- CORE GAME LOGIC --- */}
      {/* This component runs the Physics Loop (Host Only) */}
      <GameManager />

      {/* --- PHYSICS WORLD --- */}
      <Physics gravity={[0, -15, 0]}>
        <Ground />
        
        {/* Map Obstacles */}
        <PhysicsObstacle position={[5, 1.5, 5]} args={[3, 3, 3]} />
        <PhysicsObstacle position={[-5, 2, -5]} args={[2, 4, 10]} />
        <PhysicsObstacle position={[15, 1, -8]} args={[3, 2, 3]} />
        <PhysicsObstacle position={[-12, 1.5, 8]} args={[2, 3, 2]} />
        <PhysicsObstacle position={[0, 2.5, -15]} args={[20, 5, 1]} />
        <PhysicsObstacle position={[-15, 2.5, 0]} args={[1, 5, 20]} />

        {/* Myself */}
        <LocalPlayer />

        {/* Other Players */}
        {Object.values(players).map((p: PlayerState) => {
          if (p.id === myId) return null;
          return <Opponent key={p.id} player={p} />;
        })}
      </Physics>

      {/* --- VISUAL SYSTEMS (Non-Physics) --- */}
      {/* These render objects that move via custom logic, not Cannon.js physics */}
      <ProjectileSystem />
      <ItemSystem />

    </Canvas>
  );
};