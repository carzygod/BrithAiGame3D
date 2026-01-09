import { Vector2, Rect, KeyMap } from './types';
import { DEFAULT_KEYMAP } from './constants';

export const uuid = () => Math.random().toString(36).substr(2, 9);

export const checkAABB = (r1: Rect, r2: Rect): boolean => {
  return (
    r1.x < r2.x + r2.w &&
    r1.x + r1.w > r2.x &&
    r1.y < r2.y + r2.h &&
    r1.y + r1.h > r2.y
  );
};

export const normalizeVector = (v: Vector2): Vector2 => {
  const mag = Math.sqrt(v.x * v.x + v.y * v.y);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
};

export const distance = (a: Vector2, b: Vector2): number => {
  return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
};

export class SeededRNG {
  seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }

  // Simple Linear Congruential Generator
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  // Range inclusive [min, max]
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // Integer Range inclusive [min, max]
  rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  // Generic Weighted Random Selection
  weightedChoice<T extends { weight: number }>(items: T[]): T | null {
      if (items.length === 0) return null;
      
      const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
      let randomVal = this.next() * totalWeight;
      
      for (const item of items) {
          if (randomVal < item.weight) {
              return item;
          }
          randomVal -= item.weight;
      }
      return items[items.length - 1];
  }
}

export class InputManager {
  keys: { [key: string]: boolean } = {};
  keyMap: KeyMap;

  constructor(initialKeyMap?: KeyMap) {
    this.keyMap = initialKeyMap || DEFAULT_KEYMAP;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  updateKeyMap(newMap: KeyMap) {
    this.keyMap = newMap;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
  };

  onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  getMovementVector(): Vector2 {
    const v = { x: 0, y: 0 };
    if (this.keys[this.keyMap.moveUp]) v.y -= 1;
    if (this.keys[this.keyMap.moveDown]) v.y += 1;
    if (this.keys[this.keyMap.moveLeft]) v.x -= 1;
    if (this.keys[this.keyMap.moveRight]) v.x += 1;
    return normalizeVector(v);
  }

  getShootingDirection(): Vector2 | null {
    let x = 0;
    let y = 0;
    
    if (this.keys[this.keyMap.shootUp]) y -= 1;
    if (this.keys[this.keyMap.shootDown]) y += 1;
    if (this.keys[this.keyMap.shootLeft]) x -= 1;
    if (this.keys[this.keyMap.shootRight]) x += 1;

    if (x === 0 && y === 0) return null;
    
    // Enforce 4-way shooting
    if (Math.abs(x) >= Math.abs(y)) {
        y = 0;
    } else {
        x = 0;
    }
    
    return normalizeVector({x, y});
  }

  isRestartPressed(): boolean {
    return !!this.keys[this.keyMap.restart];
  }

  isPausePressed(): boolean {
      return !!this.keys[this.keyMap.pause];
  }
}