import { ItemType } from '../types';
import { CONSTANTS } from '../constants';

export interface StatsModifier {
  maxHp?: number;
  hp?: number; // Heal amount
  speed?: number; // Additive
  damage?: number; // Multiplier
  fireRate?: number; // Multiplier (0.8 = 20% faster)
  shotSpeed?: number; // Additive
  range?: number; // Multiplier
  bulletScale?: number; // Additive
  knockback?: number; // Multiplier
  shotSpread?: number; // Absolute value setter
}

export interface ItemConfig {
  id: string;
  type: ItemType;
  nameKey: string;
  descKey: string;
  color: string;
  sprite: string; // Asset name
  weight: number; // Spawn probability
  stats: StatsModifier;
  isPickup?: boolean; // If true, consumed immediately (like hearts)
}

export const ITEMS: ItemConfig[] = [
  {
    id: 'hp_up',
    type: ItemType.HP_UP,
    nameKey: 'ITEM_HP_UP_NAME',
    descKey: 'ITEM_HP_UP_DESC',
    color: CONSTANTS.COLORS.ITEM,
    sprite: 'ITEM_MEAT',
    weight: 10,
    stats: { maxHp: 2, hp: 2 }
  },
  {
    id: 'damage_up',
    type: ItemType.DAMAGE_UP,
    nameKey: 'ITEM_DAMAGE_UP_NAME',
    descKey: 'ITEM_DAMAGE_UP_DESC',
    color: CONSTANTS.COLORS.ITEM,
    sprite: 'ITEM_SWORD',
    weight: 10,
    stats: { damage: 1.1 }
  },
  {
    id: 'glass_cannon',
    type: ItemType.GLASS_CANNON,
    nameKey: 'ITEM_GLASS_CANNON_NAME',
    descKey: 'ITEM_GLASS_CANNON_DESC',
    color: '#ff0000',
    sprite: 'ITEM_SWORD', // Re-using sword or generic item for now, or make a new one? Let's use Sword but it'll be tinted by engine logic if we want, but sprite is fixed. 
    weight: 5,
    stats: { damage: 2.0, maxHp: -2 } // Big damage, lose HP
  },
  {
    id: 'speed_up',
    type: ItemType.SPEED_UP,
    nameKey: 'ITEM_SPEED_UP_NAME',
    descKey: 'ITEM_SPEED_UP_DESC',
    color: CONSTANTS.COLORS.ITEM,
    sprite: 'ITEM_SYRINGE',
    weight: 10,
    stats: { speed: 0.5 }
  },
  {
    id: 'fire_rate_up',
    type: ItemType.FIRE_RATE_UP,
    nameKey: 'ITEM_FIRE_RATE_UP_NAME',
    descKey: 'ITEM_FIRE_RATE_UP_DESC',
    color: CONSTANTS.COLORS.ITEM,
    sprite: 'ITEM_MUG',
    weight: 10,
    stats: { fireRate: 0.8 }
  },
  {
    id: 'shot_speed_up',
    type: ItemType.SHOT_SPEED_UP,
    nameKey: 'ITEM_SHOT_SPEED_UP_NAME',
    descKey: 'ITEM_SHOT_SPEED_UP_DESC',
    color: CONSTANTS.COLORS.ITEM,
    sprite: 'ITEM_SPRING',
    weight: 10,
    stats: { shotSpeed: 1.5 }
  },
  {
    id: 'range_up',
    type: ItemType.RANGE_UP,
    nameKey: 'ITEM_RANGE_UP_NAME',
    descKey: 'ITEM_RANGE_UP_DESC',
    color: CONSTANTS.COLORS.ITEM,
    sprite: 'ITEM_LENS',
    weight: 10,
    stats: { range: 1.2 }
  },
  {
    id: 'bullet_size_up',
    type: ItemType.BULLET_SIZE_UP,
    nameKey: 'ITEM_BULLET_SIZE_UP_NAME',
    descKey: 'ITEM_BULLET_SIZE_UP_DESC',
    color: CONSTANTS.COLORS.ITEM,
    sprite: 'ITEM', // Generic Box
    weight: 8,
    stats: { bulletScale: 0.5 }
  },
  {
    id: 'triple_shot',
    type: ItemType.TRIPLE_SHOT,
    nameKey: 'ITEM_TRIPLE_SHOT_NAME',
    descKey: 'ITEM_TRIPLE_SHOT_DESC',
    color: CONSTANTS.COLORS.ITEM,
    sprite: 'ITEM_EYE',
    weight: 5,
    stats: { shotSpread: 3 }
  },
  {
    id: 'quad_shot',
    type: ItemType.QUAD_SHOT,
    nameKey: 'ITEM_QUAD_SHOT_NAME',
    descKey: 'ITEM_QUAD_SHOT_DESC',
    color: CONSTANTS.COLORS.ITEM,
    sprite: 'ITEM_EYE',
    weight: 3,
    stats: { shotSpread: 4 }
  },
  {
    id: 'knockback_up',
    type: ItemType.KNOCKBACK_UP,
    nameKey: 'ITEM_KNOCKBACK_UP_NAME',
    descKey: 'ITEM_KNOCKBACK_UP_DESC',
    color: CONSTANTS.COLORS.ITEM,
    sprite: 'ITEM', // Generic Box
    weight: 10,
    stats: { knockback: 1.2 }
  }
];

export const DROPS: ItemConfig[] = [
  {
    id: 'heart_pickup',
    type: ItemType.HEART_PICKUP,
    nameKey: 'PICKUP_HEART_NAME',
    descKey: 'PICKUP_HEART_DESC',
    color: CONSTANTS.COLORS.HEART,
    sprite: 'HEART',
    weight: 0, // Not used in standard item pool
    stats: { hp: 1 },
    isPickup: true
  }
];