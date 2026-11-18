// On-foot shooting: mouse aim, pistol, muzzle flash, hits on cars & peds.
import { crimeAt } from './police.js';
import { killPed } from './pedestrians.js';

export function createCombat() {
  return { bullets: [], cooldown: 0, flash: 0, shotsFired: 0 };
}
export function tryShoot(game, dt) {
  const c = game.combat, p = game.player;
  c.cooldown -= dt; c.flash = Math.max(0, c.flash - dt * 9);
  if (p.inCar || game.state !== 'playing') return;
  if (game.mouse.down && c.cooldown <= 0) {
    c.cooldown = 0.16; c.flash = 1; c.shotsFired++;
    const wx = game.camera.x + game.mouse.x, wy = game.camera.y + game.mouse.y;
    const a = Math.atan2(wy - p.y, wx - p.x);
    p.angle = a;
    c.bullets.push({ x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14, vx: Math.cos(a) * 950, vy: Math.sin(a) * 950, life: 0.55 });
    game.audio.shot();
    game.danger = { x: p.x, y: p.y, active: true, timer: 1.2 };
    crimeAt(game, 6, p.x, p.y);
  }
}
export function updateBullets(game, dt) {
  const c = game.combat;
  for (const b of c.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    for (const ped of game.peds) {
      if (ped.alive && Math.hypot(ped.x - b.x, ped.y - b.y) < 10) {
        killPed(ped); b.dead = true; crimeAt(game, 16, ped.x, ped.y);
        game.notify('You shot a pedestrian!', '#ff5a5a'); break;
      }
    }
    if (b.dead) continue;
    for (const car of game.cars) {
      if (Math.abs(car.x - b.x) < 24 && Math.abs(car.y - b.y) < 16) {
        car.health -= 14; b.dead = true;
        if (car.kind === 'traffic' || car.kind === 'parked') { car.kind = car.kind; }
        game.audio.crash(false);
        crimeAt(game, 5, car.x, car.y);
        if (car.health <= 0 && car.kind !== 'police') { car.health = 8; }
        break;
      }
    }
    for (const col of game.city.colliders) {
      if (b.x > col.x && b.x < col.x + col.w && b.y > col.y && b.y < col.y + col.h) { b.dead = true; break; }
    }
  }
  c.bullets = c.bullets.filter((b) => !b.dead);
}
export function drawCombat(ctx, game, cam) {
  const p = game.player;
  // muzzle flash
  if (game.combat.flash > 0 && !p.inCar) {
    const sx = p.x - cam.x + Math.cos(p.angle) * 16, sy = p.y - cam.y + Math.sin(p.angle) * 16;
    ctx.fillStyle = 'rgba(255,190,60,' + (0.55 * game.combat.flash) + ')';
    ctx.beginPath(); ctx.arc(sx, sy, 10 * game.combat.flash + 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 2;
  for (const b of game.combat.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - cam.x, b.y - cam.y);
    ctx.lineTo(b.x - cam.x - b.vx * 0.016, b.y - cam.y - b.vy * 0.016);
    ctx.stroke();
  }
  // crosshair
  if (!p.inCar && game.state === 'playing') {
    const mx = game.mouse.x, my = game.mouse.y;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - 13, my); ctx.lineTo(mx - 4, my); ctx.moveTo(mx + 4, my); ctx.lineTo(mx + 13, my);
    ctx.moveTo(mx, my - 13); ctx.lineTo(mx, my - 4); ctx.moveTo(mx, my + 4); ctx.lineTo(mx, my + 13);
    ctx.stroke();
  }
}
