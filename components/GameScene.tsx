import React, { memo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import { WorldEnvironment, Ground } from './World';
import { LocalPlayer } from './Player';
import { Opponent } from './Opponent';
import { useGameStore } from '../store/gameStore';
import { PlayerState } from '../types';
import { useBox } from '@react-three/cannon';

// Memoized Obstacle to prevent re-hooking physics on re-renders
const PhysicsObstacle = memo(({ position, args, color }: any) => {
    const [ref] = useBox(() => ({ mass: 0, position, args, type: 'Static' }));
    return (
        <mesh ref={ref as any} castShadow receiveShadow>
            <boxGeometry args={args} />
            <meshStandardMaterial color={color} visible={false} />
        </mesh>
    );
});

// Component to handle high-frequency opponent updates separately
const OpponentsRenderer = () => {
    const players = useGameStore(state => state.players);
    const myId = useGameStore(state => state.myId);

    return (
        <>
            {Object.values(players).map((p: PlayerState) => {
                if (p.id === myId) return null;
                return <Opponent key={p.id} player={p} />;
            })}
        </>
    );
};

export const GameScene = () => {
  return (
    <Canvas shadows camera={{ fov: 75 }}>
      <WorldEnvironment />
      <Physics gravity={[0, -15, 0]}>
        <Ground />
        
        {/* Static obstacles */}
        <PhysicsObstacle position={[5, 1.5, 5]} args={[3, 3, 3]} />
        <PhysicsObstacle position={[-5, 2, -5]} args={[2, 4, 10]} />
        <PhysicsObstacle position={[15, 1, -8]} args={[3, 2, 3]} />
        <PhysicsObstacle position={[-12, 1.5, 8]} args={[2, 3, 2]} />
        
        <PhysicsObstacle position={[0, 2.5, -15]} args={[20, 5, 1]} />
        <PhysicsObstacle position={[-15, 2.5, 0]} args={[1, 5, 20]} />
        
        <LocalPlayer />
        <OpponentsRenderer />
      </Physics>
    </Canvas>
  );
};