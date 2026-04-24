import type { FruitLevel } from "./fruits";
import { FRUITS } from "./fruits";

export interface Body {
  id: number;
  level: FruitLevel;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  resting: number;
  bornAt: number;
  justMerged: number;
}

export interface MergeEvent {
  x: number;
  y: number;
  from: FruitLevel;
  to: FruitLevel;
}

export interface WorldState {
  width: number;
  height: number;
  bodies: Body[];
  gravity: number;
  wallBounce: number;
  floorBounce: number;
  friction: number;
  nextId: number;
}

export interface ClearedBody {
  level: FruitLevel;
  x: number;
  y: number;
}

const ITERATIONS = 5;

export function createWorld(width: number, height: number): WorldState {
  return {
    width,
    height,
    bodies: [],
    gravity: 1800,
    wallBounce: 0.18,
    floorBounce: 0.08,
    friction: 0.992,
    nextId: 1
  };
}

export function resizeWorld(world: WorldState, width: number, height: number) {
  const previousWidth = world.width;
  const previousHeight = world.height;
  const scaleX = width / previousWidth;
  const scaleY = height / previousHeight;

  world.width = width;
  world.height = height;

  for (const body of world.bodies) {
    body.x *= scaleX;
    body.y *= scaleY;
    body.radius = FRUITS[body.level].radius * Math.min(width / 390, height / 720) * 1.02;
    body.x = clamp(body.x, body.radius, width - body.radius);
    body.y = clamp(body.y, body.radius, height - body.radius);
  }
}

export function createBody(level: FruitLevel, x: number, y: number, scale: number, id: number): Body {
  return {
    id,
    level,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: FRUITS[level].radius * scale,
    resting: 0,
    bornAt: performance.now(),
    justMerged: 0
  };
}

export function addBody(world: WorldState, body: Body) {
  world.bodies.push(body);
}

export function removeAllBodies(world: WorldState) {
  world.bodies = [];
  world.nextId = 1;
}

export function stepWorld(world: WorldState, dt: number, now: number): MergeEvent[] {
  const delta = Math.min(dt, 1 / 30);
  const merges: MergeEvent[] = [];

  for (const body of world.bodies) {
    body.vy += world.gravity * delta;
    body.x += body.vx * delta;
    body.y += body.vy * delta;
    body.vx *= world.friction;

    if (body.x - body.radius < 0) {
      body.x = body.radius;
      body.vx = Math.abs(body.vx) * world.wallBounce;
    } else if (body.x + body.radius > world.width) {
      body.x = world.width - body.radius;
      body.vx = -Math.abs(body.vx) * world.wallBounce;
    }

    if (body.y + body.radius > world.height) {
      body.y = world.height - body.radius;
      body.vy = -Math.abs(body.vy) * world.floorBounce;
      body.vx *= 0.98;
    }
  }

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    for (let i = 0; i < world.bodies.length; i += 1) {
      for (let j = i + 1; j < world.bodies.length; j += 1) {
        const a = world.bodies[i];
        const b = world.bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.0001;
        const minDistance = a.radius + b.radius;

        if (distance >= minDistance) {
          continue;
        }

        const overlap = minDistance - distance;
        const nx = dx / distance;
        const ny = dy / distance;
        const push = overlap * 0.5;

        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;

        const relativeVelocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relativeVelocity < 0) {
          const impulse = -relativeVelocity * 0.14;
          a.vx -= nx * impulse;
          a.vy -= ny * impulse;
          b.vx += nx * impulse;
          b.vy += ny * impulse;
        }

        a.x = clamp(a.x, a.radius, world.width - a.radius);
        b.x = clamp(b.x, b.radius, world.width - b.radius);
        a.y = clamp(a.y, a.radius, world.height - a.radius);
        b.y = clamp(b.y, b.radius, world.height - b.radius);
      }
    }
  }

  const removed = new Set<number>();
  const added: Body[] = [];

  for (let i = 0; i < world.bodies.length; i += 1) {
    const a = world.bodies[i];
    if (removed.has(a.id)) {
      continue;
    }

    for (let j = i + 1; j < world.bodies.length; j += 1) {
      const b = world.bodies[j];
      if (removed.has(b.id) || a.level !== b.level || a.level >= 8) {
        continue;
      }

      if (now - a.bornAt < 140 || now - b.bornAt < 140 || now - a.justMerged < 120 || now - b.justMerged < 120) {
        continue;
      }

      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const mergeDistance = a.radius + b.radius + Math.max(2, a.radius * 0.06);
      if (distance > mergeDistance) {
        continue;
      }

      removed.add(a.id);
      removed.add(b.id);

      const nextLevel = (a.level + 1) as FruitLevel;
      const centerX = (a.x + b.x) * 0.5;
      const centerY = (a.y + b.y) * 0.5;
      const newBody = createBody(nextLevel, centerX, centerY, world.width / 390, world.nextId++);
      newBody.vx = (a.vx + b.vx) * 0.22;
      newBody.vy = Math.min((a.vy + b.vy) * 0.18 - 180, 120);
      newBody.justMerged = now;
      added.push(newBody);
      merges.push({ x: centerX, y: centerY, from: a.level, to: nextLevel });
      break;
    }
  }

  if (removed.size > 0) {
    world.bodies = world.bodies.filter((body) => !removed.has(body.id));
    world.bodies.push(...added);
  }

  for (const body of world.bodies) {
    if (Math.abs(body.vy) < 20 && body.y + body.radius >= world.height - 1) {
      body.resting += delta;
    } else {
      body.resting = 0;
    }
  }

  return merges;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function clearBodiesInRadius(
  world: WorldState,
  x: number,
  y: number,
  radius: number,
  predicate: (body: Body) => boolean
): ClearedBody[] {
  const removed: ClearedBody[] = [];
  world.bodies = world.bodies.filter((body) => {
    const inRadius = Math.hypot(body.x - x, body.y - y) <= radius + body.radius;
    if (!inRadius || !predicate(body)) {
      return true;
    }

    removed.push({
      level: body.level,
      x: body.x,
      y: body.y
    });
    return false;
  });

  return removed;
}
