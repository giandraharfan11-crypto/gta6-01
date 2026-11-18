// Wanted system 0-5 stars, police pursuit AI, busted / wasted resolution.
import { TUNING, WORLD_W, WORLD_H } from './config.js';
import { clamp, angleLerp } from './random.js';
import { makeCar } from './vehicles.js';
import { collideRects } from './city.js';

export function createPoliceSystem() {
  return {
    wanted: 0, heat: 0, seenTimer: 0, hiddenTimer: 0, busted: 0,
    spawnTimer: 0, cops: [],
    addHeat(n, game) {
      this.heat += n;
      const lvl = this.heat >= 90 ? 5 : this.heat >= 60 ? 4 : this.heat >= 38 ? 3 : this.heat >= 20 ? 2 : this.heat >= 7 ? 1 : 0;
      if (lvl > this.wanted) { this.wanted = lvl; if (game) game.notify('Wanted level: ' + '★'.repeat(lvl), '#ff5a5a'); }
    },
    clear() { this.wanted = 0; this.heat = 0; this.busted = 0; for (const c of this.cops) c.dead = true; this.cops = []; },
  };
}
function policeVisibleToPlayer(game) {
  for (const c of game.police.cops) if (Math.hypot(c.x - game.player.x, c.y - game.player.y) < 620) return true;
  return false;
}
export function updatePolice(game, dt) {
  const ps = game.police, p = game.player;
  const px = p.inCar ? p.car.x : p.x, py = p.inCar ? p.car.y : p.y;
  // visibility: any cop within 460 counts as "seen"
  let seen = false; let nearest = Infinity;
  for (const c of ps.cops) {
    const d = Math.hypot(c.x - px, c.y - py);
    if (d < 460) seen = true;
    if (d < nearest) nearest = d;
  }
  if (seen) { ps.hiddenTimer = 0; ps.seenTimer += dt; }
  else if (ps.wanted > 0) {
    ps.hiddenTimer += dt;
    if (ps.hiddenTimer > TUNING.wantedDecay) {
      ps.hiddenTimer = 0; ps.heat = Math.max(0, ps.heat - 14);
      ps.wanted = Math.max(0, ps.wanted - 1);
      if (ps.wanted === 0) { ps.heat = 0; game.notify('You lost the cops.', '#7bed9f'); }
      else game.notify('Heat cooling… ' + '★'.repeat(ps.wanted), '#a4b0be');
    }
  }
  // spawn cops up to wanted count+1, off-screen near player
  ps.spawnTimer -= dt;
  const wantCops = ps.wanted === 0 ? 0 : ps.wanted + 1;
  if (ps.cops.length < wantCops && ps.spawnTimer <= 0) {
    ps.spawnTimer = 1.6;
    const a = Math.random() * Math.PI * 2;
    const sx = clamp(px + Math.cos(a) * 720, 60, WORLD_W - 320);
    const sy = clamp(py + Math.sin(a) * 520, 60, WORLD_H - 60);
    if (!collideRects(sx, sy, 24, game.city.colliders)) {
      const cop = makeCar(sx, sy, a + Math.PI, '#eef2f5', 'police');
      ps.cops.push(cop); game.cars.push(cop);
    }
  }
  // despawn far cops when wanted is 0
  if (ps.wanted === 0 && ps.cops.length) {
    for (const c of ps.cops) if (Math.hypot(c.x - px, c.y - py) > 900) c.dead = true;
  }
  ps.cops = ps.cops.filter((c) => !c.dead);
  // pursuit steering
  const pSpeed = p.inCar ? Math.abs(p.car.speed) : (p.moving ? 120 : 0);
  for (const cop of ps.cops) {
    const d = Math.hypot(px - cop.x, py - cop.y);
    const targetAngle = Math.atan2(py - cop.y, px - cop.x);
    // aim slightly ahead of the player
    const lead = clamp(d / 300, 0, 0.5);
    const tx = px + (p.inCar ? Math.cos(p.car.angle) * Math.abs(p.car.speed) * lead * 0.4 : 0);
    const ty = py + (p.inCar ? Math.sin(p.car.angle) * Math.abs(p.car.speed) * lead * 0.4 : 0);
    cop.angle = angleLerp(cop.angle, Math.atan2(ty - cop.y, tx - cop.x), Math.min(1, dt * 3.2));
    const maxSp = TUNING.policeSpeed * (0.82 + ps.wanted * 0.05);
    const want = d > 46 ? maxSp : maxSp * 0.25;
    cop.speed += clamp(want - cop.speed, -500 * dt, 240 * dt);
    cop.brake = d < 60;
    const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
    const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
    if (collideRects(nx, ny, 20, game.city.colliders)) { cop.speed *= -0.3; cop.angle += 0.7; }
    else { cop.x = nx; cop.y = ny; }
    cop.x = clamp(cop.x, 30, WORLD_W - 30); cop.y = clamp(cop.y, 30, WORLD_H - 30);
    // ram the player's car
    if (p.inCar && Math.hypot(p.car.x - cop.x, p.car.y - cop.y) < 42) {
      if (Math.abs(cop.speed) > 140 && Math.abs(p.car.speed) < Math.abs(cop.speed)) {
        p.car.speed *= 0.86; p.car.health -= 4 * dt * 10;
        if (!cop.ramCd || cop.ramCd <= 0) { game.onCarCrash(200); cop.ramCd = 0.5; }
      }
      cop.ramCd = (cop.ramCd || 0) - dt;
    }
  }
  // busted meter: cop close + player slow
  if (ps.wanted > 0 && nearest < 95 && pSpeed < 55) {
    ps.busted += dt / TUNING.bustedTime;
    if (ps.busted >= 1) { game.onBusted(); ps.busted = 0; }
  } else ps.busted = Math.max(0, ps.busted - dt * 0.7);
  game.policeNear = policeVisibleToPlayer(game);
}
export function crimeAt(game, heat, x, y) {
  // crime only fully registers if a cop or witness ped is nearby; always partial
  let witnessed = false;
  for (const c of game.police.cops) if (Math.hypot(c.x - x, c.y - y) < 480) witnessed = true;
  for (const p of game.peds) if (p.alive && Math.hypot(p.x - x, p.y - y) < 200) witnessed = true;
  game.police.addHeat(witnessed ? heat : Math.ceil(heat * 0.45), game);
}
