import { CONSTANTS } from './constants';
import { Room, Direction } from './types';
import { SeededRNG } from './utils';

const GRID_SIZE = 10; // Virtual grid for dungeon layout
const RW = 15; // Room Width in tiles
const RH = 9;  // Room Height in tiles

const copyLayout = (template: number[][]) => template.map(row => [...row]);

// Basic Empty Template (Walls around, floor inside)
const createEmptyTemplate = () => {
  const map: number[][] = [];
  for (let y = 0; y < RH; y++) {
    const row: number[] = [];
    for (let x = 0; x < RW; x++) {
      if (y === 0 || y === RH - 1 || x === 0 || x === RW - 1) {
        row.push(1); // Wall
      } else {
        row.push(0); // Floor
      }
    }
    map.push(row);
  }
  return map;
};

// Procedurally generate a layout that guarantees topological connectivity
const generateProceduralLayout = (rng: SeededRNG, doors: Room['doors']): number[][] => {
  const maxAttempts = 5;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const layout = createEmptyTemplate();
    
    // 1. Place Random Obstacles
    // Density: 10% to 20% coverage
    const density = rng.range(0.1, 0.2); 
    const obstaclesToPlace = Math.floor((RW-2) * (RH-2) * density);
    
    for (let i = 0; i < obstaclesToPlace; i++) {
        const x = rng.rangeInt(1, RW - 2);
        const y = rng.rangeInt(1, RH - 2);
        layout[y][x] = 2; // Rock
    }

    // 2. Clear Critical Areas (Center + Doors)
    const clearRadius = (cx: number, cy: number, r: number) => {
        for(let dy = -r; dy <= r; dy++) {
            for(let dx = -r; dx <= r; dx++) {
                const py = cy + dy;
                const px = cx + dx;
                if(py > 0 && py < RH-1 && px > 0 && px < RW-1) {
                    layout[py][px] = 0;
                }
            }
        }
    };

    const cx = Math.floor(RW/2);
    const cy = Math.floor(RH/2);
    
    clearRadius(cx, cy, 1); // Clear center spawn
    if (doors.UP) clearRadius(cx, 1, 1);
    if (doors.DOWN) clearRadius(cx, RH-2, 1);
    if (doors.LEFT) clearRadius(1, cy, 1);
    if (doors.RIGHT) clearRadius(RW-2, cy, 1);

    // 3. Flood Fill Validation
    // Can we reach all active doors from the center?
    const q: {x:number, y:number}[] = [{x: cx, y: cy}];
    const visited = new Set<string>();
    visited.add(`${cx},${cy}`);
    
    let reachableDoors = 0;
    const requiredDoors = (doors.UP?1:0) + (doors.DOWN?1:0) + (doors.LEFT?1:0) + (doors.RIGHT?1:0);

    const isDoorPos = (x: number, y: number) => {
        if (doors.UP && x === cx && y === 1) return true;
        if (doors.DOWN && x === cx && y === RH-2) return true;
        if (doors.LEFT && x === 1 && y === cy) return true;
        if (doors.RIGHT && x === RW-2 && y === cy) return true;
        return false;
    };

    while (q.length > 0) {
        const curr = q.shift()!;
        
        if (isDoorPos(curr.x, curr.y)) {
            reachableDoors++;
        }

        const dirs = [{x:0, y:1}, {x:0, y:-1}, {x:1, y:0}, {x:-1, y:0}];
        for (const d of dirs) {
            const nx = curr.x + d.x;
            const ny = curr.y + d.y;
            
            // Bounds check (inside walls)
            if (nx > 0 && nx < RW-1 && ny > 0 && ny < RH-1) {
                if (layout[ny][nx] !== 2 && !visited.has(`${nx},${ny}`)) {
                    visited.add(`${nx},${ny}`);
                    q.push({x: nx, y: ny});
                }
            }
        }
    }

    if (reachableDoors === requiredDoors) {
        return layout;
    }
  }

  // Fallback: Empty Room
  return createEmptyTemplate();
}

export const generateDungeon = (floorLevel: number, seed: number, targetRoomCount: number): Room[] => {
  const rng = new SeededRNG(seed);
  const rooms: Room[] = [];
  
  // Start at center
  const startX = Math.floor(GRID_SIZE / 2);
  const startY = Math.floor(GRID_SIZE / 2);
  
  const occupied = new Set<string>();
  const queue: {x: number, y: number, dist: number}[] = [{x: startX, y: startY, dist: 0}];
  occupied.add(`${startX},${startY}`);

  const createdRooms: {x: number, y: number, type: Room['type'], dist: number}[] = [];

  // Simple BFS/Random Walk hybrid to generate layout
  while (createdRooms.length < targetRoomCount && queue.length > 0) {
    const current = queue.shift()!;
    createdRooms.push({ ...current, type: 'NORMAL' });

    // Try to expand in random directions
    const directions = [
      { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }
    ].sort(() => rng.next() - 0.5);

    for (const dir of directions) {
      if (createdRooms.length >= targetRoomCount) break;
      
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const key = `${nx},${ny}`;

      if (!occupied.has(key) && rng.next() > 0.3) {
        occupied.add(key);
        const nextRoom = { x: nx, y: ny, dist: current.dist + 1 };
        queue.push(nextRoom);
        // Sometimes re-add current to queue to create branching
        if(rng.next() > 0.5) queue.push(current);
      }
    }
  }

  // Assign Special Rooms
  // Start Room
  createdRooms[0].type = 'START';
  
  // Boss Room (Furthest away)
  const furthest = createdRooms.reduce((prev, curr) => curr.dist > prev.dist ? curr : prev, createdRooms[0]);
  furthest.type = 'BOSS';

  // Item Room (Random non-start, non-boss)
  const candidates = createdRooms.filter(r => r.type === 'NORMAL');
  if (candidates.length > 0) {
    const itemRoom = candidates[Math.floor(rng.next() * candidates.length)];
    itemRoom.type = 'ITEM';
  }

  // Use a Set of valid room coordinates to strictly determine neighbors
  const validRoomCoords = new Set(createdRooms.map(r => `${r.x},${r.y}`));

  // Convert to Full Room Objects with Doors
  createdRooms.forEach(cr => {
    // Check neighbors using the VALID rooms list
    const doors: Room['doors'] = {};
    const hasNeighbor = (dx: number, dy: number) => 
      validRoomCoords.has(`${cr.x + dx},${cr.y + dy}`);

    if (hasNeighbor(0, -1)) doors[Direction.UP] = true;
    if (hasNeighbor(0, 1)) doors[Direction.DOWN] = true;
    if (hasNeighbor(-1, 0)) doors[Direction.LEFT] = true;
    if (hasNeighbor(1, 0)) doors[Direction.RIGHT] = true;

    // Generate Layout
    let layout: number[][];
    if (cr.type === 'START' || cr.type === 'BOSS' || cr.type === 'ITEM') {
        layout = createEmptyTemplate(); // Start/Boss/Item usually clear
    } else {
        // Procedural Topology for Normal Rooms
        layout = generateProceduralLayout(rng, doors);
    }

    rooms.push({
      x: cr.x,
      y: cr.y,
      type: cr.type,
      doors,
      cleared: cr.type === 'START', // Start is safe
      itemCollected: false,
      layout,
      visited: false,
      seed: rng.next() * 1000000 // Unique seed for this room
    });
  });

  return rooms;
};

// Helper to carve doors into the tile layout
export const carveDoors = (layout: number[][], doors: Room['doors']) => {
  const h = layout.length;
  const w = layout[0].length;
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  // Door format: set tile to 0 (floor) and maybe a special ID for physics
  if (doors.UP) { layout[0][cx] = 3; layout[0][cx-1] = 3; layout[0][cx+1] = 3; }
  if (doors.DOWN) { layout[h-1][cx] = 3; layout[h-1][cx-1] = 3; layout[h-1][cx+1] = 3; }
  if (doors.LEFT) { layout[cy][0] = 3; layout[cy-1][0] = 3; layout[cy+1][0] = 3; }
  if (doors.RIGHT) { layout[cy][w-1] = 3; layout[cy-1][w-1] = 3; layout[cy+1][w-1] = 3; }
  
  // 3 is internally used as "Doorway Floor" to distinguish from normal floor
  return layout;
};