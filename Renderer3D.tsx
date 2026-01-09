
import React, { useRef, useMemo, useState, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { GameEngine } from './game';
import { Entity, EntityType, PlayerEntity, EnemyEntity, ProjectileEntity, ItemEntity } from './types';
import { CONSTANTS } from './constants';
import * as THREE from 'three';
import { AssetLoader } from './assets';
import { ENEMIES, BOSSES } from './config/enemies';
import { ITEMS, DROPS } from './config/items';
import { CHARACTERS } from './config/characters';
import { SPRITES } from './sprites';

// Fix for JSX Intrinsic Elements in TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

interface RendererProps {
  engine: GameEngine;
}

// CONSTANTS
const TILE_SIZE = CONSTANTS.TILE_SIZE;
const ROOM_WIDTH = 15;
const ROOM_HEIGHT = 9;

// Helper: Convert Logical Pixel Coordinate to 3D World Coordinate
const to3D = (val: number, max: number) => {
    return (val / TILE_SIZE) - (max / TILE_SIZE / 2);
};

// --- VOXEL ENGINE ---

interface VoxelMeshProps {
    spriteMatrix: number[][];
    colors: string[]; // [Unused, Primary, Secondary, Highlight]
    scaleFactor: number; // Size of the entity in World Units
    opacity?: number;
    flash?: boolean;
}

const dummy = new THREE.Object3D();

const VoxelMesh: React.FC<VoxelMeshProps> = React.memo(({ spriteMatrix, colors, scaleFactor, opacity = 1, flash = false }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    
    // Process Sprite Data into Voxel Positions
    const voxels = useMemo(() => {
        const data: {x: number, y: number, color: THREE.Color}[] = [];
        const h = spriteMatrix.length;
        const w = spriteMatrix[0].length;
        
        // Center offsets
        const ox = w / 2;
        const oy = h; // Pivot at bottom

        spriteMatrix.forEach((row, r) => {
            row.forEach((pixel, c) => {
                if (pixel > 0 && colors[pixel]) {
                    // Invert Y because array 0 is top
                    const y = (h - 1 - r); 
                    
                    const col = new THREE.Color(flash ? '#ffffff' : colors[pixel]);
                    if (flash) col.multiplyScalar(2.0); // Bright flash

                    data.push({
                        x: c - ox,
                        y: y - oy + (h/2), // Center vertically relative to height
                        color: col
                    });
                }
            });
        });
        return data;
    }, [spriteMatrix, colors, flash]);

    useMemo(() => {
        if (meshRef.current) {
            meshRef.current.instanceMatrix.needsUpdate = true;
            if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        }
    }, [voxels]);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        
        // Voxel Size logic: 
        // The entity has a width of `scaleFactor` (e.g. 1 unit).
        // The sprite is 16 pixels wide.
        // So 1 voxel = scaleFactor / 16.
        const voxelSize = scaleFactor / 16;
        
        voxels.forEach((v, i) => {
            dummy.position.set(v.x * voxelSize, v.y * voxelSize, 0);
            dummy.scale.set(voxelSize, voxelSize, voxelSize * 2); // Thicker Z for solidity
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
            meshRef.current!.setColorAt(i, v.color);
        });
        
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }, [voxels, scaleFactor]);

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]} castShadow receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial 
                roughness={0.5} 
                metalness={0.1} 
                transparent={opacity < 1} 
                opacity={opacity} 
            />
        </instancedMesh>
    );
});

// --- HELPER: GET ASSET DATA ---

const getEntityAssetData = (e: Entity, engine: GameEngine) => {
    let spriteMatrix = SPRITES.PLAYER; // Default
    let palette = ['', '#fff', '#ccc', '#888'];

    if (e.type === EntityType.PLAYER) {
        const char = CHARACTERS.find(c => c.id === engine.characterId);
        if (char) {
            spriteMatrix = SPRITES[char.sprite as keyof typeof SPRITES] || SPRITES.PLAYER;
            // Map Character Palette
            const P = CONSTANTS.PALETTE;
            // The mapping depends on how AssetLoader did it. 
            // In assets.ts, we see specific arrays for specific sprites. 
            // We need to approximate that logic here or duplicate it carefully.
            
            // Generic fallback for custom colors if strict mapping is hard
            if (char.sprite === 'PLAYER') palette = ['', P.PLAYER_MAIN, P.PLAYER_SHADOW, P.PLAYER_SKIN];
            else if (char.sprite === 'PLAYER_TANK') palette = ['', '#15803d', '#14532d', '#86efac'];
            else if (char.sprite === 'PLAYER_ROGUE') palette = ['', '#eab308', '#a16207', '#fef08a'];
            else if (char.sprite === 'PLAYER_MAGE') palette = ['', '#a855f7', '#7e22ce', '#e9d5ff'];
            else if (char.sprite === 'PLAYER_SNIPER') palette = ['', '#3b82f6', '#1e40af', '#60a5fa'];
            else if (char.sprite === 'PLAYER_SWARM') palette = ['', '#ef4444', '#991b1b', '#fca5a5'];
            else if (char.sprite === 'PLAYER_VOID') palette = ['', '#171717', '#0a0a0a', '#404040'];
            else palette = ['', char.color, char.color, '#fff'];
        }
    } else if (e.type === EntityType.ENEMY) {
        const en = e as EnemyEntity;
        const P = CONSTANTS.PALETTE;
        
        if (en.enemyType === 'CHASER') {
            spriteMatrix = SPRITES.ENEMY_CHASER;
            palette = ['', P.ENEMY_RED_MAIN, P.ENEMY_RED_DARK, '#ffffff'];
        } else if (en.enemyType === 'SHOOTER') {
            spriteMatrix = SPRITES.ENEMY_SHOOTER;
            palette = ['', P.ENEMY_BLUE_MAIN, P.ENEMY_BLUE_DARK, '#ffffff'];
        } else if (en.enemyType === 'TANK') {
            spriteMatrix = SPRITES.ENEMY_TANK;
            palette = ['', P.ENEMY_GREEN_MAIN, P.ENEMY_GREEN_DARK, '#000000'];
        } else if (en.enemyType === 'BOSS') {
            spriteMatrix = SPRITES.BOSS;
            palette = ['', P.BOSS_MAIN, P.BOSS_HIGHLIGHT, '#000000'];
        } else if (en.enemyType === 'DASHER') {
             // Re-use chaser sprite but color
             spriteMatrix = SPRITES.ENEMY_CHASER;
             palette = ['', '#fbbf24', '#b45309', '#fff']; // Orange/Yellow
        } else if (en.enemyType === 'ORBITER') {
             spriteMatrix = SPRITES.ENEMY_CHASER;
             palette = ['', '#db2777', '#be185d', '#fff']; // Pink
        }
    } else if (e.type === EntityType.ITEM) {
        const it = e as ItemEntity;
        const P = CONSTANTS.PALETTE;
        const itemConfig = ITEMS.find(i => i.type === it.itemType) || DROPS.find(d => d.type === it.itemType);
        
        if (itemConfig) {
            spriteMatrix = SPRITES[itemConfig.sprite as keyof typeof SPRITES] || SPRITES.ITEM_BOX;
            // Specific item palettes from assets.ts
            if (itemConfig.sprite === 'ITEM_MEAT') palette = ['', '#fca5a5', '#dc2626', '#fef2f2'];
            else if (itemConfig.sprite === 'ITEM_SWORD') palette = ['', '#94a3b8', '#475569', '#e2e8f0'];
            else if (itemConfig.sprite === 'ITEM_SYRINGE') palette = ['', '#e0e7ff', '#ef4444', '#a5f3fc'];
            else if (itemConfig.sprite === 'ITEM_MUG') palette = ['', '#78350f', '#92400e', '#451a03'];
            else if (itemConfig.sprite === 'ITEM_SPRING') palette = ['', '#9ca3af', '#4b5563', '#d1d5db'];
            else if (itemConfig.sprite === 'ITEM_LENS') palette = ['', '#60a5fa', '#1e3a8a', '#93c5fd'];
            else if (itemConfig.sprite === 'ITEM_EYE') palette = ['', '#fef3c7', '#d97706', '#000000'];
            else if (itemConfig.sprite === 'HEART') palette = ['', P.HEART_MAIN, P.HEART_SHADOW, '#ffffff'];
            else palette = ['', P.ITEM_GOLD, P.ITEM_SHADOW, '#ffffff'];
        }
    } else if (e.type === EntityType.PEDESTAL) {
        spriteMatrix = SPRITES.PEDESTAL;
        const P = CONSTANTS.PALETTE;
        palette = ['', P.PEDESTAL_TOP, P.PEDESTAL_SIDE, '#000000'];
    }

    return { spriteMatrix, palette };
};

// --- COMPONENTS ---

// 3D Entity Container
const EntityGroup: React.FC<{ entity: Entity, engine: GameEngine }> = React.memo(({ entity, engine }) => {
    const groupRef = useRef<THREE.Group>(null);
    const rotationRef = useRef(0);
    const bobOffset = useRef(Math.random() * 100);

    // Calculate dimensions
    const width = entity.w / TILE_SIZE;
    const height = entity.h / TILE_SIZE;

    const { spriteMatrix, palette } = useMemo(() => getEntityAssetData(entity, engine), [entity.type, (entity as any).itemType, (entity as any).enemyType, engine.characterId]);

    useFrame((state) => {
        if (groupRef.current) {
            // Position
            const cx = entity.x + entity.w / 2;
            const cy = entity.y + entity.h / 2;
            const x = to3D(cx, CONSTANTS.CANVAS_WIDTH);
            const z = to3D(cy, CONSTANTS.CANVAS_HEIGHT);
            
            // Base Height
            let y = width / 2; // Center of voxel mesh (which is 1 unit high normalized) relative to floor

            // Visual Z (Floating)
            if (entity.visualZ) {
                y += entity.visualZ / TILE_SIZE;
            }

            // Bobbing Animation for Items and Flying Enemies
            const isFlying = (entity.type === EntityType.ENEMY && (entity as EnemyEntity).flying) || 
                             entity.type === EntityType.ITEM;
            
            if (isFlying) {
                y += Math.sin(state.clock.elapsedTime * 4 + bobOffset.current) * 0.1;
            }

            groupRef.current.position.set(x, y, z);

            // Rotation Logic
            if (entity.type === EntityType.PLAYER || entity.type === EntityType.ENEMY) {
                // Face movement direction
                const vx = entity.velocity.x;
                const vy = entity.velocity.y;
                if (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01) {
                    // In 3D: X is Right, Z is Down (South).
                    // Angle 0 is facing +X (Right).
                    // We want: 
                    // Right (+x) -> 0 rad
                    // Down (+y in 2D / +z in 3D) -> -PI/2
                    const targetRot = Math.atan2(-vy, vx); // Note: Inverting Y for 3D mapping usually
                    
                    // Smooth rotation
                    let diff = targetRot - rotationRef.current;
                    // Normalize angle
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    
                    rotationRef.current += diff * 0.2;
                }
                // Apply rotation around Y axis
                // Offset by PI/2 because sprites usually face "Front" (South) by default? 
                // Our sprites are drawn front-facing. 
                // If I move right, I want the side of the voxel model? No, I want the face.
                // Let's assume the sprite is the "Front" view.
                // If I move Right, I rotate -90 deg so the front faces right.
                // Actually, let's keep it simple: The voxel model is a 3D extrusion of the front view.
                // It looks like a "cardboard cutout" with depth.
                // If we rotate it 90 degrees, it looks thin.
                // SO: For "Paper Mario" / Voxel style, we might actually want to Billboard usually?
                // BUT the prompt asked for "3D化" (3D-ification).
                // Let's assume we WANT the rotation, even if it reveals the side profile.
                groupRef.current.rotation.y = rotationRef.current;
            } else if (entity.type === EntityType.ITEM) {
                // Spin items
                groupRef.current.rotation.y += 0.02;
            } else {
                groupRef.current.rotation.y = 0;
            }
        }
    });

    // --- RENDER BASED ON TYPE ---

    // 1. Projectiles: Pure 3D Geometry (Sphere)
    if (entity.type === EntityType.PROJECTILE) {
        const p = entity as ProjectileEntity;
        const color = p.ownerId === 'player' ? CONSTANTS.COLORS.PROJECTILE_FRIENDLY : CONSTANTS.COLORS.PROJECTILE_ENEMY;
        return (
            <group ref={groupRef}>
                <mesh castShadow>
                    <sphereGeometry args={[width/2, 16, 16]} />
                    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} toneMapped={false} />
                </mesh>
                <pointLight color={color} intensity={2} distance={3} decay={2} />
            </group>
        );
    }

    // 2. Obstacles: Pure 3D Geometry (Box)
    if (entity.type === EntityType.OBSTACLE) {
         return (
             <group ref={groupRef}>
                 <mesh castShadow receiveShadow>
                     <boxGeometry args={[width, height, width]} />
                     <meshStandardMaterial color="white" />
                 </mesh>
             </group>
        );
    }

    // 3. Trapdoors: Flat
    if (entity.type === EntityType.TRAPDOOR) {
         return (
             <group ref={groupRef} rotation={[-Math.PI/2, 0, 0]} position={[0, 0.02, 0]}>
                 <mesh receiveShadow>
                     <planeGeometry args={[width, height]} />
                     <meshStandardMaterial color="#000" />
                 </mesh>
                 <mesh position={[0,0,-0.05]}>
                     <boxGeometry args={[width, height, 0.1]} />
                     <meshStandardMaterial color="#222" />
                 </mesh>
             </group>
         );
    }

    // 4. Characters, Items, Enemies: VOXEL MESHES
    const isFlash = (entity.flashTimer && entity.flashTimer > 0) || 
                    (entity.type === EntityType.PLAYER && (entity as PlayerEntity).invincibleTimer > 0 && Math.floor((entity as PlayerEntity).invincibleTimer / 4) % 2 === 0);

    return (
        <group ref={groupRef}>
            <VoxelMesh 
                spriteMatrix={spriteMatrix} 
                colors={palette} 
                scaleFactor={width} 
                flash={!!isFlash} 
            />
        </group>
    );
});

// The Static Environment
const DungeonMesh: React.FC<{ engine: GameEngine, assets: AssetLoader }> = React.memo(({ engine, assets }) => {
    const room = engine.currentRoom;
    if (!room) return null;

    const floorTex = assets.getTexture('FLOOR');

    // Floor Plane
    const floorMeshes: React.ReactNode[] = [];
    const wallMeshes: React.ReactNode[] = [];

    room.layout.forEach((row, r) => {
        row.forEach((tile, c) => {
            const x = c - (ROOM_WIDTH - 1) / 2;
            const z = r - (ROOM_HEIGHT - 1) / 2;
            const key = `${r}-${c}`;

            // Floor
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

    // Doors
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
        engine.cameraQuaternion.copy(camera.quaternion);
    });

    const roomKey = engine.currentRoom ? `${engine.currentRoom.x},${engine.currentRoom.y}` : 'void';

    return (
        <group>
            <ambientLight intensity={0.6} />
            <directionalLight 
                position={[10, 20, 10]} 
                intensity={1.0} 
                castShadow 
                shadow-bias={-0.0001}
            />
            
            <pointLight position={[0, 8, 0]} intensity={0.5} distance={20} />

            <group key={roomKey}>
                <DungeonMesh engine={engine} assets={engine.assets} />
            </group>

            <EntityGroup key={engine.player.id} entity={engine.player} engine={engine} />
            
            {engine.entities.map(ent => (
                <EntityGroup key={ent.id} entity={ent} engine={engine} />
            ))}
        </group>
    );
};
