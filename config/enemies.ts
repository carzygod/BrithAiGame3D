import { EnemyType } from '../types';
import { CONSTANTS } from '../constants';

export interface EnemyConfig {
  id: string;
  type: EnemyType;
  name: string;
  hpBase: number;
  hpPerLevel: number;
  // Stats
  speed: number;       
  damage: number;
  fireRate: number;    
  shotSpeed: number;   
  range: number;       
  // Visuals
  color: string;
  size: number;
  sprite: string;
  weight: number; 
  minFloor: number;
  ai: 'CHASE' | 'SHOOT' | 'DASHER' | 'TANK' | 'ORBIT' | 'BOSS';
  scoreValue: number;
  flying: boolean; // Config property
}

export const ENEMIES: EnemyConfig[] = [
  {
    id: 'ghost',
    type: EnemyType.CHASER,
    name: 'Ghost',
    hpBase: 10,
    hpPerLevel: 2,
    speed: 0.24,      // Was 0.06 -> * 4
    damage: 1,
    fireRate: 1000,   // N/A
    shotSpeed: 0,
    range: 0,
    color: CONSTANTS.COLORS.ENEMY,
    size: 32,
    sprite: 'ENEMY_CHASER',
    weight: 50,
    minFloor: 1,
    ai: 'CHASE',
    scoreValue: 10,
    flying: true // Ghosts fly
  },
  {
    id: 'dasher',
    type: EnemyType.DASHER,
    name: 'Dasher',
    hpBase: 10,
    hpPerLevel: 2,
    speed: 0.4,       // Was 0.1 -> * 4
    damage: 1,
    fireRate: 150,    // Was 600 -> / 4 (Faster)
    shotSpeed: 0,
    range: 1000,      // Was 200 -> * 5
    color: CONSTANTS.COLORS.ENEMY,
    size: 32,
    sprite: 'ENEMY_CHASER',
    weight: 15,
    minFloor: 1,
    ai: 'DASHER',
    scoreValue: 15,
    flying: false // Dasher walks
  },
  {
    id: 'eye',
    type: EnemyType.SHOOTER,
    name: 'Floating Eye',
    hpBase: 10,
    hpPerLevel: 2,
    speed: 0,
    damage: 1,
    fireRate: 332,    // Was 1330 -> / 4
    shotSpeed: 0.9,   // Was 0.45 -> * 2
    range: 1500,      // Was 300 -> * 5
    color: CONSTANTS.COLORS.ENEMY_FLYING,
    size: 32,
    sprite: 'ENEMY_SHOOTER',
    weight: 20,
    minFloor: 1,
    ai: 'SHOOT',
    scoreValue: 15,
    flying: true // Eyes float
  },
  {
    id: 'orbiter',
    type: EnemyType.ORBITER,
    name: 'Orbiter',
    hpBase: 10,
    hpPerLevel: 2,
    speed: 0.4,       // Was 0.1 -> * 4
    damage: 1,
    fireRate: 1000,
    shotSpeed: 0,
    range: 0,
    color: CONSTANTS.COLORS.ENEMY_ORBITER,
    size: 32,
    sprite: 'ENEMY_CHASER',
    weight: 10,
    minFloor: 2,
    ai: 'ORBIT',
    scoreValue: 20,
    flying: true // Orbiters float
  },
  {
    id: 'tank',
    type: EnemyType.TANK,
    name: 'Tank',
    hpBase: 30,
    hpPerLevel: 5,
    speed: 0.12,      // Was 0.03 -> * 4
    damage: 2,
    fireRate: 1000,
    shotSpeed: 0,
    range: 0,
    color: CONSTANTS.COLORS.ENEMY_TANK,
    size: 40,
    sprite: 'ENEMY_TANK',
    weight: 5,
    minFloor: 1,
    ai: 'TANK',
    scoreValue: 30,
    flying: false // Tanks are heavy
  }
];

export const BOSSES: EnemyConfig[] = [
  {
    id: 'boss_skull',
    type: EnemyType.BOSS,
    name: 'Skull King',
    hpBase: 100,
    hpPerLevel: 20,
    speed: 0.4,       // Was 0.1 -> * 4
    damage: 1,
    fireRate: 250,    // Was 1000 -> / 4
    shotSpeed: 0.9,   // Was 0.45 -> * 2
    range: 1500,      // Was 300 -> * 5
    color: CONSTANTS.COLORS.ENEMY_BOSS,
    size: 80,
    sprite: 'ENEMY_BOSS',
    weight: 100,
    minFloor: 1,
    ai: 'BOSS',
    scoreValue: 500,
    flying: true // Bosses usually fly/hover
  }
];