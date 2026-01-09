import { CONSTANTS } from '../constants';

export interface ObstacleConfig {
    id: number; // Map tile ID
    name: string;
    sprite: string;
    destructible: boolean;
    hp?: number;
    color: string;
}

export const OBSTACLES: Record<string, ObstacleConfig> = {
    ROCK: {
        id: 2, // Matches logic in dungeon.ts
        name: 'Rock',
        sprite: 'ROCK',
        destructible: false,
        color: CONSTANTS.COLORS.ROCK
    }
};