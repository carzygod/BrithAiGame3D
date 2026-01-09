import { CONSTANTS } from './constants';
import { 
  Entity, PlayerEntity, EnemyEntity, ProjectileEntity, ItemEntity, 
  EntityType, EnemyType, Direction, Stats, ItemType, GameStatus, Room, Rect, Vector2 
} from './types';
import { uuid, checkAABB, distance, normalizeVector, SeededRNG } from './utils';
import { generateDungeon, carveDoors } from './dungeon';
import { AssetLoader } from './assets';

// Import Configurations
import { ENEMIES, BOSSES } from './config/enemies';
import { ITEMS, DROPS, ItemConfig } from './config/items';
import { CHARACTERS } from './config/characters';
import { OBSTACLES } from './config/obstacles';

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
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

  constructor(canvas: HTMLCanvasElement, onUiUpdate: (stats: any) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.onUiUpdate = onUiUpdate;
    this.assets = new AssetLoader();
    this.canvas.width = CONSTANTS.CANVAS_WIDTH;
    this.canvas.height = CONSTANTS.CANVAS_HEIGHT;

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
      inventory: []
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
    
    // Don't spawn enemies in Item rooms
    if (room.type === 'ITEM') return;

    // Use a unique RNG for enemy selection in this room
    const rng = new SeededRNG(room.seed + 100);

    // Filter valid enemies for this floor
    const validEnemies = ENEMIES.filter(e => e.minFloor <= this.floorLevel);

    const checkTileBlocked = (x: number, y: number, size: number): boolean => {
       const ts = CONSTANTS.TILE_SIZE;
       // Check 4 corners of the potential bounding box to ensure it doesn't overlap a wall
       const corners = [
           {x, y},
           {x: x+size, y},
           {x, y: y+size},
           {x: x+size, y: y+size}
       ];

       for (const p of corners) {
           const cx = Math.floor(p.x / ts);
           const cy = Math.floor(p.y / ts);
           // Safety bounds check
           if (cy < 0 || cy >= room.layout.length || cx < 0 || cx >= room.layout[0].length) return true;
           
           const tile = room.layout[cy][cx];
           // 1 = Wall, 2 = Rock. If either is present, it's blocked.
           if (tile === 1 || tile === 2) return true;
       }
       return false;
    };

    for (let i = 0; i < count; i++) {
        // Try up to 10 times to find a valid non-overlapping spot
        let ex = 0;
        let ey = 0;
        let valid = false;
        
        // Select Enemy Config first to get size
        const config = rng.weightedChoice(validEnemies);
        if (!config) continue;

        for (let attempt = 0; attempt < 10; attempt++) {
             ex = CONSTANTS.TILE_SIZE * 2 + rng.next() * (CONSTANTS.CANVAS_WIDTH - CONSTANTS.TILE_SIZE * 4);
             ey = CONSTANTS.TILE_SIZE * 2 + rng.next() * (CONSTANTS.CANVAS_HEIGHT - CONSTANTS.TILE_SIZE * 4);

             // 1. Check Distance to Player
             if (distance({x: ex, y: ey}, this.player) < 150) continue;

             // 2. Check Map Collisions (Walls/Rocks)
             if (checkTileBlocked(ex, ey, config.size)) continue;

             valid = true;
             break;
        }

        if (!valid) continue; // Skip if couldn't find a spot

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
            }
        };
        this.entities.push(enemy);
    }
  }

  spawnBoss(x: number, y: number) {
      // Pick a random boss (currently only one)
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
          }
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
      // Always spawn pedestal first (draw order: pedestal behind item)
      this.spawnPedestal(x, y);

      const rng = seed !== undefined ? new SeededRNG(seed) : new SeededRNG(Math.random() * 100000);
      
      // Select random item from config
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
          choiceGroupId: choiceGroupId
      };
      this.entities.push(item);
  }
  
  spawnPickup(x: number, y: number) {
      // Select pickup (currently only heart)
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
      // Logic for Item Inspection (Nearby items)
      let nearbyItem = null;
      let bossData = null;

      // Only detect if current room is valid
      if (this.currentRoom) {
          let closestDist = 80; // Inspection Radius
          const cx = this.player.x + this.player.w/2;
          const cy = this.player.y + this.player.h/2;
          
          for (const e of this.entities) {
             // Check Item
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
             
             // Check Boss
             if (e.type === EntityType.ENEMY && (e as EnemyEntity).enemyType === EnemyType.BOSS) {
                 const b = e as EnemyEntity;
                 // Get config name or default
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

    // Quick Restart Logic (Allow in Playing, Game Over, and Paused)
    if (input.restart) {
        this.restartTimer++;
        if (this.restartTimer > 60) { // 1 second hold
            this.startNewGame(this.characterId); // Restart with current char
            this.notification = "NOTIF_RESTART"; // Translation Key
            this.notificationTimer = 120;
        }
    } else {
        this.restartTimer = 0;
    }

    // If PAUSED, we stop game logic updates but still need to sync UI
    if (this.status === GameStatus.PAUSED) {
        this.onUiUpdate(this.getUiState());
        return;
    }

    if (this.status !== GameStatus.PLAYING) return;

    // --- Notification Logic ---
    if (this.notificationTimer > 0) {
        this.notificationTimer--;
        if (this.notificationTimer <= 0) {
            this.notification = null;
        }
    }

    // --- Player Logic ---
    // Apply Input Velocity
    if (input.move.x !== 0 || input.move.y !== 0) {
        this.player.velocity.x = input.move.x * this.player.stats.speed;
        this.player.velocity.y = input.move.y * this.player.stats.speed;
    } else {
        this.player.velocity.x = 0;
        this.player.velocity.y = 0;
    }

    // Apply Knockback Physics
    this.applyPhysics(this.player);
    this.resolveWallCollision(this.player);

    // Shooting
    if (this.player.cooldown > 0) this.player.cooldown--;
    if (input.shoot && this.player.cooldown <= 0) {
        this.spawnProjectile(this.player, input.shoot);
        this.player.cooldown = this.player.stats.fireRate;
    }

    // Invincibility
    if (this.player.invincibleTimer > 0) this.player.invincibleTimer--;
    // Flash Timer (Visuals)
    if (this.player.flashTimer && this.player.flashTimer > 0) this.player.flashTimer--;


    // --- Entity Loop ---
    const enemies = this.entities.filter(e => e.type === EntityType.ENEMY) as EnemyEntity[];
    const roomIsClear = enemies.length === 0;

    // Auto-clear Room (Normal/Boss) when all enemies are dead
    // Note: We exclude ITEM rooms here because they are cleared via item collection
    if (this.currentRoom && !this.currentRoom.cleared && roomIsClear && this.currentRoom.type !== 'ITEM') {
        this.currentRoom.cleared = true;
        // Open doors physically when room is cleared
        carveDoors(this.currentRoom.layout, this.currentRoom.doors);
        
        // 10% Chance to spawn a Heart Drop on Room Clear
        if (Math.random() < 0.10) {
             const cx = CONSTANTS.CANVAS_WIDTH / 2;
             const cy = CONSTANTS.CANVAS_HEIGHT / 2;
             this.spawnPickup(cx, cy);
        }
        
        // If it was a boss room: Spawn Trapdoor AND Rewards
        if (this.currentRoom.type === 'BOSS') {
            const cx = CONSTANTS.CANVAS_WIDTH / 2;
            const cy = CONSTANTS.CANVAS_HEIGHT / 2;
            
            // Spawn Trapdoor
            this.spawnTrapdoor(cx, cy);

            // Spawn Rewards (Two exclusive items)
            // Use currentRoom.seed for deterministic generation so we can recreate it if needed
            // But here we just spawn them fresh
            const off = 80;
            const choiceId = `boss_reward_${this.floorLevel}`;
            
            // Use a specific offset from room seed to ensure these items are distinct from each other but consistent to the seed
            const rng = new SeededRNG(this.currentRoom.seed + 999);
            
            this.spawnItem(cx - off, cy, rng.next() * 10000, choiceId);
            this.spawnItem(cx + off, cy, rng.next() * 10000, choiceId);
        }
    }

    // Doors Logic (Check exit)
    if (this.currentRoom && this.currentRoom.cleared) {
        this.checkDoorCollisions();
    }

    // Resolve Enemy-Enemy Collisions (Physics for Red monsters)
    this.resolveEnemyPhysics(enemies);

    this.entities.forEach(e => {
        if (e.markedForDeletion) return;

        // Apply Physics (Knockback decay + Velocity addition)
        if (e.type === EntityType.ENEMY) {
            this.applyPhysics(e);
        } else if (e.type !== EntityType.PROJECTILE && e.type !== EntityType.PEDESTAL) {
            // Static items/traps/projectiles handled separately
            // Actually projectiles have their own movement logic
            e.x += e.velocity.x;
            e.y += e.velocity.y;
        }
        
        // Flash Timer Decay
        if (e.flashTimer && e.flashTimer > 0) e.flashTimer--;

        // Type Specific Logic
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
                // Go next floor
                this.loadFloor(this.floorLevel + 1);
            }
        }
    });

    // Cleanup
    this.entities = this.entities.filter(e => !e.markedForDeletion);

    // Sync UI
    this.onUiUpdate(this.getUiState());
  }
  
  applyPhysics(ent: Entity) {
      // 1. Decay Knockback (Smoother decay)
      ent.knockbackVelocity.x *= 0.9;
      ent.knockbackVelocity.y *= 0.9;
      
      // Threshold to stop micro-movements
      if (Math.abs(ent.knockbackVelocity.x) < 0.1) ent.knockbackVelocity.x = 0;
      if (Math.abs(ent.knockbackVelocity.y) < 0.1) ent.knockbackVelocity.y = 0;

      // 2. Add Knockback to current Velocity
      ent.velocity.x += ent.knockbackVelocity.x;
      ent.velocity.y += ent.knockbackVelocity.y;
  }

  resolveEnemyPhysics(enemies: EnemyEntity[]) {
      for (let i = 0; i < enemies.length; i++) {
          for (let j = i + 1; j < enemies.length; j++) {
              const e1 = enemies[i];
              const e2 = enemies[j];
              
              // Flyings (Shooter, Orbiter) overlap
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

                  e1.x += pushX;
                  e1.y += pushY;
                  e2.x -= pushX;
                  e2.y -= pushY;
              }
          }
      }
  }

  spawnProjectile(owner: PlayerEntity | EnemyEntity, dir: {x:number, y:number}) {
      const isPlayer = owner.type === EntityType.PLAYER;
      // UNIFIED STATS ACCESS: Works for both Player and EnemyEntity (now that Enemy has stats)
      const stats = isPlayer ? (owner as PlayerEntity).stats : (owner as EnemyEntity).stats;
      
      const speed = stats.shotSpeed; 
      const damage = stats.damage;
      // Enemies use fixed knockback if not in stats, but let's assume 0 for now unless added
      const knockback = isPlayer ? (owner as PlayerEntity).stats.knockback : 0;
      
      // Feature: Bullet size proportional to attack damage
      // Base Size + (Damage / BaseDamage * scaling)
      let baseSize = CONSTANTS.PROJECTILE_SIZE;
      if (isPlayer) {
          // Scale based on damage (linear scaling for simplicity)
          // 3.5 is base damage.
          const dmgFactor = Math.max(1, damage / 3.5);
          baseSize = baseSize * dmgFactor;
          
          // Apply bullet scale stat
          baseSize *= (owner as PlayerEntity).stats.bulletScale;
      }
      
      const range = stats.range;
      
      // Helper to push a projectile
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
              knockback, // Pass force
              lifeTime: range
          } as ProjectileEntity);
      };

      if (!isPlayer || (owner as PlayerEntity).stats.shotSpread === 1) {
          pushProj(dir.x, dir.y);
      } else {
          // Multi-shot Logic (Player Only currently)
          const angle = Math.atan2(dir.y, dir.x);
          const spreadRad = 15 * (Math.PI / 180); // 15 degrees spread
          const pStats = (owner as PlayerEntity).stats;

          // Triple Shot: -15, 0, +15
          if (pStats.shotSpread === 3) {
              const angles = [angle - spreadRad, angle, angle + spreadRad];
              angles.forEach(a => pushProj(Math.cos(a), Math.sin(a)));
          }
          // Quad Shot: -22.5, -7.5, +7.5, +22.5 (Wider spread)
          else if (pStats.shotSpread === 4) {
              const angles = [
                  angle - spreadRad * 1.5, 
                  angle - spreadRad * 0.5, 
                  angle + spreadRad * 0.5, 
                  angle + spreadRad * 1.5
              ];
              angles.forEach(a => pushProj(Math.cos(a), Math.sin(a)));
          }
      }
  }

  updateProjectile(p: ProjectileEntity) {
      // Manual movement for projectiles (since they skip the main entity loop physics for simpler logic)
      p.x += p.velocity.x;
      p.y += p.velocity.y;

      p.lifeTime -= Math.abs(p.velocity.x) + Math.abs(p.velocity.y); 
      if (p.lifeTime <= 0) {
          p.markedForDeletion = true;
          return;
      }

      // Wall Collision
      if (this.checkWallCollision(p)) {
          p.markedForDeletion = true;
          return;
      }

      // Entity Collision
      if (p.ownerId === 'player') {
           // Hit Enemy
           const enemies = this.entities.filter(e => e.type === EntityType.ENEMY);
           for (const enemy of enemies) {
               if (checkAABB(p, enemy)) {
                   p.markedForDeletion = true;
                   
                   // Calculate Hit Direction (Projectile Velocity Normalized)
                   const hitDir = normalizeVector(p.velocity);
                   this.damageEnemy(enemy as EnemyEntity, p.damage, p.knockback, hitDir);
                   return;
               }
           }
      } else {
          // Hit Player
          if (checkAABB(p, this.player)) {
              p.markedForDeletion = true;
              
              // Enemy projectile knockback is usually fixed or low
              const hitDir = normalizeVector(p.velocity);
              this.damagePlayer(1, 10, hitDir); 
          }
      }
  }

  updateEnemy(e: EnemyEntity) {
      // Simple AI
      e.timer++;
      const distToPlayer = distance(e, this.player);
      
      // Use Entity Stats for Movement Speed
      const speed = e.stats.speed;

      if (e.enemyType === EnemyType.CHASER || (e.enemyType === EnemyType.BOSS && distToPlayer > 100)) {
          if (e.timer % 5 === 0) { // Re-path occasionally
            const dir = normalizeVector({ x: this.player.x - e.x, y: this.player.y - e.y });
            e.velocity = { x: dir.x * speed, y: dir.y * speed };
          }
      } 
      else if (e.enemyType === EnemyType.TANK) {
          // Very slow, follows relentlessly
          if (e.timer % 10 === 0) {
             const dir = normalizeVector({ x: this.player.x - e.x, y: this.player.y - e.y });
             e.velocity = { x: dir.x * speed, y: dir.y * speed };
          }
      }
      else if (e.enemyType === EnemyType.ORBITER) {
          // Circle the player
          if (!e.orbitAngle) e.orbitAngle = 0;
          e.orbitAngle += 0.02 * (speed / 0.1); // Scale Rotation speed relative to movement speed
          const orbitDist = 150;
          const targetX = this.player.x + Math.cos(e.orbitAngle) * orbitDist;
          const targetY = this.player.y + Math.sin(e.orbitAngle) * orbitDist;
          
          // Move towards orbit position
          const dx = targetX - e.x;
          const dy = targetY - e.y;
          // Approaching speed
          e.velocity = { x: dx * 0.05 * (speed / 0.1), y: dy * 0.05 * (speed / 0.1) };
      }
      else if (e.enemyType === EnemyType.SHOOTER) {
          e.velocity = { x: 0, y: 0 };
          
          // Use Stats Fire Rate (Cooldown)
          if (e.timer % e.stats.fireRate === 0 && distToPlayer < e.stats.range) {
              const dir = normalizeVector({ x: this.player.x - e.x, y: this.player.y - e.y });
              this.spawnProjectile(e, dir);
          }
      } else if (e.enemyType === EnemyType.DASHER) {
          if (e.aiState === 'IDLE') {
              e.velocity = {x:0,y:0};
              // Wait time proportional to speed? Or fixed? Let's scale it inverse to speed
              const waitTime = Math.floor(60 / (speed / 0.1)); // Normalize against new base speed
              if (e.timer > waitTime) {
                  e.aiState = 'ATTACK';
                  e.timer = 0;
                  const dir = normalizeVector({ x: this.player.x - e.x, y: this.player.y - e.y });
                  // Dash speed multiplier relative to base speed
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
      
      // Contact Damage
      if (checkAABB(e, this.player)) {
          // Contact pushback
          const dir = normalizeVector({x: this.player.x - e.x, y: this.player.y - e.y});
          this.damagePlayer(1, 15, dir);
      }
  }

  damagePlayer(amount: number, knockbackForce: number = 0, knockbackDir: Vector2 = {x:0, y:0}) {
      if (this.player.invincibleTimer > 0) return;
      this.player.stats.hp -= amount;
      this.player.invincibleTimer = 60; // 1 sec invincibility
      this.player.flashTimer = 10; // Visual flash
      this.player.color = CONSTANTS.COLORS.PLAYER_HIT; // Legacy color fallback

      // Apply Knockback
      this.player.knockbackVelocity.x += knockbackDir.x * knockbackForce;
      this.player.knockbackVelocity.y += knockbackDir.y * knockbackForce;

      setTimeout(() => this.player.color = CONSTANTS.COLORS.PLAYER, 200);

      if (this.player.stats.hp <= 0) {
          this.status = GameStatus.GAME_OVER;
      }
  }

  damageEnemy(e: EnemyEntity, amount: number, knockbackForce: number = 0, knockbackDir: Vector2 = {x:0, y:0}) {
      e.hp -= amount;
      e.flashTimer = 5; // Hit flash

      // Apply Knockback
      // Tanks resist knockback
      let actualForce = knockbackForce;
      if (e.enemyType === EnemyType.TANK) actualForce *= 0.2;
      if (e.enemyType === EnemyType.BOSS) actualForce *= 0.1;

      e.knockbackVelocity.x += knockbackDir.x * actualForce;
      e.knockbackVelocity.y += knockbackDir.y * actualForce;
      
      if (e.hp <= 0) {
          e.markedForDeletion = true;
          this.score += 10; // Default score
          
          // Look up score value from config if available
          const config = ENEMIES.find(cfg => cfg.type === e.enemyType) || BOSSES.find(cfg => cfg.type === e.enemyType);
          if (config) {
             this.score += (config.scoreValue - 10);
          }
          
          // 5% Chance to drop Heart Pickup
          if (Math.random() < 0.05) {
              this.spawnPickup(e.x + e.w/2, e.y + e.h/2);
          }
      }
  }

  collectItem(item: ItemEntity) {
      item.markedForDeletion = true;
      
      // Handle Pickups (Instant consume)
      if (item.itemType === ItemType.HEART_PICKUP) {
          // Find config for pickup logic
          const config = DROPS.find(d => d.type === item.itemType);
          if (config && config.stats.hp) {
              this.player.stats.hp = Math.min(this.player.stats.hp + config.stats.hp, this.player.stats.maxHp);
          }
          
          this.notification = "PICKUP_HEART_DESC"; 
          this.notificationTimer = 60;
          return;
      }

      // Handle Choice Groups (Remove sibling items)
      if (item.choiceGroupId) {
          this.entities.forEach(e => {
              if (e.type === EntityType.ITEM && 
                  (e as ItemEntity).choiceGroupId === item.choiceGroupId && 
                  e.id !== item.id) {
                  e.markedForDeletion = true; // Remove other choice
              }
          });
      }

      this.player.inventory.push(item.itemType);
      
      // Mark as collected in the room data for persistence
      if (this.currentRoom) {
          this.currentRoom.itemCollected = true;
          // Unlock doors if in item room
          if (this.currentRoom.type === 'ITEM') {
               this.currentRoom.cleared = true;
               carveDoors(this.currentRoom.layout, this.currentRoom.doors);
          }
      }

      // Show notification using translation keys stored in item
      this.notification = `${item.name}:${item.description}`;
      this.notificationTimer = 180; // 3 seconds
      
      // Apply stats via Config
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

  // --- Physics Helpers ---
  resolveWallCollision(ent: Entity) {
      const ts = CONSTANTS.TILE_SIZE;
      const map = this.currentRoom!.layout;

      // Improved "2.5D" Feet Collision Logic
      const getFeetRect = (x: number, y: number): Rect => ({
          x: x + 4, // Slight horizontal padding to avoid sticky sliding
          y: y + ent.h * 0.5, // Start from middle of sprite
          w: ent.w - 8,
          h: ent.h * 0.5
      });

      // Predict next position
      const nextX = ent.x + ent.velocity.x;
      const nextY = ent.y + ent.velocity.y;
      
      const isFlying = (ent.type === EntityType.ENEMY) && (ent as EnemyEntity).flying;

      // Check Feet Box against the tile map
      const checkCollision = (rect: Rect) => {
          // Check 4 corners of the feet rect
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
              
              // 1 = Wall, 2 = Rock (Obstacle)
              // If entity is flying, they ignore rocks (2) but not walls (1)
              if (tile === 1 || (!isFlying && tile === 2)) return true;
          }
          return false;
      };

      // X Axis
      const feetX = getFeetRect(nextX, ent.y);
      if (!checkCollision(feetX)) {
          ent.x = nextX;
      }

      // Y Axis
      const feetY = getFeetRect(ent.x, nextY); // Use updated X if it moved
      if (!checkCollision(feetY)) {
          ent.y = nextY;
      }
  }

  checkWallCollision(ent: Entity): boolean {
      // Simplified for projectiles - strict center point check is usually fine for bullets
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

      // STRICT Collision Check: Player must overlap with door physically
      const cx = w / 2;
      const cy = h / 2;
      const doorSpan = ts * 1.5; 
      
      const pCx = p.x + p.w / 2;
      const pCy = p.y + p.h / 2;

      // UP (must overlap horizontally with center)
      if (doors.UP && p.y < ts && Math.abs(pCx - cx) < doorSpan) { 
          triggerDir = Direction.UP; nextY--; 
      }
      // DOWN
      if (doors.DOWN && p.y > h - ts - p.h && Math.abs(pCx - cx) < doorSpan) { 
          triggerDir = Direction.DOWN; nextY++; 
      }
      // LEFT (must overlap vertically with center)
      if (doors.LEFT && p.x < ts && Math.abs(pCy - cy) < doorSpan) { 
          triggerDir = Direction.LEFT; nextX--; 
      }
      // RIGHT
      if (doors.RIGHT && p.x > w - ts - p.w && Math.abs(pCy - cy) < doorSpan) { 
          triggerDir = Direction.RIGHT; nextX++; 
      }

      if (triggerDir) {
          const nextRoom = this.dungeon.find(r => r.x === nextX && r.y === nextY);
          // Only enter if the next room exists (Strict door logic)
          if (nextRoom) {
              // Pass the TRIGGER direction (Movement direction)
              this.enterRoom(nextRoom, triggerDir);
          }
      }
  }

  draw() {
      // Clear with Palette BG
      this.ctx.fillStyle = CONSTANTS.PALETTE.BG;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      if (!this.currentRoom) return;

      const ts = CONSTANTS.TILE_SIZE;
      const map = this.currentRoom.layout;

      const visualMap = carveDoors(map.map(r => [...r]), this.currentRoom.cleared ? this.currentRoom.doors : {});

      // --- Draw Map ---
      const wallImg = this.assets.get('WALL');
      const floorImg = this.assets.get('FLOOR');
      const rockImg = this.assets.get('ROCK');

      for (let r = 0; r < visualMap.length; r++) {
          for (let c = 0; c < visualMap[0].length; c++) {
              const tile = visualMap[r][c];
              const x = c * ts;
              const y = r * ts;

              // Draw Floor everywhere first
              if (floorImg) this.ctx.drawImage(floorImg, x, y);

              if (tile === 1 && wallImg) { // Wall
                  this.ctx.drawImage(wallImg, x, y);
              } else if (tile === 2 && rockImg) { // Rock
                  // Check OBSTACLES config if we want specific rock behavior, but simple drawing is fine
                  this.ctx.drawImage(rockImg, x, y);
              } else if (tile === 3) { // Door floor (Open)
                  // Floor already drawn
                  this.ctx.fillStyle = CONSTANTS.PALETTE.DOOR_OPEN;
                  this.ctx.globalAlpha = 0.5;
                  this.ctx.fillRect(x, y, ts, ts);
                  this.ctx.globalAlpha = 1.0;
              }
          }
      }

      // --- Draw Doors Logic ---
      const doors = this.currentRoom.doors;
      const cx = Math.floor(visualMap[0].length / 2) * ts;
      const cy = Math.floor(visualMap.length / 2) * ts;

      // Draw Door Locks (if not cleared)
      if (!this.currentRoom.cleared) {
          this.ctx.fillStyle = CONSTANTS.PALETTE.DOOR_LOCKED;
          
          if(doors.UP) this.ctx.fillRect(cx, 0, ts, ts);
          if(doors.DOWN) this.ctx.fillRect(cx, this.canvas.height - ts, ts, ts);
          if(doors.LEFT) this.ctx.fillRect(0, cy, ts, ts);
          if(doors.RIGHT) this.ctx.fillRect(this.canvas.width - ts, cy, ts, ts);
          
          // Add Cross detail
          this.ctx.fillStyle = '#111';
          const inset = 12;
          const rect = (x:number, y:number) => this.ctx.fillRect(x+inset, y+inset, ts-inset*2, ts-inset*2);
          if(doors.UP) rect(cx, 0);
          if(doors.DOWN) rect(cx, this.canvas.height - ts);
          if(doors.LEFT) rect(0, cy);
          if(doors.RIGHT) rect(this.canvas.width - ts, cy);
      }

      // Draw Arrows
      this.ctx.save();
      this.ctx.globalAlpha = 0.5;
      this.ctx.fillStyle = '#FFFFFF';
      const arrowSize = 10;
      
      const drawArrow = (x: number, y: number, rot: number) => {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(rot);
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-arrowSize, arrowSize);
        this.ctx.lineTo(arrowSize, arrowSize);
        this.ctx.fill();
        this.ctx.restore();
      }

      if (doors.UP) drawArrow(cx + ts/2, 10, 0);
      if (doors.DOWN) drawArrow(cx + ts/2, this.canvas.height - 10, Math.PI);
      if (doors.LEFT) drawArrow(10, cy + ts/2, -Math.PI/2);
      if (doors.RIGHT) drawArrow(this.canvas.width - 10, cy + ts/2, Math.PI/2);
      this.ctx.restore();


      // --- Draw Entities ---
      // Draw PEDESTALS first (bottom layer)
      this.entities.filter(e => e.type === EntityType.PEDESTAL).forEach(e => {
          const img = this.assets.get('PEDESTAL');
          if (img) this.ctx.drawImage(img, e.x, e.y, e.w, e.h);
      });

      [...this.entities, this.player].forEach(e => {
          // Skip PEDESTAL as handled above
          if (e.type === EntityType.PEDESTAL) return;

          let spriteKey = '';
          
          // Match Entity Type to Asset
          if (e.type === EntityType.PLAYER) {
              // Map character ID to sprite via config lookup if possible, 
              // BUT to avoid slow lookups every frame, we rely on the `createPlayer` 
              // selecting a visual strategy.
              // For now, we look up the character config based on ID stored in player?
              // The player object doesn't store 'characterId'. 
              // Let's modify logic: The `GameEngine` knows `this.characterId`.
              // We can find the sprite from config.
              const charConfig = CHARACTERS.find(c => c.id === this.characterId);
              spriteKey = charConfig ? charConfig.sprite : 'PLAYER';
          }
          else if (e.type === EntityType.ITEM) {
               // Map item type to sprite via config (simplified)
               const conf = ITEMS.find(i => i.type === (e as ItemEntity).itemType) || DROPS.find(d => d.type === (e as ItemEntity).itemType);
               spriteKey = conf ? conf.sprite : 'ITEM';
          }
          else if (e.type === EntityType.PROJECTILE) {
              const p = e as ProjectileEntity;
              spriteKey = p.ownerId === 'player' ? 'PROJ_PLAYER' : 'PROJ_ENEMY';
          }
          else if (e.type === EntityType.ENEMY) {
              // Map enemy type to sprite via config
              const en = e as EnemyEntity;
              const conf = ENEMIES.find(x => x.type === en.enemyType) || BOSSES.find(x => x.type === en.enemyType);
              spriteKey = conf ? conf.sprite : 'ENEMY_CHASER';
          }

          if (spriteKey) {
              const isInvincible = e.type === EntityType.PLAYER && (e as PlayerEntity).invincibleTimer > 0;
              const isFlashing = e.flashTimer && e.flashTimer > 0;

              // Check if we should draw the Flash variant
              let useFlash = false;
              if (isInvincible || isFlashing) {
                  if (isFlashing || (isInvincible && Math.floor((e as PlayerEntity).invincibleTimer / 4) % 2 === 0)) {
                      useFlash = true;
                  }
              }

              const img = this.assets.get(useFlash ? spriteKey + '_FLASH' : spriteKey) || this.assets.get(spriteKey);

              if (img) {
                  if (useFlash) {
                       this.ctx.globalAlpha = 0.8; // Slightly transparent white flash
                       this.ctx.drawImage(img, e.x, e.y, e.w, e.h);
                       this.ctx.globalAlpha = 1.0;
                  } else {
                       this.ctx.drawImage(img, e.x, e.y, e.w, e.h);
                  }
              }

              // Draw Boss HP Bar
              if (e.type === EntityType.ENEMY && (e as EnemyEntity).enemyType === EnemyType.BOSS) {
                 this.ctx.fillStyle = 'red';
                 this.ctx.fillRect(e.x, e.y - 10, e.w * ((e as EnemyEntity).hp / (e as EnemyEntity).maxHp), 5);
              }
          } else if (e.type === EntityType.TRAPDOOR) {
              this.ctx.fillStyle = CONSTANTS.PALETTE.DOOR_LOCKED;
              this.ctx.fillRect(e.x, e.y, e.w, e.h);
              this.ctx.fillStyle = '#000';
              this.ctx.fillRect(e.x + 4, e.y + 4, e.w - 8, e.h - 8);
          } else {
             // Fallback
             this.ctx.fillStyle = e.color;
             this.ctx.fillRect(e.x, e.y, e.w, e.h);
          }
      });
      
      // Draw Restart Overlay
      if (this.restartTimer > 0) {
           this.ctx.save();
           this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
           this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
           
           // Bar
           const maxW = 200;
           const h = 10;
           const pct = Math.min(this.restartTimer / 60, 1);
           
           this.ctx.fillStyle = '#333';
           this.ctx.fillRect(this.canvas.width/2 - maxW/2, this.canvas.height/2 + 10, maxW, h);
           this.ctx.fillStyle = '#ef4444'; 
           this.ctx.fillRect(this.canvas.width/2 - maxW/2, this.canvas.height/2 + 10, maxW * pct, h);
           
           this.ctx.restore();
      }
  }
}