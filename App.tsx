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

// Helper to format key codes nicely
const formatKey = (code: string) => {
    if (code.startsWith('Key')) return code.replace('Key', '');
    if (code.startsWith('Arrow')) return code.replace('Arrow', '↑'); // Simple arrow representation
    if (code === 'Space') return 'SPC';
    if (code === 'Escape') return 'ESC';
    if (code === 'Enter') return 'ENT';
    return code;
};

// Camera Rig to maintain viewing area
const CameraRig = () => {
    const { camera, size } = useThree();
    useFrame(() => {
        const targetWidth = 18;
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
  const keyListRef = useRef<HTMLDivElement>(null);
  
  // Only load assets once for UI previews
  const uiAssetLoader = useMemo(() => new AssetLoader(), []);
  
  const [displayDims, setDisplayDims] = useState({ width: CONSTANTS.CANVAS_WIDTH, height: CONSTANTS.CANVAS_HEIGHT });
  
  const [gameStats, setGameStats] = useState<{
    hp: number; maxHp: number; floor: number; score: number; seed: number; items: number; notification: string | null;
    dungeon: {x:number, y:number, type: string, visited: boolean}[];
    currentRoomPos: {x:number, y:number};
    stats?: Stats; nearbyItem?: any; boss?: any;
    restartTimer?: number;
  } | null>(null);
  
  const [status, setStatus] = useState<GameStatus>(GameStatus.MENU);
  const [showSettings, setShowSettings] = useState(false);
  
  // Key Binding State
  const [waitingForKey, setWaitingForKey] = useState<keyof KeyMap | null>(null);
  
  // Navigation State
  const [menuSelection, setMenuSelection] = useState(0); 
  const [settingsSelection, setSettingsSelection] = useState(0);
  const [selectedCharIndex, setSelectedCharIndex] = useState(0);

  const [settings, setSettings] = useState<Settings>({
    language: Language.ZH_CN,
    showMinimap: true,
    isFullScreen: false,
    enableJoysticks: false, // Default: False
    keyMap: { ...DEFAULT_KEYMAP }
  });

  useEffect(() => {
    const handleResize = () => {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        let targetWidth = windowWidth;
        if (targetWidth > 1200) targetWidth = 1200;
        const aspect = CONSTANTS.CANVAS_WIDTH / CONSTANTS.CANVAS_HEIGHT;
        let targetHeight = targetWidth / aspect;
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

  // Reset menu selection when changing major states
  useEffect(() => { 
      setMenuSelection(0); 
      setSettingsSelection(0);
  }, [status, showSettings]);
  
  // Scroll to key binding
  useEffect(() => {
      if (showSettings && keyListRef.current) {
          const keyList = Object.keys(settings.keyMap);
          if (settingsSelection >= 3 && settingsSelection < 3 + keyList.length) {
              const index = settingsSelection - 3;
              const el = keyListRef.current.children[index] as HTMLElement;
              if (el) {
                  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }
          }
      }
  }, [settingsSelection, showSettings, settings.keyMap]);

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

  // Key Rebinding Listener
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

  // Consolidated Menu Navigation Logic
  useEffect(() => {
      if (waitingForKey) return; // Don't navigate while binding keys

      const handleMenuNav = (e: KeyboardEvent) => {
           // Prevent default scrolling for arrow keys in menus
           if (status !== GameStatus.PLAYING) {
                if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
           }

           const isEnter = e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter';
           const isEsc = e.code === 'Escape';

           // SETTINGS MENU NAVIGATION
           if (showSettings) {
               const keyList = Object.keys(settings.keyMap);
               const totalSettings = 3 + keyList.length + 1; // Lang, Map, Joy, Keys..., Close

               if (e.code === 'ArrowUp') setSettingsSelection(p => (p - 1 + totalSettings) % totalSettings);
               if (e.code === 'ArrowDown') setSettingsSelection(p => (p + 1) % totalSettings);

               // Language Cycle
               if (settingsSelection === 0 && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
                   const langs = Object.values(Language);
                   const idx = langs.indexOf(settings.language);
                   const dir = e.code === 'ArrowLeft' ? -1 : 1;
                   setSettings(s => ({...s, language: langs[(idx + dir + langs.length) % langs.length]}));
               }
               
               if (isEnter) {
                   if (settingsSelection === 0) {
                        const langs = Object.values(Language);
                        const idx = langs.indexOf(settings.language);
                        setSettings(s => ({...s, language: langs[(idx + 1) % langs.length]}));
                   }
                   else if (settingsSelection === 1) setSettings(s => ({...s, showMinimap: !s.showMinimap}));
                   else if (settingsSelection === 2) setSettings(s => ({...s, enableJoysticks: !s.enableJoysticks}));
                   else if (settingsSelection >= 3 && settingsSelection < 3 + keyList.length) {
                        setWaitingForKey(keyList[settingsSelection - 3] as keyof KeyMap);
                   }
                   else if (settingsSelection === totalSettings - 1) setShowSettings(false);
               }
               
               if (isEsc) setShowSettings(false);
               return; // Skip other menu logic
           }

           // 1. MAIN MENU
           if (status === GameStatus.MENU) {
              // 2 Items: Start [0], Settings [1]
              if (e.code === 'ArrowUp') setMenuSelection(prev => (prev - 1 + 2) % 2);
              if (e.code === 'ArrowDown') setMenuSelection(prev => (prev + 1) % 2);
              if (isEnter) { 
                  if (menuSelection === 0) setStatus(GameStatus.CHARACTER_SELECT); 
                  else setShowSettings(true); 
              }
           }
           
           // 2. PAUSE MENU
           else if (status === GameStatus.PAUSED) {
              // 4 Items: Resume [0], Settings [1], Copy Seed [2], Quit [3]
              if (e.code === 'ArrowUp') setMenuSelection(prev => (prev - 1 + 4) % 4);
              if (e.code === 'ArrowDown') setMenuSelection(prev => (prev + 1) % 4);
              if (isEnter) {
                   if (menuSelection === 0) resumeGame();
                   if (menuSelection === 1) setShowSettings(true);
                   if (menuSelection === 2 && gameStats) navigator.clipboard.writeText(gameStats.seed.toString());
                   if (menuSelection === 3) returnToMenu();
              }
           }

           // 3. GAME OVER
           else if (status === GameStatus.GAME_OVER) {
               // 2 Items: Try Again [0], Menu [1]
               if (e.code === 'ArrowUp') setMenuSelection(prev => (prev - 1 + 2) % 2);
               if (e.code === 'ArrowDown') setMenuSelection(prev => (prev + 1) % 2);
               if (isEnter) {
                   if (menuSelection === 0) startGame();
                   if (menuSelection === 1) returnToMenu();
               }
           }

           // 4. CHARACTER SELECT
           else if (status === GameStatus.CHARACTER_SELECT) {
               if (e.code === 'ArrowLeft') setSelectedCharIndex(p => (p - 1 + CHARACTERS.length) % CHARACTERS.length);
               if (e.code === 'ArrowRight') setSelectedCharIndex(p => (p + 1) % CHARACTERS.length);
               if (isEnter) startGame();
               if (isEsc) setStatus(GameStatus.MENU);
           }
      };
      window.addEventListener('keydown', handleMenuNav);
      return () => window.removeEventListener('keydown', handleMenuNav);
  }, [status, showSettings, menuSelection, waitingForKey, selectedCharIndex, settingsSelection, settings, gameStats]);

  const selectedChar = CHARACTERS[selectedCharIndex];

  // Helper to get button style based on index
  const getBtnClass = (index: number) => `px-8 py-3 font-bold border-2 transition-all duration-200 transform text-center w-full max-w-xs ${
      menuSelection === index 
        ? 'bg-white text-black border-white scale-105' 
        : 'bg-black/50 text-gray-400 border-gray-700 hover:border-gray-500'
  }`;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 text-white font-mono select-none overflow-hidden">
      
      <div className="relative shadow-2xl rounded-sm overflow-hidden bg-black border-4 border-neutral-800" style={{ width: displayDims.width, height: displayDims.height }}>
        <Canvas
            orthographic
            shadows
            dpr={window.devicePixelRatio}
            gl={{ antialias: false, toneMapping: THREE.NoToneMapping }}
            camera={{ position: [0, 40, 30], zoom: 50, near: 0.1, far: 1000 }}
            onCreated={({ camera, scene }) => {
                scene.background = new THREE.Color('#111');
                camera.lookAt(0, 0, 0); 
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
                                <div className="relative bg-black/60 border border-gray-600 p-1 rounded" style={{width: width*cellSize, height: height*cellSize}}>
                                    {gameStats.dungeon.map((r, i) => (
                                        <div key={i} className={`absolute w-2 h-2 rounded-sm ${r.x === gameStats.currentRoomPos.x && r.y === gameStats.currentRoomPos.y ? 'bg-white animate-pulse' : r.visited ? (r.type === 'BOSS' ? 'bg-red-900' : r.type === 'ITEM' ? 'bg-amber-600' : 'bg-gray-400') : 'bg-gray-800'}`}
                                             style={{left: (r.x - minX)*cellSize, top: (r.y - minY)*cellSize}} />
                                    ))}
                                </div>
                            );
                        })()}
                     </div>
                </div>
                
                {/* RESTART PROGRESS BAR */}
                {gameStats.restartTimer !== undefined && gameStats.restartTimer > 0 && (
                    <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 flex flex-col items-center">
                        <div className="text-white text-xs mb-1 font-bold tracking-widest bg-black/50 px-2 rounded">{t('HOLD_R')}</div>
                        <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-600">
                             <div className="h-full bg-red-500 transition-all duration-75" style={{width: `${(gameStats.restartTimer / 60) * 100}%`}} />
                        </div>
                    </div>
                )}
                
                {/* Mobile Controls Layer (Pointer Events Allowed) */}
                {settings.enableJoysticks && (
                    <div className="absolute bottom-8 left-0 w-full flex justify-between px-8 pointer-events-auto">
                        <VirtualJoystick onMove={(v) => joystickMoveRef.current = v} label="Move" />
                        <div onClick={toggleMobilePause} className="mb-8 p-2 bg-white/10 rounded-full backdrop-blur-sm border border-white/20">
                             {status === GameStatus.PAUSED ? <PlayIcon /> : <PauseIcon />}
                        </div>
                        <VirtualJoystick onMove={(v) => joystickShootRef.current = v} label="Shoot" color="#ef4444" />
                    </div>
                )}
                
                {/* Boss Bar */}
                {gameStats.boss && (
                    <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 w-64 md:w-96">
                        <div className="text-center text-red-500 font-bold mb-1 text-sm tracking-widest uppercase drop-shadow-md">{gameStats.boss.name}</div>
                        <div className="h-4 bg-red-900/50 border border-red-900 rounded-sm relative overflow-hidden">
                            <div className="h-full bg-red-600 transition-all duration-300" style={{ width: `${(gameStats.boss.hp / gameStats.boss.maxHp) * 100}%` }} />
                        </div>
                    </div>
                )}

                {/* Notifications */}
                {gameStats.notification && (
                    <div className="absolute top-32 left-1/2 transform -translate-x-1/2 bg-black/80 border border-white/20 px-6 py-4 rounded text-center backdrop-blur-sm animate-bounce-in z-50">
                        <div className="text-amber-400 font-bold text-lg mb-1">{t(gameStats.notification.split(':')[0])}</div>
                        {gameStats.notification.includes(':') && <div className="text-gray-300 text-xs">{t(gameStats.notification.split(':')[1] || '')}</div>}
                    </div>
                )}

                {/* Pickup Inspection */}
                {gameStats.nearbyItem && (
                     <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 bg-black/95 border border-amber-500 px-6 py-3 rounded text-center z-50 shadow-lg">
                         <div className="text-amber-400 font-bold text-base mb-1">{t(String(gameStats.nearbyItem.name))}</div>
                         <div className="text-gray-300 text-xs">{t(String(gameStats.nearbyItem.desc))}</div>
                     </div>
                )}
            </div>
        )}

        {/* --- SCREENS (Menus) --- */}
        
        {/* Main Menu */}
        {status === GameStatus.MENU && !showSettings && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-cyan-400 to-blue-900 mb-8 tracking-tighter drop-shadow-2xl" style={{fontFamily: 'fantasy'}}>
                    {t('GAME_TITLE')}
                </h1>
                <div className="space-y-4 w-64">
                    <button 
                        className={getBtnClass(0)}
                        onClick={() => setStatus(GameStatus.CHARACTER_SELECT)}
                        onMouseEnter={() => setMenuSelection(0)}
                    >
                        {t('START_RUN')}
                    </button>
                    <button 
                        className={getBtnClass(1)}
                        onClick={() => setShowSettings(true)}
                        onMouseEnter={() => setMenuSelection(1)}
                    >
                        {t('SETTINGS')}
                    </button>
                </div>
                <div className="absolute bottom-4 text-gray-600 text-xs">v1.2.0 - 3D UPDATE</div>
            </div>
        )}

        {/* Character Select */}
        {status === GameStatus.CHARACTER_SELECT && (
             <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
                 <h2 className="text-3xl text-white mb-8 font-bold border-b border-gray-700 pb-2">CHOOSE YOUR VESSEL</h2>
                 
                 <div className="flex items-center gap-8 mb-8">
                     <button onClick={() => setSelectedCharIndex(p => (p - 1 + CHARACTERS.length) % CHARACTERS.length)} className="text-4xl text-gray-500 hover:text-white transition-colors">‹</button>
                     
                     <div className="flex flex-col items-center w-64">
                         <div className="w-32 h-32 bg-gray-800 rounded-full mb-4 flex items-center justify-center border-4 border-gray-700 shadow-lg relative overflow-hidden">
                             <div className="transform scale-150">
                                <SpritePreview spriteName={selectedChar.sprite} assetLoader={uiAssetLoader} />
                             </div>
                         </div>
                         <div className="text-2xl font-bold text-cyan-400 mb-2">{t(selectedChar.nameKey)}</div>
                         <div className="text-gray-400 text-center text-sm h-12">{t(selectedChar.descKey)}</div>
                         
                         <div className="w-full mt-4 space-y-1 bg-gray-800/50 p-4 rounded border border-gray-700">
                             <StatBar label="HP" value={selectedChar.baseStats.hp} max={10} color="#ef4444" />
                             <StatBar label="SPD" value={selectedChar.baseStats.speed} max={2.5} color="#3b82f6" />
                             <StatBar label="DMG" value={selectedChar.baseStats.damage} max={6} color="#ef4444" />
                             <StatBar label="RNG" value={selectedChar.baseStats.range} max={600} color="#fbbf24" />
                         </div>
                     </div>

                     <button onClick={() => setSelectedCharIndex(p => (p + 1) % CHARACTERS.length)} className="text-4xl text-gray-500 hover:text-white transition-colors">›</button>
                 </div>

                 <button 
                    className="px-12 py-4 bg-white text-black font-bold text-xl hover:scale-105 transition-transform border-4 border-transparent hover:border-cyan-500"
                    onClick={startGame}
                 >
                     BEGIN DESCENT
                 </button>
                 <button className="mt-6 text-gray-500 hover:text-white underline text-sm" onClick={() => setStatus(GameStatus.MENU)}>Cancel</button>
             </div>
        )}

        {/* Pause Menu */}
        {status === GameStatus.PAUSED && !showSettings && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                <h2 className="text-4xl font-bold text-white mb-8 tracking-widest border-b-2 border-white pb-2">{t('PAUSE_TITLE')}</h2>
                <div className="space-y-4 w-64">
                    <button className={getBtnClass(0)} onClick={resumeGame} onMouseEnter={() => setMenuSelection(0)}>{t('RESUME')}</button>
                    <button className={getBtnClass(1)} onClick={() => setShowSettings(true)} onMouseEnter={() => setMenuSelection(1)}>{t('SETTINGS')}</button>
                    <button className={getBtnClass(2)} onClick={() => gameStats && navigator.clipboard.writeText(gameStats.seed.toString())} onMouseEnter={() => setMenuSelection(2)}>{t('COPY_SEED')}</button>
                    <button className={getBtnClass(3)} onClick={returnToMenu} onMouseEnter={() => setMenuSelection(3)}>{t('RETURN_TO_MENU')}</button>
                </div>
                {gameStats && gameStats.seed && (
                    <div className="mt-2 text-xs text-gray-500 font-mono">SEED: {gameStats.seed}</div>
                )}
                {gameStats && gameStats.stats && (
                    <div className="mt-8 grid grid-cols-2 gap-4 text-xs text-gray-400 bg-black/80 p-4 rounded border border-gray-700">
                         <div>DMG: {gameStats.stats.damage.toFixed(1)}</div>
                         <div>SPD: {gameStats.stats.speed.toFixed(1)}</div>
                         <div>RATE: {(60/gameStats.stats.fireRate).toFixed(1)}/s</div>
                         <div>RNG: {gameStats.stats.range.toFixed(0)}</div>
                    </div>
                )}
            </div>
        )}

        {/* Game Over */}
        {status === GameStatus.GAME_OVER && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-red-900/40 backdrop-blur-md">
                <h2 className="text-6xl font-black text-red-500 mb-2 drop-shadow-[0_5px_5px_rgba(0,0,0,1)]">{t('GAME_OVER')}</h2>
                <div className="text-white mb-8 text-xl opacity-80">{t('SCORE')}: {gameStats?.score || 0}</div>
                <div className="flex flex-col gap-4 w-64">
                    <button className={getBtnClass(0)} onClick={startGame} onMouseEnter={() => setMenuSelection(0)}>{t('TRY_AGAIN')}</button>
                    <button className={getBtnClass(1)} onClick={returnToMenu} onMouseEnter={() => setMenuSelection(1)}>{t('RETURN_TO_MENU')}</button>
                </div>
            </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md">
                <div className="bg-neutral-900 border border-gray-600 p-8 w-96 shadow-2xl rounded-sm">
                    <h2 className="text-2xl font-bold text-white mb-6 border-b border-gray-700 pb-2">{t('SETTING_TITLE')}</h2>
                    
                    <div className="space-y-4">
                        {/* 0: Language */}
                        <div className={`flex justify-between items-center p-2 rounded ${settingsSelection === 0 ? 'bg-white/10 border border-white/30' : ''}`}
                             onMouseEnter={() => setSettingsSelection(0)}>
                            <span className="text-gray-300">{t('SETTING_LANG')}</span>
                            <div className="flex gap-2">
                                {Object.values(Language).map(l => (
                                    <button 
                                        key={l}
                                        className={`px-2 py-1 text-xs border ${settings.language === l ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}
                                        onClick={() => setSettings(s => ({...s, language: l}))}
                                    >
                                        {l.split('-')[1] || l.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 1: Minimap */}
                        <label className={`flex justify-between items-center cursor-pointer p-2 rounded ${settingsSelection === 1 ? 'bg-white/10 border border-white/30' : ''}`}
                               onMouseEnter={() => setSettingsSelection(1)}>
                            <span className="text-gray-300">{t('SETTING_MINIMAP')}</span>
                            <input 
                                type="checkbox" 
                                checked={settings.showMinimap}
                                onChange={e => setSettings(s => ({...s, showMinimap: e.target.checked}))} 
                                className="accent-cyan-500"
                            />
                        </label>
                        
                        {/* 2: Joysticks */}
                        <label className={`flex justify-between items-center cursor-pointer p-2 rounded ${settingsSelection === 2 ? 'bg-white/10 border border-white/30' : ''}`}
                               onMouseEnter={() => setSettingsSelection(2)}>
                            <span className="text-gray-300">{t('SETTING_JOYSTICKS')}</span>
                            <input 
                                type="checkbox" 
                                checked={settings.enableJoysticks}
                                onChange={e => setSettings(s => ({...s, enableJoysticks: e.target.checked}))} 
                                className="accent-cyan-500"
                            