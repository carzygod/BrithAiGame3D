
import { CONSTANTS } from './constants';
import { SPRITES } from './sprites';

export type SpriteName = keyof typeof SPRITES;

export class AssetLoader {
  assets: Record<string, HTMLCanvasElement> = {};

  constructor() {
    this.generateAssets();
  }

  // Draw a 16x16 grid definition onto a canvas of arbitrary size (scaled)
  // Palettes: [Transparent, Primary, Secondary, Highlight]
  createTexture(matrix: number[][], palette: string[], size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    // Pixel size relative to destination
    const px = size / 16; 

    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const val = matrix[y][x];
        if (val > 0) {
          ctx.fillStyle = palette[val];
          // Overlap slightly to prevent sub-pixel gaps
          ctx.fillRect(x * px, y * px, px + 0.5, px + 0.5); 
        }
      }
    }
    return canvas;
  }

  createCircleSprite(radius: number, color: string, core: string): HTMLCanvasElement {
      const size = radius * 2;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      
      // Outer
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(radius, radius, radius, 0, Math.PI*2);
      ctx.fill();
      
      // Core
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(radius, radius, radius * 0.5, 0, Math.PI*2);
      ctx.fill();
      
      return canvas;
  }
  
  createFlashTexture(source: HTMLCanvasElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  generateAssets() {
    const P = CONSTANTS.PALETTE;

    // Walls
    this.assets['WALL'] = this.createTexture(SPRITES.WALL, 
      ['', P.WALL_BASE, P.WALL_HIGHLIGHT, P.WALL_SHADOW], CONSTANTS.TILE_SIZE);
      
    // Floor (Low contrast)
    this.assets['FLOOR'] = this.createTexture(SPRITES.FLOOR,
      ['', P.FLOOR_BASE, P.FLOOR_VAR_1, P.FLOOR_VAR_2], CONSTANTS.TILE_SIZE);

    // Obstacles
    this.assets['ROCK'] = this.createTexture(SPRITES.ROCK,
      ['', P.ROCK_BASE, P.ROCK_HIGHLIGHT, '#000000'], CONSTANTS.TILE_SIZE);

    // Player Characters
    
    // Alpha (Standard)
    this.assets['PLAYER'] = this.createTexture(SPRITES.PLAYER,
      ['', P.PLAYER_MAIN, P.PLAYER_SHADOW, P.PLAYER_SKIN], CONSTANTS.PLAYER_SIZE);
      
    // Titan (Tank)
    this.assets['PLAYER_TANK'] = this.createTexture(SPRITES.PLAYER_TANK,
      ['', '#15803d', '#14532d', '#86efac'], CONSTANTS.PLAYER_SIZE); 

    // Strider (Rogue - Yellow)
    this.assets['PLAYER_ROGUE'] = this.createTexture(SPRITES.PLAYER_ROGUE,
      ['', '#eab308', '#a16207', '#fef08a'], CONSTANTS.PLAYER_SIZE);

    // Blaster (Mage - Purple)
    this.assets['PLAYER_MAGE'] = this.createTexture(SPRITES.PLAYER_MAGE,
      ['', '#a855f7', '#7e22ce', '#e9d5ff'], CONSTANTS.PLAYER_SIZE);

    // Sniper (Blue - New)
    this.assets['PLAYER_SNIPER'] = this.createTexture(SPRITES.PLAYER_SNIPER,
      ['', '#3b82f6', '#1e40af', '#60a5fa'], CONSTANTS.PLAYER_SIZE);

    // Swarm (Red - New)
    this.assets['PLAYER_SWARM'] = this.createTexture(SPRITES.PLAYER_SWARM,
      ['', '#ef4444', '#991b1b', '#fca5a5'], CONSTANTS.PLAYER_SIZE);

    // Void (Black - New)
    this.assets['PLAYER_VOID'] = this.createTexture(SPRITES.PLAYER_VOID,
      ['', '#171717', '#0a0a0a', '#404040'], CONSTANTS.PLAYER_SIZE);

    // Enemies
    this.assets['ENEMY_CHASER'] = this.createTexture(SPRITES.ENEMY_CHASER,
      ['', P.ENEMY_RED_MAIN, P.ENEMY_RED_DARK, '#ffffff'], CONSTANTS.ENEMY_SIZE);
      
    this.assets['ENEMY_SHOOTER'] = this.createTexture(SPRITES.ENEMY_SHOOTER,
      ['', P.ENEMY_BLUE_MAIN, P.ENEMY_BLUE_DARK, '#ffffff'], CONSTANTS.ENEMY_SIZE);

    this.assets['ENEMY_TANK'] = this.createTexture(SPRITES.ENEMY_TANK,
      ['', P.ENEMY_GREEN_MAIN, P.ENEMY_GREEN_DARK, '#000000'], CONSTANTS.ENEMY_SIZE * 1.25); // Slightly larger rendered

    this.assets['ENEMY_BOSS'] = this.createTexture(SPRITES.BOSS,
      ['', P.BOSS_MAIN, P.BOSS_HIGHLIGHT, '#000000'], 80); // Boss Size

    // Items (Generic)
    this.assets['ITEM'] = this.createTexture(SPRITES.ITEM_BOX,
      ['', P.ITEM_GOLD, P.ITEM_SHADOW, '#ffffff'], CONSTANTS.ITEM_SIZE);

    // New Items
    this.assets['ITEM_MEAT'] = this.createTexture(SPRITES.ITEM_MEAT,
      ['', '#fca5a5', '#dc2626', '#fef2f2'], CONSTANTS.ITEM_SIZE);
      
    this.assets['ITEM_SWORD'] = this.createTexture(SPRITES.ITEM_SWORD,
      ['', '#94a3b8', '#475569', '#e2e8f0'], CONSTANTS.ITEM_SIZE);

    this.assets['ITEM_SYRINGE'] = this.createTexture(SPRITES.ITEM_SYRINGE,
      ['', '#e0e7ff', '#ef4444', '#a5f3fc'], CONSTANTS.ITEM_SIZE);

    this.assets['ITEM_MUG'] = this.createTexture(SPRITES.ITEM_MUG,
      ['', '#78350f', '#92400e', '#451a03'], CONSTANTS.ITEM_SIZE);
    
    this.assets['ITEM_SPRING'] = this.createTexture(SPRITES.ITEM_SPRING,
      ['', '#9ca3af', '#4b5563', '#d1d5db'], CONSTANTS.ITEM_SIZE);

    this.assets['ITEM_LENS'] = this.createTexture(SPRITES.ITEM_LENS,
      ['', '#60a5fa', '#1e3a8a', '#93c5fd'], CONSTANTS.ITEM_SIZE);

    this.assets['ITEM_EYE'] = this.createTexture(SPRITES.ITEM_EYE,
      ['', '#fef3c7', '#d97706', '#000000'], CONSTANTS.ITEM_SIZE);

    // Pedestal  
    this.assets['PEDESTAL'] = this.createTexture(SPRITES.PEDESTAL,
      ['', P.PEDESTAL_TOP, P.PEDESTAL_SIDE, '#000000'], CONSTANTS.ITEM_SIZE);

    this.assets['HEART'] = this.createTexture(SPRITES.HEART,
      ['', P.HEART_MAIN, P.HEART_SHADOW, '#ffffff'], 16);
      
    // Projectiles (Procedural circle sprites)
    this.assets['PROJ_PLAYER'] = this.createCircleSprite(8, P.PROJ_PLAYER_MAIN, P.PROJ_PLAYER_CORE);
    this.assets['PROJ_ENEMY'] = this.createCircleSprite(8, P.PROJ_ENEMY_MAIN, P.PROJ_ENEMY_CORE);
    
    // GENERATE FLASH VARIANTS FOR ALL ASSETS
    // Using Object.keys snapshot to avoid infinite loop while adding keys
    const currentKeys = Object.keys(this.assets);
    for (const key of currentKeys) {
        this.assets[key + '_FLASH'] = this.createFlashTexture(this.assets[key]);
    }
  }

  get(name: string): HTMLCanvasElement | null {
    return this.assets[name] || null;
  }
}
