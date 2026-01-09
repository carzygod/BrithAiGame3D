
import * as THREE from 'three';
import { CONSTANTS } from './constants';
import { SPRITES } from './sprites';

export type SpriteName = keyof typeof SPRITES;

export class AssetLoader {
  // Store Three.js Textures instead of HTMLCanvasElement
  textures: Record<string, THREE.CanvasTexture> = {};
  
  // Keep raw canvases for UI previews if needed, or we can just use the image source of texture
  rawCanvases: Record<string, HTMLCanvasElement> = {};

  constructor() {
    this.generateAssets();
  }

  // Draw a 16x16 grid definition onto a canvas of arbitrary size (scaled)
  createCanvas(matrix: number[][], palette: string[], size: number): HTMLCanvasElement {
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
  
  // Convert Canvas to THREE Texture with Pixel settings
  toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter; // Critical for Pixel Art look
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
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

    const register = (name: string, canvas: HTMLCanvasElement) => {
        this.rawCanvases[name] = canvas;
        this.textures[name] = this.toTexture(canvas);
    };

    // Walls
    register('WALL', this.createCanvas(SPRITES.WALL, 
      ['', P.WALL_BASE, P.WALL_HIGHLIGHT, P.WALL_SHADOW], CONSTANTS.TILE_SIZE));
      
    // Floor
    register('FLOOR', this.createCanvas(SPRITES.FLOOR,
      ['', P.FLOOR_BASE, P.FLOOR_VAR_1, P.FLOOR_VAR_2], CONSTANTS.TILE_SIZE));

    // Obstacles
    register('ROCK', this.createCanvas(SPRITES.ROCK,
      ['', P.ROCK_BASE, P.ROCK_HIGHLIGHT, '#000000'], CONSTANTS.TILE_SIZE));

    // Player Characters
    register('PLAYER', this.createCanvas(SPRITES.PLAYER,
      ['', P.PLAYER_MAIN, P.PLAYER_SHADOW, P.PLAYER_SKIN], CONSTANTS.PLAYER_SIZE));
      
    register('PLAYER_TANK', this.createCanvas(SPRITES.PLAYER_TANK,
      ['', '#15803d', '#14532d', '#86efac'], CONSTANTS.PLAYER_SIZE)); 

    register('PLAYER_ROGUE', this.createCanvas(SPRITES.PLAYER_ROGUE,
      ['', '#eab308', '#a16207', '#fef08a'], CONSTANTS.PLAYER_SIZE));

    register('PLAYER_MAGE', this.createCanvas(SPRITES.PLAYER_MAGE,
      ['', '#a855f7', '#7e22ce', '#e9d5ff'], CONSTANTS.PLAYER_SIZE));

    register('PLAYER_SNIPER', this.createCanvas(SPRITES.PLAYER_SNIPER,
      ['', '#3b82f6', '#1e40af', '#60a5fa'], CONSTANTS.PLAYER_SIZE));

    register('PLAYER_SWARM', this.createCanvas(SPRITES.PLAYER_SWARM,
      ['', '#ef4444', '#991b1b', '#fca5a5'], CONSTANTS.PLAYER_SIZE));

    register('PLAYER_VOID', this.createCanvas(SPRITES.PLAYER_VOID,
      ['', '#171717', '#0a0a0a', '#404040'], CONSTANTS.PLAYER_SIZE));

    // Enemies
    register('ENEMY_CHASER', this.createCanvas(SPRITES.ENEMY_CHASER,
      ['', P.ENEMY_RED_MAIN, P.ENEMY_RED_DARK, '#ffffff'], CONSTANTS.ENEMY_SIZE));
      
    register('ENEMY_SHOOTER', this.createCanvas(SPRITES.ENEMY_SHOOTER,
      ['', P.ENEMY_BLUE_MAIN, P.ENEMY_BLUE_DARK, '#ffffff'], CONSTANTS.ENEMY_SIZE));

    register('ENEMY_TANK', this.createCanvas(SPRITES.ENEMY_TANK,
      ['', P.ENEMY_GREEN_MAIN, P.ENEMY_GREEN_DARK, '#000000'], CONSTANTS.ENEMY_SIZE * 1.25));

    register('ENEMY_BOSS', this.createCanvas(SPRITES.BOSS,
      ['', P.BOSS_MAIN, P.BOSS_HIGHLIGHT, '#000000'], 80));

    // Items
    register('ITEM', this.createCanvas(SPRITES.ITEM_BOX,
      ['', P.ITEM_GOLD, P.ITEM_SHADOW, '#ffffff'], CONSTANTS.ITEM_SIZE));

    register('ITEM_MEAT', this.createCanvas(SPRITES.ITEM_MEAT,
      ['', '#fca5a5', '#dc2626', '#fef2f2'], CONSTANTS.ITEM_SIZE));
      
    register('ITEM_SWORD', this.createCanvas(SPRITES.ITEM_SWORD,
      ['', '#94a3b8', '#475569', '#e2e8f0'], CONSTANTS.ITEM_SIZE));

    register('ITEM_SYRINGE', this.createCanvas(SPRITES.ITEM_SYRINGE,
      ['', '#e0e7ff', '#ef4444', '#a5f3fc'], CONSTANTS.ITEM_SIZE));

    register('ITEM_MUG', this.createCanvas(SPRITES.ITEM_MUG,
      ['', '#78350f', '#92400e', '#451a03'], CONSTANTS.ITEM_SIZE));
    
    register('ITEM_SPRING', this.createCanvas(SPRITES.ITEM_SPRING,
      ['', '#9ca3af', '#4b5563', '#d1d5db'], CONSTANTS.ITEM_SIZE));

    register('ITEM_LENS', this.createCanvas(SPRITES.ITEM_LENS,
      ['', '#60a5fa', '#1e3a8a', '#93c5fd'], CONSTANTS.ITEM_SIZE));

    register('ITEM_EYE', this.createCanvas(SPRITES.ITEM_EYE,
      ['', '#fef3c7', '#d97706', '#000000'], CONSTANTS.ITEM_SIZE));

    // Pedestal  
    register('PEDESTAL', this.createCanvas(SPRITES.PEDESTAL,
      ['', P.PEDESTAL_TOP, P.PEDESTAL_SIDE, '#000000'], CONSTANTS.ITEM_SIZE));

    register('HEART', this.createCanvas(SPRITES.HEART,
      ['', P.HEART_MAIN, P.HEART_SHADOW, '#ffffff'], 16));
      
    // Projectiles
    register('PROJ_PLAYER', this.createCircleSprite(8, P.PROJ_PLAYER_MAIN, P.PROJ_PLAYER_CORE));
    register('PROJ_ENEMY', this.createCircleSprite(8, P.PROJ_ENEMY_MAIN, P.PROJ_ENEMY_CORE));
    
    // GENERATE FLASH VARIANTS
    const currentKeys = Object.keys(this.rawCanvases);
    for (const key of currentKeys) {
        const flashCanvas = this.createFlashTexture(this.rawCanvases[key]);
        register(key + '_FLASH', flashCanvas);
    }
  }

  // Get raw canvas for UI preview
  get(name: string): HTMLCanvasElement | null {
    return this.rawCanvases[name] || null;
  }

  // Get Texture for 3D
  getTexture(name: string): THREE.CanvasTexture | null {
      return this.textures[name] || null;
  }
}