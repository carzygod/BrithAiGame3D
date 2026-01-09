import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { GameEngine } from './game';
import { InputManager } from './utils';
import { GameStatus, Settings, Language, KeyMap, Stats, Vector2 } from './types';
import { CONSTANTS, TRANSLATIONS, DEFAULT_KEYMAP } from './constants';
import { CHARACTERS } from './config/characters';
import { AssetLoader } from './assets';
import { GameScene } from './Renderer3D';
import * as THREE from 'three';

// --- UI Components ---
const PixelHeart: React.FC<{ full: boolean }> = ({ full }) => (
    <svg viewBox="0 0 16 16" className="w-6 h-6 mr-1 drop-shadow-md" style={{imageRendering: 'pixelated'}}>
       <path d="M2 5 h2 v3 h-2 v-3 M4 3 h2 v2 h-2 v-2 M6 3 h4 v2 h-4 v-2 M10 3 h2 v2 h-2 v-2 M12 5 h2 v3 h-2 v-3 M2 8 h2 v3 h-2 v-3 M12 8 h2 v3 h-2 v-3 M4 11 h2 v2 h-2 v-2 M10 11 h2 v2 h-2 v-2 M6 13 h4 v2 h-4 v-2" 
             fill={full ? "#ef4444" : "#4b5563"} /> 
       <path d="M4 4 h2 v1 h-2 v-1 M10 4 h1 v1 h-1 v-1" fill={full ? "#fca5a5" : "#6b7280"} opacity="0.6"/>
    </svg>
);

const StatBar: React.FC<{ label: string, value: number, max: number, color: string }> = ({ label, value, max, color }) => (
    <div className="flex items-center gap-2 w-full text-xs">
        <span className="w-10 text-gray-400 font-bold">{label}</span>
        <div className="flex-1 h-2 bg-gray-800 rounded overflow-hidden">
            <div 
                className="h-full transition-all duration-300"
                style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }}
            />
        </div>
        <span className="w-6 text-right text-gray-300">{value}</span>
    </div>
);

const PauseIcon = () => (
    <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current text-white">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
);

const PlayIcon = () => (
    <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current text-white">
        <path d="M8 5v14l11-7z" />
    </svg>
);

const SpritePreview: React.FC<{ spriteName: string, assetLoader: AssetLoader }> = ({ spriteName, assetLoader }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        const source = assetLoader.get(spriteName);
        if (canvas && source) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = false;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, canvas.width, canvas.height);
            }
        }
    }, [spriteName, assetLoader]);
    return <canvas ref={canvasRef} width={128} height={128} className="w-24 h-24" style={{imageRendering: 'pixelated'}} />;
};

interface JoystickProps {
  onMove: (vec: Vector2) => void;
  color?: string;
  label?: string;
}

const VirtualJoystick: React.FC<JoystickProps> = ({ onMove, color = 'white', label }) => {
    const radius = 60; 
    const stickRadius = 25;
    const [active, setActive] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const ref = useRef<HTMLDivElement>(null);

    const handleTouchStart = (e: React.TouchEvent) => setActive(true);
    const handleTouchMove = (e: React.TouchEvent) => {
        if (!ref.current) return;
        const touch = e.targetTouches[0]; 
        const rect = ref.current.getBoundingClientRect();
        const dx = touch.clientX - (rect.left + rect.width / 2);
        const dy = touch.clientY - (rect.top + rect.height / 2);
        const dist = Math.sqrt(dx*dx + dy*dy);
        const maxDist = radius - stickRadius;
        const angle = Math.atan2(dy, dx);
        const cappedDist = Math.min(dist, maxDist);
        const cappedX = Math.cos(angle) * cappedDist;
        const cappedY = Math.sin(angle) * cappedDist;
        setPos({ x: cappedX, y: cappedY });
        onMove({ x: cappedX / maxDist, y: cappedY / maxDist });
    };
    const handleTouchEnd = () => {
        setActive(false);
        setPos({ x: 0, y: 0 });
        onMove({ x: 0, y: 0 });
    };

    const baseStyle: React.CSSProperties = {
        width: `${radius * 2}px`, height: `${radius * 2}px`,
        borderRadius: '50%', backgroundColor: 'rgba(255, 255, 255, 0.1)',
        border: `2px solid ${active ? color : 'rgba(255,255,255,0.3)'}`,
        touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center'
    };
    const stickStyle: React.CSSProperties = {
        width: `${stickRadius * 2}px`, height: `${stickRadius * 2}px`,
        borderRadius: '50%', backgroundColor: active ? color : 'rgba(255,255,255,0.5)',
        transform: `translate(${pos.x}px, ${pos.y}px)`, transition: active ? 'none' : 'transform 0.1s ease-out'
    };

    return (
        <div className="flex flex-col items-center">
            <div ref={ref} style={baseStyle} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
                <div style={stickStyle} />
            </div>
            {label && <span className="text-gray-500 text-xs mt-2 uppercase font-bold tracking-wider">{label}</span>}
        </div>
    );
};

const checkIsMobile = () => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
};

// Camera Rig to maintain viewing area
const CameraRig = () => {
    const { camera, size } = useThree();
    useFrame(() => {
        // We want to see a specific area width in game units.
        // Room is 15 units wide. Let's show ~18 units for padding.
        const targetWidth = 18;
        const aspect = size.width / size.height;
        
        // Orthographic camera zoom math:
        // We want 1 World Unit to be roughly X pixels.
        // X = size.width / targetWidth.
        
        camera.zoom = size.width / targetWidth;
        camera.updateProjectionMatrix();
    });
    return null;
};

const GameLoop: React.FC<{ engine: GameEngine, input: React.MutableRefObject<InputManager | null>, joyMove: React.MutableRefObject<Vector2>, joyShoot: React.MutableRefObject<Vector2> }> = ({ engine, input, joyMove, joyShoot }) => {
    const { invalidate } = useThree();
    useEffect(() => {
        const loop = () => {
            if (input.current) {
                if (engine.status === GameStatus.PLAYING) {
                    const kbMove = input.current.getMovementVector();
                    const kbShoot = input.current.getShootingDirection();
                    const move = {
                        x: (Math.abs(kbMove.x) > 0 ? kbMove.x : joyMove.current.x),
                        y: (Math.abs(kbMove.y) > 0 ? kbMove.y : joyMove.current.y)
                    };
                    const shoot = (kbShoot && (Math.abs(kbShoot.x) > 0 || Math.abs(kbShoot.y) > 0)) ? kbShoot : (Math.abs(joyShoot.current.x) > 0.2 || Math.abs(joyShoot.current.y) > 0.2) ? joyShoot.current : null;
                    const restart = input.current.isRestartPressed();
                    const pause = input.current.isPausePressed();
                    engine.update({ move, shoot, restart, pause });
                }
            }
            invalidate();
            requestAnimationFrame(loop);
        };
        const id = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(id);
    }, [engine, input, joyMove, joyShoot, invalidate]);
    return null;
};

export default function App() {
  const engineRef = useRef<GameEngine | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const joystickMoveRef = useRef<Vector2>({ x: 0, y: 0 });
  const joystickShootRef = useRef<Vector2>({ x: 0, y: 0 });
  const uiAssetLoader = useMemo(() => new AssetLoader(), []);
  
  const [displayDims, setDisplayDims] = useState({ width: CONSTANTS.CANVAS_WIDTH, height: CONSTANTS.CANVAS_HEIGHT });
  
  const [gameStats, setGameStats] = useState<{
    hp: number; maxHp: number; floor: number; score: number; seed: number; items: number; notification: string | null;
    dungeon: {x:number, y:number, type: string, visited: boolean}[];
    currentRoomPos: {x:number, y:number};
    stats?: Stats; nearbyItem?: any; boss?: any;
  } | null>(null);
  
  const [status, setStatus] = useState<GameStatus>(GameStatus.MENU);
  const [showSettings, setShowSettings] = useState(false);
  const [waitingForKey, setWaitingForKey] = useState<keyof KeyMap | null>(null);
  const [menuSelection, setMenuSelection] = useState(0); 
  const [selectedCharIndex, setSelectedCharIndex] = useState(0);
  const [settingsSelection, setSettingsSelection] = useState(0);

  const [settings, setSettings] = useState<Settings>({
    language: Language.ZH_CN,
    showMinimap: true,
    isFullScreen: false,
    enableJoysticks: checkIsMobile(),
    keyMap: { ...DEFAULT_KEYMAP }
  });

  useEffect(() => {
    const handleResize = () => {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        // We want to maximize size but keep aspect ratio 15:9 roughly, 
        // OR just fill screen mostly and let CameraRig handle zoom.
        // Let's fill 95% of screen but keep a max aspect to avoid being too thin.
        let targetWidth = windowWidth;
        let targetHeight = windowHeight;
        
        // Use a container that respects the game aspect ratio somewhat to avoid UI looking weird?
        // Actually, for 3D, we can be flexible. Let's just limit max width on desktop.
        if (targetWidth > 1200) targetWidth = 1200;
        
        // Aspect ratio for the container
        const aspect = CONSTANTS.CANVAS_WIDTH / CONSTANTS.CANVAS_HEIGHT; // 1.66
        targetHeight = targetWidth / aspect;
        
        // If height is too tall for screen
        if (targetHeight > windowHeight * 0.9) {
            targetHeight = windowHeight * 0.9;
            targetWidth = targetHeight * aspect;
        }

        setDisplayDims({ width: targetWidth, height: targetHeight });
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const t = (key: string) => {
    if (key.includes(':')) {
        const parts = key.split(':');
        const name = TRANSLATIONS[settings.language][parts[0]] || parts[0];
        const desc = TRANSLATIONS[settings.language][parts[1]] || parts[1];
        return `${name}: ${desc}`;
    }
    return TRANSLATIONS[settings.language][key] || key;
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFsChange = () => setSettings(s => ({...s, isFullScreen: !!document.fullscreenElement}));
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => { if(showSettings) setSettingsSelection(0); }, [showSettings]);
  useEffect(() => { if (status === GameStatus.GAME_OVER) setMenuSelection(0); }, [status]);

  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
        if (waitingForKey) return; 
        if (e.code === settings.keyMap.toggleFullscreen) toggleFullScreen();
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [settings.keyMap.toggleFullscreen, waitingForKey]);

  useEffect(() => {
    inputRef.current = new InputManager(settings.keyMap);
    engineRef.current = new GameEngine((stats) => {
      setGameStats(stats);
      if (engineRef.current?.status !== status) {
        setStatus(engineRef.current?.status || GameStatus.MENU);
      }
    });
    engineRef.current.cameraQuaternion = new THREE.Quaternion();
    return () => { inputRef.current?.destroy(); };
  }, []);

  useEffect(() => { if (inputRef.current) inputRef.current.updateKeyMap(settings.keyMap); }, [settings.keyMap]);

  useEffect(() => {
    if (!waitingForKey) return;
    const handleRebind = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      const code = e.code;
      if (code === 'Escape') { setWaitingForKey(null); return; }
      setSettings(prev => ({ ...prev, keyMap: { ...prev.keyMap, [waitingForKey]: code } }));
      setWaitingForKey(null);
    };
    window.addEventListener('keydown', handleRebind, { once: true });
    return () => window.removeEventListener('keydown', handleRebind);
  }, [waitingForKey]);

  const startGame = () => {
    if (engineRef.current) {
      engineRef.current.startNewGame(CHARACTERS[selectedCharIndex].id);
      setStatus(GameStatus.PLAYING);
      setShowSettings(false);
    }
  };
  
  const resumeGame = () => { if (engineRef.current) { engineRef.current.resumeGame(); setStatus(GameStatus.PLAYING); } };
  const returnToMenu = () => { if (engineRef.current) engineRef.current.status = GameStatus.MENU; setStatus(GameStatus.MENU); setShowSettings(false); };
  const toggleMobilePause = () => {
      if (status === GameStatus.PLAYING) { if (engineRef.current) engineRef.current.status = GameStatus.PAUSED; setStatus(GameStatus.PAUSED); } 
      else if (status === GameStatus.PAUSED) { resumeGame(); }
  };

  useEffect(() => {
      if (waitingForKey) return;
      const handleMenuNav = (e: KeyboardEvent) => {
           if (status === GameStatus.MENU && !showSettings) {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') setMenuSelection(prev => (prev === 0 ? 1 : 0));
              else if (e.key === 'Enter') { if (menuSelection === 0) setStatus(GameStatus.CHARACTER_SELECT); else setShowSettings(true); }
           }
           if (status === GameStatus.CHARACTER_SELECT) {
               if (e.key === 'ArrowLeft') setSelectedCharIndex(p => (p - 1 + CHARACTERS.length) % CHARACTERS.length);
               if (e.key === 'ArrowRight') setSelectedCharIndex(p => (p + 1) % CHARACTERS.length);
               if (e.key === 'Enter') startGame();
               if (e.key === 'Escape') setStatus(GameStatus.MENU);
           }
      };
      window.addEventListener('keydown', handleMenuNav);
      return () => window.removeEventListener('keydown', handleMenuNav);
  }, [status, showSettings, menuSelection, settingsSelection, waitingForKey, selectedCharIndex]);

  const selectedChar = CHARACTERS[selectedCharIndex];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 text-white font-mono select-none overflow-hidden">
      
      <div className="relative shadow-2xl rounded-sm overflow-hidden bg-black border-4 border-neutral-800" style={{ width: displayDims.width, height: displayDims.height }}>
        <Canvas
            orthographic
            shadows
            dpr={window.devicePixelRatio}
            gl={{ antialias: false, toneMapping: THREE.NoToneMapping }}
            // Updated camera for Frontal Oblique View
            camera={{ position: [0, 40, 30], zoom: 50, near: 0.1, far: 1000 }}
            onCreated={({ camera, scene }) => {
                scene.background = new THREE.Color('#111');
                camera.lookAt(0, 0, 0); // Look at center of room
            }}
        >
            <CameraRig />
            {engineRef.current && (
                <>
                    <GameLoop engine={engineRef.current} input={inputRef} joyMove={joystickMoveRef} joyShoot={joystickShootRef} />
                    <GameScene engine={engineRef.current} />
                </>
            )}
        </Canvas>

        {/* HUD Layer */}
        {(status === GameStatus.PLAYING || status === GameStatus.PAUSED) && gameStats && (
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 p-4">
                <div className="flex justify-between items-start h-24">
                     <div className="flex flex-col justify-end h-full">
                        <div className="text-xs text-gray-400 mb-1 drop-shadow-md">{t('HEALTH')}</div>
                        {gameStats && (() => {
                            const hearts = [];
                            const totalHearts = Math.ceil(gameStats.maxHp / 2);
                            for(let i=0; i<totalHearts; i++) {
                                const heartHealth = Math.max(0, Math.min(2, gameStats.hp - (i * 2)));
                                hearts.push(<PixelHeart key={i} full={heartHealth > 0} />);
                            }
                            return <div className="flex">{hearts}</div>;
                        })()}
                     </div>
                     <div className="text-center pt-4 flex flex-col items-center">
                        <div className="text-2xl font-bold text-amber-500 drop-shadow-md">{t('FLOOR')} {gameStats.floor}</div>
                        <div className="text-xs text-gray-400 drop-shadow-md">{t('SCORE')}: {gameStats.score}</div>
                     </div>
                     <div className="flex flex-col items-end h-full">
                        <div className="text-xs text-gray-400 mb-1 drop-shadow-md">{t('MAP')}</div>
                        {(() => {
                            if (!settings.showMinimap || !gameStats || !gameStats.dungeon) return null;
                            const xs = gameStats.dungeon.map(r => r.x);
                            const ys = gameStats.dungeon.map(r => r.y);
                            const minX = Math.min(...xs);
                            const maxX = Math.max(...xs);
                            const minY = Math.min(...ys);
                            const maxY = Math.max(...ys);
                            const width = maxX - minX + 1;
                            const height = maxY - minY + 1;
                            const cellSize = 12;
                            return (
                                <div className="relative bg-black/50 border border-gray-600 p-1" style={{ width: width * cellSize + 8, height: height * cellSize + 8 }}>
                                    {gameStats.dungeon.map((room, i) => {
                                        if (!room.visited) return null;
                                        const isCurrent = room.x === gameStats.currentRoomPos.x && room.y === gameStats.currentRoomPos.y;
                                        let bgColor = 'bg-gray-500';
                                        if (room.type === 'BOSS') bgColor = 'bg-red-900';
                                        if (room.type === 'ITEM') bgColor = 'bg-yellow-600';
                                        if (room.type === 'START') bgColor = 'bg-blue-900';
                                        if (isCurrent) bgColor = 'bg-white animate-pulse';
                                        return <div key={i} className={`absolute border border-black ${bgColor}`} style={{ width: cellSize, height: cellSize, left: (room.x - minX) * cellSize + 4, top: (room.y - minY) * cellSize + 4 }} />;
                                    })}
                                </div>
                            );
                        })()}
                     </div>
                </div>
                {gameStats.stats && (
                    <div className="absolute left-2 top-1/2 transform -translate-y-1/2 flex flex-col gap-2 bg-black/60 p-2 rounded border border-gray-700 backdrop-blur-sm">
                        <div className="flex items-center gap-2"><span className="text-lg">⚡</span><span className="text-xs font-bold text-yellow-300">{(60 / gameStats.stats.fireRate).toFixed(1)}</span></div>
                        <div className="flex items-center gap-2"><span className="text-lg">🔭</span><span className="text-xs font-bold text-green-300">{Math.round(gameStats.stats.range)}</span></div>
                        <div className="flex items-center gap-2"><span className="text-lg">👟</span><span className="text-xs font-bold text-blue-300">{gameStats.stats.speed.toFixed(1)}</span></div>
                        <div className="flex items-center gap-2"><span className="text-lg">🥊</span><span className="text-xs font-bold text-red-300">{Math.round(gameStats.stats.knockback)}</span></div>
                        <div className="flex items-center gap-2"><span className="text-lg">🔵</span><span className="text-xs font-bold text-cyan-300">{gameStats.stats.bulletScale.toFixed(1)}</span></div>
                    </div>
                )}
                {gameStats.boss && (
                    <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center justify-center">
                        <div className="text-red-500 font-bold text-lg mb-1 drop-shadow-md tracking-wider">{gameStats.boss.name}</div>
                        <div className="w-2/3 h-6 bg-gray-900 border-2 border-red-900 rounded relative overflow-hidden">
                            <div className="h-full bg-red-600 transition-all duration-200" style={{ width: `${(Math.max(0, gameStats.boss.hp) / gameStats.boss.maxHp) * 100}%` }} />
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* Menus */}
        {status === GameStatus.MENU && !showSettings && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-8 text-center z-40">
            <h1 className="text-7xl font-black text-white mb-2 tracking-tighter drop-shadow-lg">{t('GAME_TITLE')}</h1>
            <p className="text-gray-500 text-sm mb-12 tracking-[0.5em]">3D ISOMETRIC ROGUELIKE</p>
            <div className="flex flex-col gap-6 w-72 pointer-events-auto">
              <button onClick={() => setStatus(GameStatus.CHARACTER_SELECT)} className="px-8 py-4 bg-white text-black font-bold text-xl hover:scale-105 transition-transform">{t('START_RUN')}</button>
              <button onClick={() => setShowSettings(true)} className="px-8 py-3 bg-gray-900 text-gray-500 font-bold border-2 border-gray-800 hover:border-gray-600 transition-colors">{t('SETTINGS')}</button>
            </div>
          </div>
        )}

        {status === GameStatus.CHARACTER_SELECT && !showSettings && (
             <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-40 pointer-events-auto">
                 <h2 className="text-3xl font-bold text-amber-500 mb-8">{t('START_RUN')}</h2>
                 <div className="flex items-center gap-8 mb-8">
                     <button onClick={() => setSelectedCharIndex(prev => (prev - 1 + CHARACTERS.length) % CHARACTERS.length)} className="text-6xl text-gray-500 hover:text-white">‹</button>
                     <div className="w-64 bg-gray-800 border-2 border-amber-500 rounded-xl p-6 flex flex-col items-center">
                         <div className="mb-4 bg-black rounded-full p-4 border-2 border-gray-600">
                             <SpritePreview spriteName={selectedChar.sprite} assetLoader={uiAssetLoader} />
                         </div>
                         <h2 className="text-2xl font-bold text-white">{t(selectedChar.nameKey)}</h2>
                         <p className="text-xs text-gray-400 mt-2 mb-4 italic text-center min-h-[3em]">"{t(selectedChar.descKey)}"</p>
                         <div className="w-full flex flex-col gap-1">
                            <StatBar label={t('STAT_HP')} value={selectedChar.baseStats.maxHp} max={12} color="#ef4444" />
                            <StatBar label={t('STAT_SPEED')} value={selectedChar.baseStats.speed} max={2.5} color="#3b82f6" />
                            <StatBar label={t('STAT_DMG')} value={selectedChar.baseStats.damage} max={8} color="#eab308" />
                         </div>
                     </div>
                     <button onClick={() => setSelectedCharIndex(prev => (prev + 1) % CHARACTERS.length)} className="text-6xl text-gray-500 hover:text-white">›</button>
                 </div>
                 <div className="flex gap-4">
                     <button onClick={() => setStatus(GameStatus.MENU)} className="px-6 py-2 border border-gray-700 text-gray-500 hover:text-white">BACK</button>
                     <button onClick={startGame} className="px-10 py-2 bg-amber-600 text-white font-bold hover:bg-amber-500">START</button>
                 </div>
             </div>
        )}

        {status === GameStatus.GAME_OVER && (
          <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center z-40 pointer-events-auto">
            <h1 className="text-6xl font-black text-white mb-4">{t('GAME_OVER')}</h1>
            <div className="flex gap-4">
                <button onClick={startGame} className="px-8 py-3 bg-red-600 text-white font-bold hover:bg-red-500">{t('TRY_AGAIN')}</button>
                <button onClick={returnToMenu} className="px-8 py-3 border border-red-800 text-red-200 hover:bg-red-900">{t('RETURN_TO_MENU')}</button>
            </div>
          </div>
        )}

        {status === GameStatus.PAUSED && !showSettings && (
           <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 pointer-events-auto">
               <h2 className="text-5xl font-bold text-white mb-8">{t('PAUSE_TITLE')}</h2>
               <div className="flex flex-col gap-4 w-64">
                   <button onClick={resumeGame} className="px-6 py-3 bg-white text-black font-bold hover:bg-gray-200">{t('RESUME')}</button>
                   <button onClick={() => setShowSettings(true)} className="px-6 py-3 border border-gray-600 text-gray-300 hover:bg-gray-800">{t('SETTINGS')}</button>
                   <button onClick={returnToMenu} className="px-6 py-3 border border-red-900 text-red-300 hover:bg-red-900/50">{t('RETURN_TO_MENU')}</button>
               </div>
           </div>
        )}

        {showSettings && (
             <div className="absolute inset-0 bg-neutral-900/95 flex flex-col items-center justify-center z-50 pointer-events-auto">
                 <h2 className="text-3xl font-bold text-amber-500 mb-6">{t('SETTING_TITLE')}</h2>
                 <div className="w-full max-w-md h-80 overflow-y-auto pr-2 custom-scrollbar border border-gray-800 p-4">
                     <div className="mb-4"><label className="text-gray-400">{t('SETTING_LANG')}</label><div className="flex gap-2 mt-1">{Object.values(Language).map(l => <button key={l} onClick={()=>setSettings(s=>({...s, language:l}))} className={`px-2 py-1 text-xs border ${settings.language===l?'bg-amber-600':'border-gray-700'}`}>{l}</button>)}</div></div>
                     <div className="mb-4 flex justify-between"><label>{t('SETTING_MINIMAP')}</label><button onClick={()=>setSettings(s=>({...s, showMinimap:!s.showMinimap}))} className={`w-8 h-4 ${settings.showMinimap?'bg-green-600':'bg-gray-700'}`}></button></div>
                     <div className="mb-4 flex justify-between"><label>{t('SETTING_JOYSTICKS')}</label><button onClick={()=>setSettings(s=>({...s, enableJoysticks:!s.enableJoysticks}))} className={`w-8 h-4 ${settings.enableJoysticks?'bg-green-600':'bg-gray-700'}`}></button></div>
                     <button onClick={()=>setShowSettings(false)} className="w-full py-2 bg-white text-black font-bold mt-4">{t('CLOSE')}</button>
                 </div>
             </div>
        )}
      </div>

      {/* Joysticks */}
      {(status === GameStatus.PLAYING || status === GameStatus.PAUSED) && settings.enableJoysticks && (
          <div className="w-full max-w-[720px] flex justify-center items-center px-4 pb-[5vh] mt-4 gap-8 pointer-events-auto">
              <div className="flex-1 flex justify-center"><VirtualJoystick label="MOVE" onMove={(v) => joystickMoveRef.current = v} color="#3b82f6" /></div>
              <button onClick={toggleMobilePause} className="w-16 h-16 rounded-full bg-amber-600/80 border-2 border-amber-400 flex items-center justify-center shadow-lg active:scale-95">{status === GameStatus.PAUSED ? <PlayIcon /> : <PauseIcon />}</button>
              <div className="flex-1 flex justify-center"><VirtualJoystick label="SHOOT" onMove={(v) => joystickShootRef.current = v} color="#ef4444" /></div>
          </div>
      )}
    </div>
  );
}