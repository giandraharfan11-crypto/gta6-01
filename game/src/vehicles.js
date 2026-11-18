// Vehicles: player physics, road-network traffic AI, parked cars, car stealing.
import { ROADS_X, ROADS_Y, ROAD_W, WORLD_W, WORLD_H, CAR_COLORS, TUNING } from './config.js';
import { pick, randRange, clamp, angleLerp } from './random.js';
import { collideRects } from './city.js';

let nextId = 1;
export function makeCar(x, y, angle, color, kind = 'traffic') {
  return {
    id: nextId++, x, y, angle, speed: 0, w: 44, h: 22, color, kind,
    health: 100, dirX: Math.cos(angle), dirY: Math.sin(angle),
    targetSpeed: TUNING.trafficSpeed, brake: false, steerVis: 0,
    aiTimer: 0, stuckTimer: 0, honk: 0,
  };
}
export function laneOffset(angle) {
  // right-hand traffic: offset perpendicular to travel direction
  return { x: -Math.sin(angle) * 28, y: Math.cos(angle) * 28 };
}
function snapDir(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx) || 1, y: 0 };
  return { x: 0, y: Math.sign(dy) || 1 };
}
export function spawnTraffic(rng, city, count, playerPos) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const vertical = rng() > 0.5;
    const rx = pick(rng, ROADS_X), ry = pick(rng, ROADS_Y);
    let x, y, angle;
    if (vertical) { x = rx; y = randRange(rng, 80, WORLD_H - 80); angle = rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2; }
    else { y = ry; x = randRange(rng, 80, WORLD_W - 300); angle = rng() > 0.5 ? 0 : Math.PI; }
    const off = laneOffset(angle);
    const car = makeCar(x + off.x, y + off.y, angle, pick(rng, CAR_COLORS), 'traffic');
    car.dirX = Math.cos(angle); car.dirY = Math.sin(angle);
    car.speed = randRange(rng, 60, 130);
    if (playerPos && Math.hypot(car.x - playerPos.x, car.y - playerPos.y) < 180) continue;
    cars.push(car);
  }
  // parked cars along curbs
  for (let i = 0; i < 26; i++) {
    const vertical = rng() > 0.5;
    const rx = pick(rng, ROADS_X), ry = pick(rng, ROADS_Y);
    let x, y, angle;
    if (vertical) { x = rx + (rng() > 0.5 ? ROAD_W / 2 + 20 : -ROAD_W / 2 - 20); y = randRange(rng, 120, WORLD_H - 120); angle = Math.PI / 2; }
    else { y = ry + (rng() > 0.5 ? ROAD_W / 2 + 20 : -ROAD_W / 2 - 20); x = randRange(rng, 120, WORLD_W - 420); angle = 0; }
    if (collideRects(x, y, 26, city.colliders)) continue;
    cars.push(makeCar(x, y, angle, pick(rng, CAR_COLORS), 'parked'));
  }
  return cars;
}
function atIntersection(car) {
  for (const rx of ROADS_X) for (const ry of ROADS_Y) {
    if (Math.abs(car.x - rx) < 26 && Math.abs(car.y - ry) < 26) return { x: rx, y: ry };
  }
  return null;
}
function obstacleAhead(car, allCars, peds, player) {
  const fx = car.x + car.dirX * 62, fy = car.y + car.dirY * 62;
  for (const o of allCars) {
    if (o === car) continue;
    if (Math.hypot(o.x - fx, o.y - fy) < 34) return true;
  }
  for (const p of peds) if (p.alive && Math.hypot(p.x - fx, p.y - fy) < 26) return true;
  if (player && !player.inCar && Math.hypot(player.x - fx, player.y - fy) < 26) return true;
  if (player && player.inCar && player.car !== car && Math.hypot(player.car.x - fx, player.car.y - fy) < 36) return true;
  return false;
}
export function updateTraffic(car, dt, rng, game) {
  if (car.kind !== 'traffic') return;
  const blocked = obstacleAhead(car, game.cars, game.peds, game.player);
  car.brake = blocked;
  const want = blocked ? 0 : car.targetSpeed;
  car.speed += clamp(want - car.speed, -420 * dt, 150 * dt);
  // turn decision at intersections
  const inter = atIntersection(car);
  car.aiTimer -= dt;
  if (inter && car.aiTimer <= 0) {
    car.aiTimer = 0.7;
    const r = rng();
    if (r < 0.42) {
      // turn left or right
      const nd = r < 0.21 ? { x: car.dirY, y: -car.dirX } : { x: -car.dirY, y: car.dirX };
      car.dirX = nd.x; car.dirY = nd.y;
    }
  }
  const targetAngle = Math.atan2(car.dirY, car.dirX);
  car.angle = angleLerp(car.angle, targetAngle, Math.min(1, dt * 5));
  // gentle pull toward the correct lane of the nearest road
  const pull = 0.9;
  if (Math.abs(car.dirX) > 0.5) {
    const laneY = nearestRoadY(car.y) + (car.dirX > 0 ? 28 : -28);
    car.y += clamp((laneY - car.y) * pull, -60, 60) * dt;
  } else {
    const laneX = nearestRoadX(car.x) + (car.dirY > 0 ? -28 : 28);
    car.x += clamp((laneX - car.x) * pull, -60, 60) * dt;
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // keep on map: U-turn at edges
  if (car.x < 60 || car.x > WORLD_W - 260 || car.y < 60 || car.y > WORLD_H - 60) {
    car.dirX *= -1; car.dirY *= -1; car.aiTimer = 1;
    car.x = clamp(car.x, 60, WORLD_W - 260); car.y = clamp(car.y, 60, WORLD_H - 60);
  }
  // building collision: just stop
  if (collideRects(car.x, car.y, 20, game.city.colliders)) {
    car.x -= Math.cos(car.angle) * car.speed * dt; car.y -= Math.sin(car.angle) * car.speed * dt;
    car.speed = 0; car.dirX *= -1; car.dirY *= -1; car.aiTimer = 1.2;
  }
}
function nearestRoadX(x) { let b = ROADS_X[0], bd = Infinity; for (const r of ROADS_X) { const d = Math.abs(r - x); if (d < bd) { bd = d; b = r; } } return b; }
function nearestRoadY(y) { let b = ROADS_Y[0], bd = Infinity; for (const r of ROADS_Y) { const d = Math.abs(r - y); if (d < bd) { bd = d; b = r; } } return b; }
export function updatePlayerCar(car, input, dt, game) {
  const fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  if (fwd !== 0) car.speed += fwd * TUNING.carAccel * dt * (car.speed * fwd < 0 ? 1.9 : 1);
  else car.speed -= car.speed * (1 - Math.pow(TUNING.carFriction, dt * 60)) * 0.4;
  if (input.down && Math.abs(car.speed) < 8 && fwd < 0) car.speed = Math.max(car.speed - 140 * dt, -TUNING.carMaxReverse);
  car.speed = clamp(car.speed, -TUNING.carMaxReverse, TUNING.carMaxSpeed);
  if (Math.abs(car.speed) > 2) {
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const drift = input.handbrake ? 1.55 : 1;
    car.angle += steer * TUNING.carTurn * drift * dt * Math.sign(car.speed) * clamp(Math.abs(car.speed) / 160, 0.25, 1);
    car.steerVis = steer;
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const hit = collideRects(nx, ny, 20, game.city.colliders);
  if (hit) {
    if (Math.abs(car.speed) > 120) { game.onCarCrash(Math.abs(car.speed)); car.health -= 8; }
    car.speed *= -0.25;
  } else { car.x = nx; car.y = ny; }
  car.x = clamp(car.x, 30, WORLD_W - 30); car.y = clamp(car.y, 30, WORLD_H - 30);
  // car-vs-car bumps
  for (const o of game.cars) {
    if (o === car) continue;
    const d = Math.hypot(o.x - car.x, o.y - car.y);
    if (d < 40 && d > 0.01) {
      const push = (40 - d) / 2;
      const ax = (o.x - car.x) / d, ay = (o.y - car.y) / d;
      o.x += ax * push; o.y += ay * push;
      if (Math.abs(car.speed) > 130) { game.onCarHitCar(o); o.health -= 10; }
      car.speed *= 0.82;
    }
  }
  // run over peds (handled via game callback)
  for (const p of game.peds) {
    if (p.alive && Math.abs(car.speed) > 60 && Math.hypot(p.x - car.x, p.y - car.y) < 26) game.onRunOver(p);
  }
}
export function drawCar(ctx, car, cam, night) {
  const sx = car.x - cam.x, sy = car.y - cam.y;
  if (sx < -80 || sy < -80 || sx > 1360 || sy > 880) return;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-car.w / 2 + 3, -car.h / 2 + 4, car.w, car.h);
  // body
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 7); ctx.fill();
  // cabin
  ctx.fillStyle = car.kind === 'police' ? '#dfe6ee' : 'rgba(20,30,45,0.85)';
  roundRect(ctx, -8, -car.h / 2 + 3, 20, car.h - 6, 4); ctx.fill();
  ctx.fillStyle = 'rgba(140,200,255,0.7)'; ctx.fillRect(8, -car.h / 2 + 4, 4, car.h - 8);
  // police markings + light bar
  if (car.kind === 'police') {
    ctx.fillStyle = '#16277a'; ctx.fillRect(-car.w / 2, -3, car.w, 6);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('POLICE', 0, 2.5);
    const blink = Math.floor(performance.now() / 220) % 2 === 0;
    ctx.fillStyle = blink ? '#ff2d2d' : '#2d6bff'; ctx.fillRect(-4, -6, 8, 4);
    ctx.fillStyle = blink ? '#2d6bff' : '#ff2d2d'; ctx.fillRect(-4, 2, 8, 4);
    if (night > 0.4) {
      ctx.fillStyle = blink ? 'rgba(255,45,45,0.20)' : 'rgba(45,107,255,0.20)';
      ctx.beginPath(); ctx.arc(0, 0, 52, 0, Math.PI * 2); ctx.fill();
    }
  }
  // headlights / brake lights
  ctx.fillStyle = night > 0.35 ? '#ffe9a0' : '#fff6c9';
  ctx.fillRect(car.w / 2 - 3, -car.h / 2 + 2, 3, 5); ctx.fillRect(car.w / 2 - 3, car.h / 2 - 7, 3, 5);
  ctx.fillStyle = car.brake || car.speed < -4 ? '#ff2222' : '#7a1616';
  ctx.fillRect(-car.w / 2, -car.h / 2 + 2, 3, 5); ctx.fillRect(-car.w / 2, car.h / 2 - 7, 3, 5);
  // damage smoke
  if (car.health < 35) {
    ctx.fillStyle = 'rgba(80,80,80,0.5)';
    ctx.beginPath(); ctx.arc(car.w / 2 - 6, 0, 6 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // headlight cones at night
  if (night > 0.4 && car.kind !== 'parked') {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(car.angle);
    const g = ctx.createLinearGradient(20, 0, 130, 0);
    g.addColorStop(0, 'rgba(255,240,170,0.20)'); g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(20, -8); ctx.lineTo(130, -30); ctx.lineTo(130, 30); ctx.lineTo(20, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
