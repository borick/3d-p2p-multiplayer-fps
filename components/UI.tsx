import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { GameStatus, PlayerState } from '../types';
import { Copy, Users, Play, Radio, AlertCircle, Crosshair, Share2 } from 'lucide-react';

export const UI = () => {
  const { status, hostGame, joinGame, myId, error, disconnect, players } = useGameStore();
  const [targetId, setTargetId] = useState('');
  const [copySuccess, setCopySuccess] = useState('');

  const handleHost = () => hostGame();
  
  const handleJoin = () => {
    if (!targetId.trim()) return;
    joinGame(targetId.trim());
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(myId);
    setCopySuccess('Copied!');
    setTimeout(() => setCopySuccess(''), 2000);
  };

  if (status === GameStatus.PLAYING) {
    const myPlayer = players[myId];
    return (
      <div className="absolute inset-0 pointer-events-none">
        {/* CROSSHAIR - Must be pointer-events-none to allow clicking through to canvas for PointerLock */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_4px_black]"></div>
        </div>

        {/* HUD Top Left */}
        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md p-4 rounded-xl text-white border border-white/10 pointer-events-auto">
          <div className="flex items-center gap-2 mb-2">
            <Radio className="w-4 h-4 text-green-400 animate-pulse" />
            <span className="font-bold text-sm tracking-wider">LIVE SESSION</span>
          </div>
          <div className="text-xs text-gray-400 mb-1">ROOM ID (Share this to invite)</div>
          <div className="flex items-center gap-2 bg-white/10 p-2 rounded-lg cursor-pointer hover:bg-white/20 transition" onClick={copyToClipboard}>
            <span className="font-mono text-sm">{myId}</span>
            <Copy className="w-3 h-3 text-gray-400" />
          </div>
          {copySuccess && <div className="text-xs text-green-400 mt-1">{copySuccess}</div>}
          
          <div className="mt-4 border-t border-white/10 pt-2">
             <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
               <Users className="w-3 h-3" />
               <span>PLAYERS ({Object.keys(players).length})</span>
             </div>
             <ul className="space-y-1">
               {Object.values(players).map((p: PlayerState) => (
                 <li key={p.id} className="text-xs flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: p.color }}></span>
                    <span className={p.id === myId ? "text-yellow-400 font-bold" : "text-gray-300"}>
                      {p.id === myId ? "YOU" : p.id.substring(0, 6)}
                    </span>
                    {p.health < 100 && <span className="text-[10px] text-red-400">({p.health}HP)</span>}
                 </li>
               ))}
             </ul>
          </div>
        </div>

        {/* HUD Bottom Left: HEALTH */}
        <div className="absolute bottom-4 left-4">
             <div className="bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10">
                <div className="text-3xl font-black italic text-white mb-1">
                    {myPlayer?.health ?? 0}<span className="text-sm font-normal text-gray-400 ml-1">HP</span>
                </div>
                <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-gradient-to-r from-red-500 to-green-500 transition-all duration-300" 
                        style={{ width: `${myPlayer?.health ?? 0}%` }}
                    ></div>
                </div>
             </div>
        </div>

        {/* HUD Bottom Right */}
        <div className="absolute bottom-4 right-4 pointer-events-auto">
          <button 
            onClick={disconnect}
            className="bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/50 px-6 py-2 rounded-lg font-bold backdrop-blur-sm transition text-sm"
          >
            DISCONNECT
          </button>
        </div>
        
        {/* Controls Hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 text-xs font-mono text-center">
          <div className="mb-1 text-yellow-400 font-bold animate-pulse">CLICK ANYWHERE TO START</div>
          <div className="mb-1">WASD Move • SPACE Jump • CLICK Shoot</div>
          <div>ESC to release mouse</div>
        </div>
      </div>
    );
  }

  // LOBBY STATE
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#050505] text-white pointer-events-auto">
      {/* Background Grids */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      
      <div className="relative z-10 w-full max-w-md p-8 bg-[#111] border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-2">
            P2P FPS
          </h1>
          <p className="text-gray-400 text-sm">Serverless First Person Shooter</p>
        </div>

        {status === GameStatus.CONNECTING && (
           <div className="flex flex-col items-center justify-center py-8 space-y-4">
             <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
             <p className="text-blue-400 font-medium animate-pulse">Establishing Connection...</p>
           </div>
        )}

        {status === GameStatus.ERROR && (
           <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl mb-6 flex items-start gap-3">
             <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
             <div className="text-sm text-red-200">{error}</div>
             <button onClick={() => useGameStore.setState({ status: GameStatus.LOBBY })} className="text-xs underline text-red-400 ml-auto">Reset</button>
           </div>
        )}

        {status === GameStatus.LOBBY && (
          <div className="space-y-6">
            {/* Host Section */}
            <div className="group relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-1 transition hover:scale-[1.02] cursor-pointer" onClick={handleHost}>
              <div className="bg-[#1a1a1a] rounded-[10px] p-6 h-full flex items-center justify-between group-hover:bg-opacity-90 transition">
                <div>
                   <h3 className="font-bold text-lg text-white">Host Match</h3>
                   <p className="text-xs text-gray-400">Generate a Room ID to share</p>
                </div>
                <Play className="w-6 h-6 text-blue-400 group-hover:text-white transition" />
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#111] px-2 text-gray-500">Or Join Friend</span>
              </div>
            </div>

            {/* Join Section */}
            <div className="space-y-3">
              <div className="relative">
                <input 
                    type="text" 
                    placeholder="Enter Room ID" 
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition font-mono text-sm"
                />
                <Share2 className="absolute right-3 top-3.5 w-4 h-4 text-gray-500" />
              </div>
              <button 
                onClick={handleJoin}
                disabled={!targetId}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2"
              >
                <span>Join Game</span>
                <Users className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-center text-[10px] text-gray-600">
               To play multiplayer: Host a game, copy the ID, send it to a friend, and have them Join using that ID.
            </p>
          </div>
        )}
      </div>
      
      <div className="absolute bottom-4 text-xs text-gray-600 font-mono">
        Pointer Lock Required • WebRTC P2P
      </div>
    </div>
  );
};
