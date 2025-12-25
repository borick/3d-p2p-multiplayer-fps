import React from 'react';
import { GameScene } from './components/GameScene';
import { UI } from './components/UI';
import { useGameStore } from './store/gameStore';
import { GameStatus } from './types';

function App() {
  const { status } = useGameStore();

  return (
    <div className="w-full h-full relative bg-[#050505]">
      {status === GameStatus.PLAYING && (
        <div className="absolute inset-0 z-0">
          <GameScene />
        </div>
      )}
      <div className="absolute inset-0 z-10 pointer-events-none">
         <UI />
      </div>
    </div>
  );
}

export default App;
