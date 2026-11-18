// Pedestrians: stroll sidewalks, cross streets, flee from danger.
import { ROADS_X, ROADS_Y, ROAD_W, WORLD_W, WORLD_H, PED_COLORS } from './config.js';
import { pick, randRange, clamp } from './random.js';
import { collideRects } from './city.js';

export function spawnPeds(rng, city, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const onXRoad = rng() > 0.5;
    const rx = pick(rng, ROADS_X), ry = pick(rng, ROADS_Y);
    let x, y;
    if (onXRoad) { x = rx + (rng() > 0.5 ? ROAD_W / 2 + 16 : -ROAD_W / 2 - 16); y = randRange(rng, 60, WORLD_H - 60); }
    else { y = ry + (rng() > 0.5 ? ROAD_W / 2 + 16 : -ROAD_W / 2 - 16); x = randRange(rng, 60, WORLD_W - 420); }
    if (collideRects(x, y, 8, city.colliders)) continue;
    peds.push({
      x, y, angle: randRange(rng, 0, Math.PI * 2), speed: randRange(rng, 34, 62),
      color: pick(rng, PED_COLORS), skin: pick(rng, ['#f1c27d', '#e0ac69', '#8d5524', '#ffdbac']),
      state: 'walk', alive: true, fallTimer: 0, target: null, waitTimer: randRange(rng, 0, 2),
      legPhase: randRange(rng, 0, 6),
    });
  }
  return peds;
}
function newTarget(ped, rng) {
  // walk along sidewalks: pick a point up/down the current sidewalk or across a crossing
  const along = randRange(rng, -320, 320);
  const cross = rng() < 0.22;
  if (Math.abs(Math.cos(ped.angle)) > 0.7 || ped.axis === 'x') {
    ped.target = { x: clamp(ped.x + along, 40, WORLD_W - 360), y: ped.y + (cross ? (rng() > 0.5 ? 150 : -150) : randRange(rng, -8, 8)) };
    ped.axis = 'x';
  } else {
    ped.target = { x: ped.x + (cross ? (rng() > 0.5 ? 150 : -150) : randRange(rng, -8, 8)), y: clamp(ped.y + along, 40, WORLD_H - 40) };
    ped.axis = 'y';
  }
}
export function updatePed(ped, dt, rng, game) {
  if (!ped.alive) { ped.fallTimer += dt; return; }
  const dangerX = game.danger ? game.danger.x : -9999, dangerY = game.danger ? game.danger.y : -9999;
  const dDanger = Math.hypot(ped.x - dangerX, ped.y - dangerY);
  if (dDanger < 130 && game.danger.active) ped.state = 'flee';
  if (ped.state === 'flee') {
    if (dDanger > 240) ped.state = 'walk';
    const a = Math.atan2(ped.y - dangerY, ped.x - dangerX);
    ped.angle = a;
    move(ped, 165, dt, game);
    return;
  }
  ped.waitTimer -= dt;
  if (ped.waitTimer > 0) return;
  if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 12) {
    if (rng() < 0.2) { ped.waitTimer = randRange(rng, 0.6, 2.4); ped.target = null; return; }
    newTarget(ped, rng);
  }
  ped.angle = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
  move(ped, ped.speed, dt, game);
}
function move(ped, speed, dt, game) {
  const nx = ped.x + Math.cos(ped.angle) * speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * speed * dt;
  if (!collideRects(nx, ny, 7, game.city.colliders)) { ped.x = nx; ped.y = ny; }
  else { ped.target = null; ped.angle += 2.2; }
  ped.x = clamp(ped.x, 20, WORLD_W - 160); ped.y = clamp(ped.y, 20, WORLD_H - 20);
  ped.legPhase += dt * speed * 0.12;
}
export function killPed(ped) { ped.alive = false; ped.fallTimer = 0; }
export function drawPed(ctx, ped, cam) {
  const sx = ped.x - cam.x, sy = ped.y - cam.y;
  if (sx < -30 || sy < -30 || sx > 1310 || sy > 830) return;
  ctx.save(); ctx.translate(sx, sy);
  if (!ped.alive) {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.color; ctx.fillRect(-4, -9, 8, 18);
    ctx.fillStyle = ped.skin; ctx.beginPath(); ctx.arc(0, -12, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(160,20,20,0.55)'; ctx.beginPath(); ctx.ellipse(0, 2, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); return;
  }
  const bob = Math.sin(ped.legPhase) * 1.6;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 6, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  // legs
  ctx.strokeStyle = '#2d3436'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(Math.sin(ped.legPhase) * 4, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(-Math.sin(ped.legPhase) * 4, 7); ctx.stroke();
  // body + head
  ctx.fillStyle = ped.color; ctx.fillRect(-4.5, -5 + bob * 0.3, 9, 8);
  ctx.fillStyle = ped.skin; ctx.beginPath(); ctx.arc(0, -8 + bob * 0.3, 4.6, 0, Math.PI * 2); ctx.fill();
  if (ped.state === 'flee') {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('!', 0, -18);
  }
  ctx.restore();
}
