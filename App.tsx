import React from 'react';
import { GameScene } from './components/GameScene';
import { UI } from './components/UI';
import { useGameStore } from './store/gameStore';
import { GameStatus } from './types';

function App() {
  const { status } = useGameStore();

  return (
    <div className="w-full h-full relative bg-[#0a0a0a] overflow-hidden">
      {/* 
        3D GAME LAYER 
        Only render the heavy 3D scene if we are actually Playing.
        This saves battery/CPU when just sitting in the menu.
      */}
      {status === GameStatus.PLAYING && (
        <div className="absolute inset-0 z-0">
          <GameScene />
        </div>
      )}

      {/* 
        UI LAYER 
        Overlays everything. Handles Menu, HUD, and Error messages.
        pointer-events-none is handled inside UI.tsx for specific elements.
      */}
      <div className="absolute inset-0 z-10">
         <UI />
      </div>
    </div>
  );
}

export default App;