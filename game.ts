
import { CONSTANTS } from './constants';
import { 
  Entity, PlayerEntity, EnemyEntity, ProjectileEntity, ItemEntity, 
  EntityType, EnemyType, Direction, Stats, ItemType, GameStatus, Room, Rect, Vector2 
} from './types';
import { uuid, checkAABB, distance, normalizeVector, SeededRNG } from './utils';
import { generateDungeon, carveDoors } from './dungeon';
import { AssetLoader } from './assets';
import * as THREE from 'three';

// Import Configurations
import { ENEMIES, BOSSES } from './config/enemies';
import { ITEMS, DROPS } from './config/items';
import { CHARACTERS } from './config/characters';

export class GameEngine {
  // Headless: No Canvas/Context here. 
  // The React Renderer will read the state of this engine.
  
  assets: AssetLoader;
  
  status: GameStatus = GameStatus.MENU;
  floorLevel: number = 1;
  baseSeed: number = 0;
  score: number = 0;
  
  player: PlayerEntity;
  entities: Entity[] = [];
  currentRoom: Room | null = null;
  dungeon: Room[] = [];

  // Notification system
  notification: string | null = null;
  notificationTimer: number = 0;
  
  // Restart Logic
  restartTimer: number = 0;
  
  // Pause Logic
  pauseLocked: boolean = false;

  // Selected Character
  characterId: string = 'alpha';

  // Callback to sync React UI
  onUiUpdate: (stats: any) => void;

  // Camera State
  cameraQuaternion: THREE.Quaternion = new THREE.Quaternion();

  constructor(onUiUpdate: (stats: any) => void) {
    this.onUiUpdate = onUiUpdate;
    this.assets = new AssetLoader(); // Assets are still managed here to share textures

    // Default Player
    this.player = this.createPlayer('alpha');
  }

  startNewGame(characterId: string = 'alpha') {
    this.characterId = characterId;
    this.floorLevel = 1;
    this.score = 0;
    this.baseSeed = Date.now(); // Initial random seed for the run
    this.player = this.createPlayer(characterId);
    this.loadFloor(1);
    this.status = GameStatus.PLAYING;
    this.restartTimer = 0;
  }

  resumeGame() {
      if (this.status === GameStatus.PAUSED) {
          this.status = GameStatus.PLAYING;
      }
  }

  createPlayer(characterId: string): PlayerEntity {
    // Find character config
    const config = CHARACTERS.find(c => c.id === characterId) || CHARACTERS[0];
    const s = config.baseStats;

    return {
      id: 'player',
      type: EntityType.PLAYER,
      x: CONSTANTS.CANVAS_WIDTH / 2 - CONSTANTS.PLAYER_SIZE / 2,
      y: CONSTANTS.CANVAS_HEIGHT / 2 - CONSTANTS.PLAYER_SIZE / 2,
      w: CONSTANTS.PLAYER_SIZE,
      h: CONSTANTS.PLAYER_SIZE,
      velocity: { x: 0, y: 0 },
      knockbackVelocity: { x: 0, y: 0 },
      color: config.color,
      markedForDeletion: false,
      stats: { ...s }, // Clone stats
      cooldown: 0,
      invincibleTimer: 0,
      inventory: [],
      visualZ: 0
    };
  }

  // Calculate geometric room growth based on run seed
  calculateRoomCount(level: number): number {
      const rng = new SeededRNG(this.baseSeed);
      let count = 5;
      
      // Simulate growth for previous levels to reach current state
      for (let i = 1; i < level; i++) {
          const increasePct = rng.range(0.2, 0.6); // 20% to 60%
          count = Math.floor(count * (1 + increasePct));
      }
      return count;
  }

  loadFloor(level: number) {
    this.floorLevel = level;
    // Deterministic seed for this floor based on run seed
    const floorSeed = this.baseSeed + (level * 1000); 
    const roomCount = this.calculateRoomCount(level);
    
    this.dungeon = generateDungeon(level, floorSeed, roomCount);
    
    const startRoom = this.dungeon.find(r => r.type === 'START');
    if (startRoom) {
      this.enterRoom(startRoom, null);
    }
  }

  enterRoom(room: Room, inputDir: Direction | null) {
    // 1. Save state of current room before leaving
    if (this.currentRoom) {
        // Save persistent entities: Items, Pedestals, Trapdoors, Obstacles
        const persistentTypes = [EntityType.ITEM, EntityType.PEDESTAL, EntityType.TRAPDOOR, EntityType.OBSTACLE];
        const toSave = this.entities.filter(e => persistentTypes.includes(e.type) && !e.markedForDeletion);
        this.currentRoom.savedEntities = toSave;
    }

    this.currentRoom = room;
    
    // Sync clear status for Item Rooms (re-entry logic)
    if (room.type === 'ITEM' && room.itemCollected) {
        room.cleared = true;
    }

    // Ensure cleared rooms have open physical doors (updates collision map)
    if (room.cleared) {
        carveDoors(room.layout, room.doors);
    }

    // Clear dynamic entities
    this.entities = [];

    // Position Player based on entry direction (Movement Direction)
    const cx = CONSTANTS.CANVAS_WIDTH / 2;
    const cy = CONSTANTS.CANVAS_HEIGHT / 2;
    
    // Offset to place player just inside the room (Tile size + padding)
    const offset = CONSTANTS.TILE_SIZE + 16; 
    
    // Door Clamping: Ensure player aligns with the door frame
    const doorW = CONSTANTS.TILE_SIZE * 3;
    const minX = cx - doorW/2;
    const maxX = cx + doorW/2 - this.player.w;
    const minY = cy - doorW/2; 
    const maxY = cy + doorW/2 - this.player.h;

    // Reset Player Physics
    this.player.knockbackVelocity = {x:0, y:0};

    // Logic: If I moved UP to enter, I spawn at the BOTTOM of the new room.
    if (inputDir === Direction.UP) {
      this.player.y = CONSTANTS.CANVAS_HEIGHT - offset - this.player.h;
      this.player.x = Math.max(minX, Math.min(this.player.x, maxX)); // Clamp X
    } else if (inputDir === Direction.DOWN) {
      this.player.y = offset;
      this.player.x = Math.max(minX, Math.min(this.player.x, maxX)); // Clamp X
    } else if (inputDir === Direction.LEFT) {
      this.player.x = CONSTANTS.CANVAS_WIDTH - offset - this.player.w;
      this.player.y = Math.max(minY, Math.min(this.player.y, maxY)); // Clamp Y
    } else if (inputDir === Direction.RIGHT) {
      this.player.x = offset;
      this.player.y = Math.max(minY, Math.min(this.player.y, maxY)); // Clamp Y
    } else {
      // Start room / Teleport: Center
      this.player.x = cx - this.player.w/2;
      this.player.y = cy - this.player.h/2;
    }

    // --- Entity Restoration / Generation ---

    // 2. Restore Saved Entities (Items, Pedestals, etc.)
    if (room.savedEntities && room.savedEntities.length > 0) {
        this.entities.push(...room.savedEntities);
    } 
    // 3. Initial Generation (If not visited)
    else if (!room.visited) {
        // Spawn Item if Item Room
        if (room.type === 'ITEM') {
            this.spawnItem(cx, cy, room.seed);
        }
        
        // Spawn Boss (Initial Fight)
        if (room.type === 'BOSS') {
            this.spawnBoss(cx, cy);
        }
    }

    // 4. Enemy Spawning (Living things)
    // Note: Bosses spawned above are for initial fight. If returning to uncleared boss room, handle here.
    if (!room.cleared && room.type !== 'START') {
        // If it's a Boss room and we are revisiting (fled?), respawn Boss
        if (room.type === 'BOSS' && room.visited) {
             this.spawnBoss(cx, cy);
        }
        // Spawn normal enemies
        else if (room.type === 'NORMAL') {
             this.spawnEnemiesForRoom(room);
        }
    }

    room.visited = true;
  }

  spawnEnemiesForRoom(room: Room) {
    const count = 2 + Math.floor(Math.random() * 3) + this.floorLevel;
    if (room.type === 'ITEM') return;

    const rng = new SeededRNG(room.seed + 100);
    const validEnemies = ENEMIES.filter(e => e.minFloor <= this.floorLevel);

    const checkTileBlocked = (x: number, y: number, size: number): boolean => {
       const ts = CONSTANTS.TILE_SIZE;
       const corners = [
           {x, y}, {x: x+size, y}, {x, y: y+size}, {x: x+size, y: y+size}
       ];
       for (const p of corners) {
           const cx = Math.floor(p.x / ts);
           const cy = Math.floor(p.y / ts);
           if (cy < 0 || cy >= room.layout.length || cx < 0 || cx >= room.layout[0].length) return true;
           const tile = room.layout[cy][cx];
           if (tile === 1 || tile === 2) return true;
       }
       return false;
    };

    for (let i = 0; i < count; i++) {
        let ex = 0;
        let ey = 0;
        let valid = false;
        
        const config = rng.weightedChoice(validEnemies);
        if (!config) continue;

        for (let attempt = 0; attempt < 10; attempt++) {
             ex = CONSTANTS.TILE_SIZE * 2 + rng.next() * (CONSTANTS.CANVAS_WIDTH - CONSTANTS.TILE_SIZE * 4);
             ey = CONSTANTS.TILE_SIZE * 2 + rng.next() * (CONSTANTS.CANVAS_HEIGHT - CONSTANTS.TILE_SIZE * 4);
             if (distance({x: ex, y: ey}, this.player) < 150) continue;
             if (checkTileBlocked(ex, ey, config.size)) continue;
             valid = true;
             break;
        }

        if (!valid) continue;

        const hp = config.hpBase + (this.floorLevel * config.hpPerLevel);

        const enemy: EnemyEntity = {
            id: uuid(),
            type: EntityType.ENEMY,
            x: ex, y: ey,
            w: config.size, h: config.size,
            velocity: { x: 0, y: 0 },
            knockbackVelocity: { x: 0, y: 0 },
            color: config.color,
            markedForDeletion: false,
            enemyType: config.type,
            hp: hp,
            maxHp: hp,
            aiState: 'IDLE',
            timer: 0,
            orbitAngle: rng.next() * Math.PI * 2,
            flying: config.flying,
            stats: {
                speed: config.speed,
                damage: config.damage,
                fireRate: config.fireRate,
                shotSpeed: config.shotSpeed,
                range: config.range
            },
            visualZ: config.flying ? 20 : 0
        };
        this.entities.push(enemy);
    }
  }

  spawnBoss(x: number, y: number) {
      const config = BOSSES[0]; 
      const hp = config.hpBase + (this.floorLevel * config.hpPerLevel);
      const boss: EnemyEntity = {
          id: uuid(),
          type: EntityType.ENEMY,
          x: x - config.size/2, y: y - config.size/2,
          w: config.size, h: config.size,
          velocity: {x:0, y:0},
          knockbackVelocity: { x: 0, y: 0 },
          color: config.color,
          markedForDeletion: false,
          enemyType: config.type,
          hp: hp,
          maxHp: hp,
          aiState: 'IDLE',
          timer: 0,
          flying: config.flying,
          stats: {
              speed: config.speed,
              damage: config.damage,
              fireRate: config.fireRate,
              shotSpeed: config.shotSpeed,
              range: config.range
          },
          visualZ: 40 // Hover high
      };
      this.entities.push(boss);
  }

  spawnPedestal(x: number, y: number) {
      this.entities.push({
          id: uuid(),
          type: EntityType.PEDESTAL,
          x: x - CONSTANTS.ITEM_SIZE/2,
          y: y - CONSTANTS.ITEM_SIZE/2 + 8, // Offset slightly down so item sits on top
          w: CONSTANTS.ITEM_SIZE,
          h: CONSTANTS.ITEM_SIZE,
          velocity: {x:0, y:0},
          knockbackVelocity: {x:0, y:0},
          color: CONSTANTS.COLORS.PEDESTAL,
          markedForDeletion: false
      });
  }

  spawnItem(x: number, y: number, seed?: number, choiceGroupId?: string) {
      this.spawnPedestal(x, y);
      const rng = seed !== undefined ? new SeededRNG(seed) : new SeededRNG(Math.random() * 100000);
      const config = rng.weightedChoice(ITEMS);
      if (!config) return;

      const item: ItemEntity = {
          id: uuid(),
          type: EntityType.ITEM,
          x: x - CONSTANTS.ITEM_SIZE/2,
          y: y - CONSTANTS.ITEM_SIZE/2,
          w: CONSTANTS.ITEM_SIZE,
          h: CONSTANTS.ITEM_SIZE,
          velocity: {x:0, y:0},
          knockbackVelocity: { x: 0, y: 0 },
          color: config.color,
          markedForDeletion: false,
          itemType: config.type,
          name: config.nameKey,
          description: config.descKey,
          choiceGroupId: choiceGroupId,
          visualZ: 10 // Floating
      };
      this.entities.push(item);
  }
  
  spawnPickup(x: number, y: number) {
      const config = DROPS[0]; 
      const pickup: ItemEntity = {
          id: uuid(),
          type: EntityType.ITEM,
          x: x - 8,
          y: y - 8,
          w: 16,
          h: 16,
          velocity: {x:0, y:0},
          knockbackVelocity: { x: 0, y: 0 },
          color: config.color,
          markedForDeletion: false,
          itemType: config.type,
          name: config.nameKey,
          description: config.descKey
      };
      this.entities.push(pickup);
  }

  spawnTrapdoor(x: number, y: number) {
      const td: Entity = {
          id: uuid(),
          type: EntityType.TRAPDOOR,
          x: x - 24, y: y - 24,
          w: 48, h: 48,
          velocity: {x:0,y:0},
          knockbackVelocity: { x: 0, y: 0 },
          color: CONSTANTS.COLORS.TRAPDOOR,
          markedForDeletion: false
      };
      this.entities.push(td);
  }

  // Generate current state for UI (shared between Pause/Playing)
  getUiState() {
      let nearbyItem = null;
      let bossData = null;

      if (this.currentRoom) {
          let closestDist = 80; // Inspection Radius
          const cx = this.player.x + this.player.w/2;
          const cy = this.player.y + this.player.h/2;
          
          for (const e of this.entities) {
             if (e.type === EntityType.ITEM && !e.markedForDeletion) {
                 const ecx = e.x + e.w/2;
                 const ecy = e.y + e.h/2;
                 const d = Math.sqrt(Math.pow(ecx - cx, 2) + Math.pow(ecy - cy, 2));
                 
                 if (d < closestDist) {
                     closestDist = d;
                     nearbyItem = {
                         name: (e as ItemEntity).name,
                         desc: (e as ItemEntity).description,
                         x: e.x, y: e.y, w: e.w, h: e.h
                     };
                 }
             }
             if (e.type === EntityType.ENEMY && (e as EnemyEntity).enemyType === EnemyType.BOSS) {
                 const b = e as EnemyEntity;
                 const conf = BOSSES.find(x => x.type === EnemyType.BOSS);
                 bossData = {
                     name: conf ? conf.name : 'BOSS',
                     hp: b.hp,
                     maxHp: b.maxHp
                 };
             }
          }
      }

      return {
          hp: this.player.stats.hp,
          maxHp: this.player.stats.maxHp,
          floor: this.floorLevel,
          score: this.score,
          seed: this.baseSeed,
          items: this.player.inventory.length,
          notification: this.notification,
          dungeon: this.dungeon.map(r => ({x: r.x, y: r.y, type: r.type, visited: r.visited})),
          currentRoomPos: this.currentRoom ? {x: this.currentRoom.x, y: this.currentRoom.y} : {x:0, y:0},
          stats: this.player.stats,
          nearbyItem,
          boss: bossData
      };
  }

  update(input: { move: {x:number, y:number}, shoot: {x:number, y:number} | null, restart?: boolean, pause?: boolean }) {
    
    // Toggle Pause Logic
    if (input.pause) {
        if (!this.pauseLocked) {
            if (this.status === GameStatus.PLAYING) {
                this.status = GameStatus.PAUSED;
            } else if (this.status === GameStatus.PAUSED) {
                this.status = GameStatus.PLAYING;
            }
            this.pauseLocked = true;
        }
    } else {
        this.pauseLocked = false;
    }

    if (input.restart) {
        this.restartTimer++;
        if (this.restartTimer > 60) {
            this.startNewGame(this.characterId);
            this.notification = "NOTIF_RESTART";
            this.notificationTimer = 120;
        }
    } else {
        this.restartTimer = 0;
    }

    if (this.status === GameStatus.PAUSED) {
        this.onUiUpdate(this.getUiState());
        return;
    }

    if (this.status !== GameStatus.PLAYING) return;

    if (this.notificationTimer > 0) {
        this.notificationTimer--;
        if (this.notificationTimer <= 0) {
            this.notification = null;
        }
    }

    // --- Player Logic ---
    if (input.move.x !== 0 || input.move.y !== 0) {
        this.player.velocity.x = input.move.x * this.player.stats.speed;
        this.player.velocity.y = input.move.y * this.player.stats.speed;
    } else {
        this.player.velocity.x = 0;
        this.player.velocity.y = 0;
    }

    this.applyPhysics(this.player);
    this.resolveWallCollision(this.player);

    if (this.player.cooldown > 0) this.player.cooldown--;
    if (input.shoot && this.player.cooldown <= 0) {
        this.spawnProjectile(this.player, input.shoot);
        this.player.cooldown = this.player.stats.fireRate;
    }

    if (this.player.invincibleTimer > 0) this.player.invincibleTimer--;
    if (this.player.flashTimer && this.player.flashTimer > 0) this.player.flashTimer--;

    // --- Entity Loop ---
    const enemies = this.entities.filter(e => e.type === EntityType.ENEMY) as EnemyEntity[];
    const roomIsClear = enemies.length === 0;

    if (this.currentRoom && !this.currentRoom.cleared && roomIsClear && this.currentRoom.type !== 'ITEM') {
        this.currentRoom.cleared = true;
        carveDoors(this.currentRoom.layout, this.currentRoom.doors);
        
        if (Math.random() < 0.10) {
             const cx = CONSTANTS.CANVAS_WIDTH / 2;
             const cy = CONSTANTS.CANVAS_HEIGHT / 2;
             this.spawnPickup(cx, cy);
        }
        
        if (this.currentRoom.type === 'BOSS') {
            const cx = CONSTANTS.CANVAS_WIDTH / 2;
            const cy = CONSTANTS.CANVAS_HEIGHT / 2;
            this.spawnTrapdoor(cx, cy);
            const off = 80;
            const choiceId = `boss_reward_${this.floorLevel}`;
            const rng = new SeededRNG(this.currentRoom.seed + 999);
            this.spawnItem(cx - off, cy, rng.next() * 10000, choiceId);
            this.spawnItem(cx + off, cy, rng.next() * 10000, choiceId);
        }
    }

    if (this.currentRoom && this.currentRoom.cleared) {
        this.checkDoorCollisions();
    }

    this.resolveEnemyPhysics(enemies);

    this.entities.forEach(e => {
        if (e.markedForDeletion) return;

        if (e.type === EntityType.ENEMY) {
            this.applyPhysics(e);
        } else if (e.type !== EntityType.PROJECTILE && e.type !== EntityType.PEDESTAL) {
            e.x += e.velocity.x;
            e.y += e.velocity.y;
        }
        
        if (e.flashTimer && e.flashTimer > 0) e.flashTimer--;

        if (e.type === EntityType.PROJECTILE) {
            this.updateProjectile(e as ProjectileEntity);
        } else if (e.type === EntityType.ENEMY) {
            this.updateEnemy(e as EnemyEntity);
        } else if (e.type === EntityType.ITEM) {
            if (checkAABB(this.player, e)) {
                this.collectItem(e as ItemEntity);
            }
        } else if (e.type === EntityType.TRAPDOOR) {
            if (checkAABB(this.player, e)) {
                this.loadFloor(this.floorLevel + 1);
            }
        }
        
        // Bobbing for floating items
        if (e.visualZ !== undefined && e.type === EntityType.ITEM) {
             // Simple bobbing logic could go here or in renderer
        }
    });

    this.entities = this.entities.filter(e => !e.markedForDeletion);
    this.onUiUpdate(this.getUiState());
  }
  
  applyPhysics(ent: Entity) {
      ent.knockbackVelocity.x *= 0.9;
      ent.knockbackVelocity.y *= 0.9;
      if (Math.abs(ent.knockbackVelocity.x) < 0.1) ent.knockbackVelocity.x = 0;
      if (Math.abs(ent.knockbackVelocity.y) < 0.1) ent.knockbackVelocity.y = 0;
      ent.velocity.x += ent.knockbackVelocity.x;
      ent.velocity.y += ent.knockbackVelocity.y;
  }

  resolveEnemyPhysics(enemies: EnemyEntity[]) {
      for (let i = 0; i < enemies.length; i++) {
          for (let j = i + 1; j < enemies.length; j++) {
              const e1 = enemies[i];
              const e2 = enemies[j];
              const fly1 = e1.enemyType === EnemyType.SHOOTER || e1.enemyType === EnemyType.ORBITER;
              const fly2 = e2.enemyType === EnemyType.SHOOTER || e2.enemyType === EnemyType.ORBITER;
              if (fly1 || fly2) continue;

              const dx = e1.x - e2.x;
              const dy = e1.y - e2.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              const minDist = e1.w; 
              if (dist < minDist && dist > 0) {
                  const overlap = minDist - dist;
                  const pushX = (dx / dist) * (overlap / 2);
                  const pushY = (dy / dist) * (overlap / 2);
                  e1.x += pushX; e1.y += pushY;
                  e2.x -= pushX; e2.y -= pushY;
              }
          }
      }
  }

  spawnProjectile(owner: PlayerEntity | EnemyEntity, dir: {x:number, y:number}) {
      const isPlayer = owner.type === EntityType.PLAYER;
      const stats = isPlayer ? (owner as PlayerEntity).stats : (owner as EnemyEntity).stats;
      const speed = stats.shotSpeed; 
      const damage = stats.damage;
      const knockback = isPlayer ? (owner as PlayerEntity).stats.knockback : 0;
      let baseSize = CONSTANTS.PROJECTILE_SIZE;
      if (isPlayer) {
          const dmgFactor = Math.max(1, damage / 3.5);
          baseSize = baseSize * dmgFactor;
          baseSize *= (owner as PlayerEntity).stats.bulletScale;
      }
      const range = stats.range;
      
      const pushProj = (vx: number, vy: number) => {
          this.entities.push({
              id: uuid(),
              type: EntityType.PROJECTILE,
              x: owner.x + owner.w/2 - baseSize/2,
              y: owner.y + owner.h/2 - baseSize/2,
              w: baseSize, h: baseSize,
              velocity: { x: vx * speed, y: vy * speed },
              knockbackVelocity: { x: 0, y: 0 },
              color: isPlayer ? CONSTANTS.COLORS.PROJECTILE_FRIENDLY : CONSTANTS.COLORS.PROJECTILE_ENEMY,
              markedForDeletion: false,
              ownerId: owner.id,
              damage,
              knockback,
              lifeTime: range,
              visualZ: 10
          } as ProjectileEntity);
      };

      if (!isPlayer || (owner as PlayerEntity).stats.shotSpread === 1) {
          pushProj(dir.x, dir.y);
      } else {
          const angle = Math.atan2(dir.y, dir.x);
          const spreadRad = 15 * (Math.PI / 180);
          const pStats = (owner as PlayerEntity).stats;
          if (pStats.shotSpread === 3) {
              const angles = [angle - spreadRad, angle, angle + spreadRad];
              angles.forEach(a => pushProj(Math.cos(a), Math.sin(a)));
          }
          else if (pStats.shotSpread === 4) {
              const angles = [angle - spreadRad * 1.5, angle - spreadRad * 0.5, angle + spreadRad * 0.5, angle + spreadRad * 1.5];
              angles.forEach(a => pushProj(Math.cos(a), Math.sin(a)));
          }
      }
  }

  updateProjectile(p: ProjectileEntity) {
      p.x += p.velocity.x;
      p.y += p.velocity.y;
      p.lifeTime -= Math.abs(p.velocity.x) + Math.abs(p.velocity.y); 
      if (p.lifeTime <= 0) {
          p.markedForDeletion = true;
          return;
      }
      if (this.checkWallCollision(p)) {
          p.markedForDeletion = true;
          return;
      }
      if (p.ownerId === 'player') {
           const enemies = this.entities.filter(e => e.type === EntityType.ENEMY);
           for (const enemy of enemies) {
               if (checkAABB(p, enemy)) {
                   p.markedForDeletion = true;
                   const hitDir = normalizeVector(p.velocity);
                   this.damageEnemy(enemy as EnemyEntity, p.damage, p.knockback, hitDir);
                   return;
               }
           }
      } else {
          if (checkAABB(p, this.player)) {
              p.markedForDeletion = true;
              const hitDir = normalizeVector(p.velocity);
              this.damagePlayer(1, 10, hitDir); 
          }
      }
  }

  updateEnemy(e: EnemyEntity) {
      e.timer++;
      const distToPlayer = distance(e, this.player);
      const speed = e.stats.speed;

      if (e.enemyType === EnemyType.CHASER || (e.enemyType === EnemyType.BOSS && distToPlayer > 100)) {
          if (e.timer % 5 === 0) {
            const dir = normalizeVector({ x: this.player.x - e.x, y: this.player.y - e.y });
            e.velocity = { x: dir.x * speed, y: dir.y * speed };
          }
      } 
      else if (e.enemyType === EnemyType.TANK) {
          if (e.timer % 10 === 0) {
             const dir = normalizeVector({ x: this.player.x - e.x, y: this.player.y - e.y });
             e.velocity = { x: dir.x * speed, y: dir.y * speed };
          }
      }
      else if (e.enemyType === EnemyType.ORBITER) {
          if (!e.orbitAngle) e.orbitAngle = 0;
          e.orbitAngle += 0.02 * (speed / 0.1);
          const orbitDist = 150;
          const targetX = this.player.x + Math.cos(e.orbitAngle) * orbitDist;
          const targetY = this.player.y + Math.sin(e.orbitAngle) * orbitDist;
          const dx = targetX - e.x;
          const dy = targetY - e.y;
          e.velocity = { x: dx * 0.05 * (speed / 0.1), y: dy * 0.05 * (speed / 0.1) };
      }
      else if (e.enemyType === EnemyType.SHOOTER) {
          e.velocity = { x: 0, y: 0 };
          if (e.timer % e.stats.fireRate === 0 && distToPlayer < e.stats.range) {
              const dir = normalizeVector({ x: this.player.x - e.x, y: this.player.y - e.y });
              this.spawnProjectile(e, dir);
          }
      } else if (e.enemyType === EnemyType.DASHER) {
          if (e.aiState === 'IDLE') {
              e.velocity = {x:0,y:0};
              const waitTime = Math.floor(60 / (speed / 0.1));
              if (e.timer > waitTime) {
                  e.aiState = 'ATTACK';
                  e.timer = 0;
                  const dir = normalizeVector({ x: this.player.x - e.x, y: this.player.y - e.y });
                  e.velocity = { x: dir.x * speed * 4, y: dir.y * speed * 4 }; 
              }
          } else if (e.aiState === 'ATTACK') {
              if (e.timer > 20) {
                  e.aiState = 'IDLE';
                  e.timer = 0;
              }
          }
      }

      this.resolveWallCollision(e);
      
      if (checkAABB(e, this.player)) {
          const dir = normalizeVector({x: this.player.x - e.x, y: this.player.y - e.y});
          this.damagePlayer(1, 15, dir);
      }
  }

  damagePlayer(amount: number, knockbackForce: number = 0, knockbackDir: Vector2 = {x:0, y:0}) {
      if (this.player.invincibleTimer > 0) return;
      this.player.stats.hp -= amount;
      this.player.invincibleTimer = 60;
      this.player.flashTimer = 10;

      this.player.knockbackVelocity.x += knockbackDir.x * knockbackForce;
      this.player.knockbackVelocity.y += knockbackDir.y * knockbackForce;

      if (this.player.stats.hp <= 0) {
          this.status = GameStatus.GAME_OVER;
      }
  }

  damageEnemy(e: EnemyEntity, amount: number, knockbackForce: number = 0, knockbackDir: Vector2 = {x:0, y:0}) {
      e.hp -= amount;
      e.flashTimer = 5;

      let actualForce = knockbackForce;
      if (e.enemyType === EnemyType.TANK) actualForce *= 0.2;
      if (e.enemyType === EnemyType.BOSS) actualForce *= 0.1;

      e.knockbackVelocity.x += knockbackDir.x * actualForce;
      e.knockbackVelocity.y += knockbackDir.y * actualForce;
      
      if (e.hp <= 0) {
          e.markedForDeletion = true;
          this.score += 10;
          const config = ENEMIES.find(cfg => cfg.type === e.enemyType) || BOSSES.find(cfg => cfg.type === e.enemyType);
          if (config) {
             this.score += (config.scoreValue - 10);
          }
          if (Math.random() < 0.05) {
              this.spawnPickup(e.x + e.w/2, e.y + e.h/2);
          }
      }
  }

  collectItem(item: ItemEntity) {
      item.markedForDeletion = true;
      if (item.itemType === ItemType.HEART_PICKUP) {
          const config = DROPS.find(d => d.type === item.itemType);
          if (config && config.stats.hp) {
              this.player.stats.hp = Math.min(this.player.stats.hp + config.stats.hp, this.player.stats.maxHp);
          }
          this.notification = "PICKUP_HEART_DESC"; 
          this.notificationTimer = 60;
          return;
      }

      if (item.choiceGroupId) {
          this.entities.forEach(e => {
              if (e.type === EntityType.ITEM && 
                  (e as ItemEntity).choiceGroupId === item.choiceGroupId && 
                  e.id !== item.id) {
                  e.markedForDeletion = true;
              }
          });
      }

      this.player.inventory.push(item.itemType);
      
      if (this.currentRoom) {
          this.currentRoom.itemCollected = true;
          if (this.currentRoom.type === 'ITEM') {
               this.currentRoom.cleared = true;
               carveDoors(this.currentRoom.layout, this.currentRoom.doors);
          }
      }

      this.notification = `${item.name}:${item.description}`;
      this.notificationTimer = 180;
      
      const config = ITEMS.find(i => i.type === item.itemType);
      if (config) {
          const s = this.player.stats;
          const mods = config.stats;
          if (mods.maxHp) { s.maxHp += mods.maxHp; s.hp = Math.min(s.hp + mods.maxHp, s.maxHp); }
          if (mods.hp) { s.hp = Math.min(s.hp + mods.hp, s.maxHp); }
          if (mods.damage) s.damage *= mods.damage;
          if (mods.speed) s.speed += mods.speed;
          if (mods.fireRate) s.fireRate = Math.max(5, s.fireRate * mods.fireRate);
          if (mods.shotSpeed) s.shotSpeed += mods.shotSpeed;
          if (mods.range) s.range *= mods.range;
          if (mods.bulletScale) s.bulletScale += mods.bulletScale;
          if (mods.knockback) s.knockback *= mods.knockback;
          if (mods.shotSpread) s.shotSpread = mods.shotSpread;
      }
  }

  resolveWallCollision(ent: Entity) {
      const ts = CONSTANTS.TILE_SIZE;
      const map = this.currentRoom!.layout;
      const getFeetRect = (x: number, y: number): Rect => ({
          x: x + 4, 
          y: y + ent.h * 0.5, 
          w: ent.w - 8,
          h: ent.h * 0.5
      });
      const nextX = ent.x + ent.velocity.x;
      const nextY = ent.y + ent.velocity.y;
      const isFlying = (ent.type === EntityType.ENEMY) && (ent as EnemyEntity).flying;

      const checkCollision = (rect: Rect) => {
          const points = [
              {x: rect.x, y: rect.y},
              {x: rect.x + rect.w, y: rect.y},
              {x: rect.x, y: rect.y + rect.h},
              {x: rect.x + rect.w, y: rect.y + rect.h}
          ];
          for (const p of points) {
              const c = Math.floor(p.x / ts);
              const r = Math.floor(p.y / ts);
              if (r < 0 || r >= map.length || c < 0 || c >= map[0].length) return true;
              const tile = map[r][c];
              if (tile === 1 || (!isFlying && tile === 2)) return true;
          }
          return false;
      };

      const feetX = getFeetRect(nextX, ent.y);
      if (!checkCollision(feetX)) {
          ent.x = nextX;
      }
      const feetY = getFeetRect(ent.x, nextY);
      if (!checkCollision(feetY)) {
          ent.y = nextY;
      }
  }

  checkWallCollision(ent: Entity): boolean {
      const ts = CONSTANTS.TILE_SIZE;
      const map = this.currentRoom!.layout;
      const c = Math.floor((ent.x + ent.w/2) / ts);
      const r = Math.floor((ent.y + ent.h/2) / ts);
      if (r < 0 || r >= map.length || c < 0 || c >= map[0].length) return true;
      return (map[r][c] === 1 || map[r][c] === 2);
  }

  checkDoorCollisions() {
      if (!this.currentRoom) return;
      const p = this.player;
      const w = CONSTANTS.CANVAS_WIDTH;
      const h = CONSTANTS.CANVAS_HEIGHT;
      const ts = CONSTANTS.TILE_SIZE;
      const doors = this.currentRoom.doors;

      let triggerDir: Direction | null = null;
      let nextX = this.currentRoom.x;
      let nextY = this.currentRoom.y;

      const cx = w / 2;
      const cy = h / 2;
      const doorSpan = ts * 1.5; 
      const pCx = p.x + p.w / 2;
      const pCy = p.y + p.h / 2;

      if (doors.UP && p.y < ts && Math.abs(pCx - cx) < doorSpan) { 
          triggerDir = Direction.UP; nextY--; 
      }
      if (doors.DOWN && p.y > h - ts - p.h && Math.abs(pCx - cx) < doorSpan) { 
          triggerDir = Direction.DOWN; nextY++; 
      }
      if (doors.LEFT && p.x < ts && Math.abs(pCy - cy) < doorSpan) { 
          triggerDir = Direction.LEFT; nextX--; 
      }
      if (doors.RIGHT && p.x > w - ts - p.w && Math.abs(pCy - cy) < doorSpan) { 
          triggerDir = Direction.RIGHT; nextX++; 
      }

      if (triggerDir) {
          const nextRoom = this.dungeon.find(r => r.x === nextX && r.y === nextY);
          if (nextRoom) {
              this.enterRoom(nextRoom, triggerDir);
          }
      }
  }
}
