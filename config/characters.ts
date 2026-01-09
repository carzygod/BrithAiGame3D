
import { Stats } from '../types';
import { CONSTANTS } from '../constants';

export interface CharacterConfig {
  id: string;
  nameKey: string;
  descKey: string;
  sprite: string;
  color: string;
  baseStats: Stats;
}

export const CHARACTERS: CharacterConfig[] = [
  {
    id: 'alpha',
    nameKey: 'CHAR_ALPHA_NAME',
    descKey: 'CHAR_ALPHA_DESC',
    sprite: 'PLAYER',
    color: CONSTANTS.PALETTE.PLAYER_MAIN,
    baseStats: {
      hp: 6, // 3 Hearts
      maxHp: 6,
      speed: 1.44,
      damage: 3.5,
      fireRate: 55,
      shotSpeed: 2.52,
      range: 400,
      shotSpread: 1,
      bulletScale: 1,
      knockback: 1
    }
  },
  {
    id: 'titan',
    nameKey: 'CHAR_TITAN_NAME',
    descKey: 'CHAR_TITAN_DESC',
    sprite: 'PLAYER_TANK',
    color: '#15803d', // Green
    baseStats: {
      hp: 10, // 5 Hearts
      maxHp: 10,
      speed: 1.0, // Slow
      damage: 4.5, // High Damage
      fireRate: 70, // Slow Fire
      shotSpeed: 2.0,
      range: 350,
      shotSpread: 1,
      bulletScale: 1.3,
      knockback: 2.0 // High Knockback
    }
  },
  {
    id: 'strider',
    nameKey: 'CHAR_STRIDER_NAME',
    descKey: 'CHAR_STRIDER_DESC',
    sprite: 'PLAYER_ROGUE',
    color: '#eab308', // Yellow
    baseStats: {
      hp: 4, // 2 Hearts
      maxHp: 4,
      speed: 2.0, // Very Fast
      damage: 2.5, // Low Damage
      fireRate: 30, // Fast Fire
      shotSpeed: 3.5, // Fast bullets
      range: 300, // Short range
      shotSpread: 1,
      bulletScale: 0.8,
      knockback: 0.5
    }
  },
  {
    id: 'blaster',
    nameKey: 'CHAR_BLASTER_NAME',
    descKey: 'CHAR_BLASTER_DESC',
    sprite: 'PLAYER_MAGE',
    color: '#a855f7', // Purple
    baseStats: {
      hp: 6,
      maxHp: 6,
      speed: 1.3,
      damage: 3.0,
      fireRate: 90, // Very Slow
      shotSpeed: 2.2,
      range: 350,
      shotSpread: 3, // Triple Shot!
      bulletScale: 1.0,
      knockback: 1.0
    }
  },
  {
    id: 'sniper',
    nameKey: 'CHAR_SNIPER_NAME',
    descKey: 'CHAR_SNIPER_DESC',
    sprite: 'PLAYER_SNIPER', // Updated
    color: '#3b82f6', // Blue
    baseStats: {
      hp: 4,
      maxHp: 4,
      speed: 1.4,
      damage: 6.0, // Huge Damage
      fireRate: 80, // Slow
      shotSpeed: 5.0, // Instant
      range: 800, // Sniper range
      shotSpread: 1,
      bulletScale: 0.8,
      knockback: 1.5
    }
  },
  {
    id: 'swarm',
    nameKey: 'CHAR_SWARM_NAME',
    descKey: 'CHAR_SWARM_DESC',
    sprite: 'PLAYER_SWARM', // Updated
    color: '#ef4444', // Red
    baseStats: {
      hp: 6,
      maxHp: 6,
      speed: 1.5,
      damage: 2.0, // Low Damage
      fireRate: 100, // Slow cooldown...
      shotSpeed: 2.5,
      range: 300,
      shotSpread: 4, // ...but Quad Shot
      bulletScale: 0.7,
      knockback: 0.2
    }
  },
  {
    id: 'void',
    nameKey: 'CHAR_VOID_NAME',
    descKey: 'CHAR_VOID_DESC',
    sprite: 'PLAYER_VOID', // Updated
    color: '#171717', // Black/Dark
    baseStats: {
      hp: 2, // 1 Heart (Glass Cannon)
      maxHp: 2,
      speed: 1.6,
      damage: 5.0,
      fireRate: 40,
      shotSpeed: 3.0,
      range: 500,
      shotSpread: 1,
      bulletScale: 1.2,
      knockback: 3.0 // Massive push
    }
  }
];
