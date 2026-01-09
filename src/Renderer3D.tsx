
import React, { useRef, useLayoutEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { GameEngine } from './game';
import { Entity, EntityType, PlayerEntity, EnemyEntity, ProjectileEntity, ItemEntity } from './types';
import { CONSTANTS } from './constants';
import * as THREE from 'three';
import { AssetLoader } from './assets';
import { ENEMIES, BOSSES } from './config/enemies';
import { ITEMS, DROPS } from './config/items';
import { CHARACTERS } from './config/characters';

interface RendererProps {
  engine: GameEngine;
}

// CONSTANTS
const TILE_SIZE = CONSTANTS.TILE_SIZE;
const ROOM_WIDTH = 15;
const ROOM_HEIGHT = 9;

// Helper: Convert Logical Pixel Coordinate to 3D World Coordinate (Centered, 1 Tile = 1 Unit)
// Logical: 0..720 (TL to BR)
// 3D: -7.5..7.5 (Centered)
const to3D = (val: number, max: number) => {
    return (val / TILE_SIZE) - (max / TILE_SIZE / 2);
};

// Helper: Get Entity Sprite
const getSpriteName = (e: Entity, engine: GameEngine): string => {
    let spriteKey = '';
    if (e.type === EntityType.PLAYER) {
        const charConfig = CHARACTERS.find(c => c.id === engine.characterId);
        spriteKey = charConfig ? charConfig.sprite : 'PLAYER';
    }
    else if (e.type === EntityType.ITEM) {
         const conf = ITEMS.find(i => i.type === (e as ItemEntity).itemType) || DROPS.find(d => d.type === (e as ItemEntity).itemType);
         spriteKey = conf ? conf.sprite : 'ITEM';
    }
    else if (e.type === EntityType.PROJECTILE) {
        const p = e as ProjectileEntity;
        spriteKey = p.ownerId === 'player' ? 'PROJ_PLAYER' : 'PROJ_ENEMY';
    }
    else if (e.type === EntityType.ENEMY) {
        const en = e as EnemyEntity;
        const conf = ENEMIES.find(x => x.type === en.enemyType) || BOSSES.find(x => x.type === en.enemyType);
        spriteKey = conf ? conf.sprite : 'ENEMY_CHASER';
    }
    else if (e.type === EntityType.PEDESTAL) return 'PEDESTAL';
    
    const isInvincible = e.type === EntityType.PLAYER && (e as PlayerEntity).invincibleTimer > 0;
    const isFlashing = e.flashTimer && e.flashTimer > 0;
    
    if (spriteKey && (isFlashing || (isInvincible && Math.floor((e as PlayerEntity).invincibleTimer / 4) % 2 === 0))) {
        return spriteKey + '_FLASH';
    }
    return spriteKey;
};

// --- COMPONENTS ---

// A single 3D Entity
const EntityMesh: React.FC<{ entity: Entity, engine: GameEngine, assets: AssetLoader }> = React.memo(({ entity, engine, assets }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const lastSprite = useRef<string>('');

    useFrame(() => {
        if (meshRef.current) {
            // Calculate center position of entity in Logical Pixels
            const cx = entity.x + entity.w / 2;
            const cy = entity.y + entity.h / 2;

            // Convert to 3D World Units
            // 2D X -> 3D X
            // 2D Y -> 3D Z
            const x = to3D(cx, CONSTANTS.CANVAS_WIDTH);
            const z = to3D(cy, CONSTANTS.CANVAS_HEIGHT);
            
            // Height (Y)
            let y = 0.05; // Slightly above floor to avoid z-fighting
            
            // Billboard Vertical Offset (Sprite bottom touches floor)
            // Height in 3D units
            const h = entity.h / TILE_SIZE; 
            // Center of the plane is at h/2
            y += h / 2;

            if (entity.visualZ) {
                y += entity.visualZ / TILE_SIZE;
            }

            meshRef.current.position.set(x, y, z);
            
            // Billboard Rotation: Face Camera
            // We use the shared quaternion from engine to ensure all look same direction
            if (engine.cameraQuaternion) {
                meshRef.current.quaternion.copy(engine.cameraQuaternion);
            }

            // Texture Update Logic
            const spriteName = getSpriteName(entity, engine);
            if (spriteName && spriteName !== lastSprite.current) {
                const tex = assets.getTexture(spriteName);
                if (tex && meshRef.current.material) {
                    (meshRef.current.material as THREE.MeshBasicMaterial).map = tex;
                    (meshRef.current.material as THREE.MeshBasicMaterial).needsUpdate = true;
                    lastSprite.current = spriteName;
                }
            }
        }
    });

    // Initial render setup
    const spriteName = getSpriteName(entity, engine);
    const tex = assets.getTexture(spriteName);
    
    // Normalized Dimensions
    const width = entity.w / TILE_SIZE;
    const height = entity.h / TILE_SIZE;

    // Obstacles are 3D Blocks
    if (entity.type === EntityType.OBSTACLE) {
        const rockTex = assets.getTexture('ROCK');
        return (
             <mesh ref={meshRef} position={[0,0,0]}>
                 <boxGeometry args={[width, height, width]} />
                 <meshStandardMaterial map={rockTex} color="#888" />
             </mesh>
        );
    }
    
    // Trapdoors are flat on floor
    if (entity.type === EntityType.TRAPDOOR) {
         // Calculated initially for position, useFrame will override but that's fine
         const x = to3D(entity.x + entity.w/2, CONSTANTS.CANVAS_WIDTH);
         const z = to3D(entity.y + entity.h/2, CONSTANTS.CANVAS_HEIGHT);
         return (
             <mesh position={[x, 0.01, z]} rotation={[-Math.PI/2, 0, 0]}>
                 <planeGeometry args={[width, height]} />
                 <meshBasicMaterial color="black" />
             </mesh>
         );
    }

    return (
        <mesh ref={meshRef}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial 
                map={tex || undefined} 
                color={tex ? 'white' : entity.color} 
                transparent={true}
                alphaTest={0.5}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
});

// The Static Environment
const DungeonMesh: React.FC<{ engine: GameEngine, assets: AssetLoader }> = React.memo(({ engine, assets }) => {
    const room = engine.currentRoom;
    if (!room) return null;

    const wallTex = assets.getTexture('WALL');
    const floorTex = assets.getTexture('FLOOR');
    const rockTex = assets.getTexture('ROCK');

    const geometryGroups: React.ReactNode[] = [];

    // Floor Plane (One big plane for performance if possible, or tiles)
    // We'll use tiles to support the layout logic
    const floorMeshes: React.ReactNode[] = [];
    const wallMeshes: React.ReactNode[] = [];

    room.layout.forEach((row, r) => {
        row.forEach((tile, c) => {
            // Coordinate: Center of the tile in 3D space
            // c goes 0..14. r goes 0..8.
            // Center is 7, 4.
            const x = c - (ROOM_WIDTH - 1) / 2;
            const z = r - (ROOM_HEIGHT - 1) / 2;
            const key = `${r}-${c}`;

            // Floor is everywhere inside bounds
            floorMeshes.push(
                <mesh key={`f-${key}`} position={[x, 0, z]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                    <planeGeometry args={[1, 1]} />
                    <meshStandardMaterial map={floorTex} color={tile === 3 ? "#2d3748" : "#666"} />
                </mesh>
            );

            if (tile === 1) { // Wall
                wallMeshes.push(
                    <mesh key={`w-${key}`} position={[x, 0.5, z]} castShadow receiveShadow>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial color="white" />
                    </mesh>
                );
            } else if (tile === 2) { // Rock
                wallMeshes.push(
                    <mesh key={`r-${key}`} position={[x, 0.5, z]} castShadow receiveShadow>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial color="white" />
                    </mesh>
                );
            }
        });
    });

    // Doors (Visual Gates)
    if (!room.cleared) {
        const createGate = (x: number, z: number, rotY: number, key: string) => (
            <mesh key={key} position={[x, 0.75, z]} rotation={[0, rotY, 0]} castShadow>
                <boxGeometry args={[1, 1.5, 0.2]} />
                <meshStandardMaterial color="#3f2e18" />
            </mesh>
        );

        if (room.doors.UP) wallMeshes.push(createGate(0, -((ROOM_HEIGHT-1)/2) + 0.5, 0, 'gate-u'));
        if (room.doors.DOWN) wallMeshes.push(createGate(0, ((ROOM_HEIGHT-1)/2) - 0.5, 0, 'gate-d'));
        if (room.doors.LEFT) wallMeshes.push(createGate(-((ROOM_WIDTH-1)/2) + 0.5, 0, Math.PI/2, 'gate-l'));
        if (room.doors.RIGHT) wallMeshes.push(createGate(((ROOM_WIDTH-1)/2) - 0.5, 0, Math.PI/2, 'gate-r'));
    }

    return (
        <group>
            {floorMeshes}
            {wallMeshes}
            {/* Dark background plane to hide void below */}
            <mesh position={[0, -0.1, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[30, 20]} />
                <meshBasicMaterial color="#000" />
            </mesh>
        </group>
    );
});

export const GameScene: React.FC<RendererProps> = ({ engine }) => {
    const { camera } = useThree();

    useFrame(() => {
        // Update the quaternion reference for billboards
        engine.cameraQuaternion.copy(camera.quaternion);
    });

    // Keys for re-mounting scene when room changes (brute force update for geometry)
    const roomKey = engine.currentRoom ? `${engine.currentRoom.x},${engine.currentRoom.y}` : 'void';

    return (
        <group>
            {/* Standard Lighting */}
            <ambientLight intensity={0.8} />
            <directionalLight 
                position={[0, 50, 20]} 
                intensity={1.2} 
                castShadow 
                shadow-mapSize={[1024, 1024]}
            />
            <pointLight position={[0, 5, 0]} intensity={0.5} distance={10} />

            <group key={roomKey}>
                <DungeonMesh engine={engine} assets={engine.assets} />
            </group>

            {/* Dynamic Entities */}
            {/* Player */}
            <EntityMesh key={engine.player.id} entity={engine.player} engine={engine} assets={engine.assets} />
            
            {/* Other Entities */}
            {engine.entities.map(ent => (
                <EntityMesh key={ent.id} entity={ent} engine={engine} assets={engine.assets} />
            ))}
        </group>
    );
};
