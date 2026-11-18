// Neon Harbor: Vice Run — main loop, player, camera, states, day/night, saves.
import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, TUNING, STORAGE_KEY } from './config.js';
import { mulberry32, clamp } from './random.js';
import { generateCity, drawCity, collideRects } from './city.js';
import { spawnTraffic, updateTraffic, updatePlayerCar, drawCar } from './vehicles.js';
import { spawnPeds, updatePed, drawPed, killPed } from './pedestrians.js';
import { createPoliceSystem, updatePolice, crimeAt } from './police.js';
import { createCombat, tryShoot, updateBullets, drawCombat } from './combat.js';
import { createMissionState, startMission, updateMissions, missionTarget } from './missions.js';
import { drawHUD } from './hud.js';
import { AudioSys } from './audio.js';
import { parseShot, setupShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const shot = parseShot();
const seed = shot ? shot.seed : 7;
const rng = mulberry32(seed * 1000 + 17);
const rngLive = mulberry32((Math.random() * 1e9) | 0);

const city = generateCity(mulberry32(42));
const saved = loadSave();

const game = {
  state: 'title', time: 0, timeOfDay: 0.3, night: 0,
  city, camera: { x: 0, y: 0 },
  player: {
    x: 1060, y: 790, angle: -Math.PI / 2, health: 100, inCar: false, car: null,
    moving: false, legPhase: 0, radius: 10,
  },
  cars: [], peds: [], police: createPoliceSystem(), combat: createCombat(),
  missions: createMissionState(saved.missionIdx), money: saved.money || 0,
  notifications: [], dialog: null, toast: null, danger: { x: 0, y: 0, active: false, timer: 0 },
  mouse: { x: VIEW_W / 2, y: VIEW_H / 2, down: false },
  keys: {}, audio: new AudioSys(), policeNear: false, carryMoney: false,
  shotMode: false, muted: false,
  notify(text, color = '#ffffff', dur = 3.2) {
    this.notifications.push({ text, color, timer: dur });
    if (this.notifications.length > 5) this.notifications.shift();
  },
  addMoney(n) { this.money += n; },
  saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ money: this.money, missionIdx: this.missions.idx })); } catch (e) { /* private mode */ }
  },
  onCarCrash(speed) {
    this.audio.crash(speed > 240);
    this.danger = { x: this.player.inCar ? this.player.car.x : this.player.x, y: this.player.inCar ? this.player.car.y : this.player.y, active: true, timer: 1 };
    crimeAt(this, 3, this.player.x, this.player.y);
  },
  onCarHitCar(other) {
    this.audio.crash(true);
    crimeAt(this, 6, other.x, other.y);
    if (other.isRival) this.notify('Direct hit on the rival!', '#ffd76e', 1.6);
    // traffic drivers flee the scene on foot sometimes: keep simple — car stops briefly
    other.speed *= 0.3;
  },
  onRunOver(ped) {
    killPed(ped); this.audio.crash(false);
    this.notify('You ran someone over!', '#ff5a5a');
    crimeAt(this, 18, ped.x, ped.y);
    this.danger = { x: ped.x, y: ped.y, active: true, timer: 1.4 };
  },
  onBusted() { if (this.state === 'playing') { this.state = 'busted'; this.audio.fail(); } },
};
game.cars = spawnTraffic(rng, city, 16, game.player);
game.peds = spawnPeds(rng, city, 42);
window.__game = game;

function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const s = JSON.parse(raw); return { money: s.money | 0, missionIdx: Math.min(6, s.missionIdx | 0) }; }
  } catch (e) { /* ignore */ }
  return { money: 0, missionIdx: 0 };
}

// ---------- input ----------
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'run', ShiftRight: 'run', Space: 'handbrake' };
window.addEventListener('keydown', (e) => {
  game.audio.ensure();
  if (KEYMAP[e.code]) { game.keys[KEYMAP[e.code]] = true; if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); }
  if (e.code === 'KeyM') { game.muted = !game.muted; game.audio.setMuted(game.muted); game.notify(game.muted ? 'Sound muted' : 'Sound on', '#a4b0be', 1.4); }
  if (e.code === 'KeyP' && game.state === 'playing') game.state = 'paused';
  else if (e.code === 'KeyP' && game.state === 'paused') game.state = 'playing';
  if (e.code === 'KeyE') toggleCar();
  if ((e.code === 'Enter' || e.code === 'Space') && game.state === 'title') startGame();
  if (e.code === 'Enter' && (game.state === 'busted' || game.state === 'wasted')) respawn();
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) game.keys[KEYMAP[e.code]] = false; });
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  game.mouse.x = (e.clientX - r.left) * (VIEW_W / r.width);
  game.mouse.y = (e.clientY - r.top) * (VIEW_H / r.height);
});
canvas.addEventListener('mousedown', () => { game.audio.ensure(); game.mouse.down = true; if (game.state === 'title') startGame(); else if (game.state === 'busted' || game.state === 'wasted') respawn(); });
window.addEventListener('mouseup', () => { game.mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function startGame() {
  if (game.state !== 'title') return;
  game.state = 'playing';
  if (!game.missions.done && !game.missions.started) startMission(game);
}
function respawn() {
  const wasBusted = game.state === 'busted';
  const fine = Math.floor(game.money * 0.1);
  game.money -= fine;
  game.police.clear();
  game.cars = game.cars.filter((c) => c.kind !== 'police');
  game.player.health = 100; game.player.inCar = false; game.player.car = null;
  game.player.x = 460; game.player.y = 470;
  game.carryMoney = false;
  game.state = 'playing';
  game.notify((wasBusted ? 'Bail' : 'Hospital bill') + (fine > 0 ? ' cost you $' + fine : '') + ' — back on the streets of Port Azura.', '#a4b0be', 3.5);
  game.saveProgress();
  if (!game.missions.started && !game.missions.done) startMission(game);
}
function nearestCar(x, y, maxD) {
  let best = null, bd = maxD;
  for (const c of game.cars) { const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c; } }
  return best;
}
function toggleCar() {
  if (game.state !== 'playing') return;
  const p = game.player;
  if (p.inCar) {
    const car = p.car;
    p.inCar = false; p.car = null;
    p.x = car.x - Math.sin(car.angle) * 26; p.y = car.y + Math.cos(car.angle) * 26;
    if (collideRects(p.x, p.y, 10, city.colliders)) { p.x = car.x; p.y = car.y + 30; }
    car.speed = 0; game.audio.door();
    return;
  }
  const car = nearestCar(p.x, p.y, 52);
  if (!car) return;
  const wasParked = car.kind === 'parked';
  const driverPresent = car.kind === 'traffic';
  p.inCar = true; p.car = car; car.kind = 'player'; car.brake = false;
  game.audio.door();
  if (wasParked || driverPresent) {
    // stealing: witnessed if peds/cops nearby
    let witnessed = false;
    for (const ped of game.peds) if (ped.alive && Math.hypot(ped.x - p.x, ped.y - p.y) < 190) witnessed = true;
    if (game.police.cops.length) witnessed = true;
    if (witnessed) { game.police.addHeat(9, game); game.notify('Car stolen — someone saw that!', '#ffb84d', 2.4); }
    if (driverPresent) game.notify('You yanked the driver out!', '#ffb84d', 2);
  }
  if (car.isMissionCar) game.notify('Gold coupe acquired.', '#ffd76e', 2);
}

// ---------- update ----------
function update(dt) {
  game.time += dt;
  game.timeOfDay = (game.timeOfDay + dt / TUNING.dayLength) % 1;
  const sun = Math.sin((game.timeOfDay - 0.25) * Math.PI * 2); // tod 0=midnight, 0.5=noon; sun -1..1
  game.night = clamp(0.55 - sun * 0.75, 0, 1);
  for (const n of game.notifications) n.timer -= dt;
  game.notifications = game.notifications.filter((n) => n.timer > 0);
  if (game.dialog) { game.dialog.timer -= dt; if (game.dialog.timer <= 0) game.dialog = null; }
  if (game.toast) { game.toast.timer -= dt; if (game.toast.timer <= 0) game.toast = null; }
  if (game.danger.timer > 0) { game.danger.timer -= dt; if (game.danger.timer <= 0) game.danger.active = false; }
  if (game.state !== 'playing') return;
  const p = game.player;
  if (p.inCar) {
    updatePlayerCar(p.car, { up: !!game.keys.up, down: !!game.keys.down, left: !!game.keys.left, right: !!game.keys.right, handbrake: !!game.keys.handbrake }, dt, game);
    p.x = p.car.x; p.y = p.car.y; p.angle = p.car.angle; p.moving = Math.abs(p.car.speed) > 12;
    if (p.car.health <= 0) { p.car.health = 0; p.car.speed = 0; game.notify('This car is wrecked! Find another ride. (E)', '#ff5a5a', 2.5); }
  } else {
    const dx = (game.keys.right ? 1 : 0) - (game.keys.left ? 1 : 0);
    const dy = (game.keys.down ? 1 : 0) - (game.keys.up ? 1 : 0);
    p.moving = !!(dx || dy);
    if (p.moving) {
      const sp = game.keys.run ? TUNING.playerRun : TUNING.playerWalk;
      const len = Math.hypot(dx, dy);
      const nx = p.x + (dx / len) * sp * dt, ny = p.y + (dy / len) * sp * dt;
      if (!collideRects(nx, p.y, p.radius, city.colliders)) p.x = nx;
      if (!collideRects(p.x, ny, p.radius, city.colliders)) p.y = ny;
      p.x = clamp(p.x, 16, WORLD_W - 120); p.y = clamp(p.y, 16, WORLD_H - 16);
      if (!game.mouse.down) p.angle = Math.atan2(dy, dx);
      p.legPhase += dt * sp * 0.09;
    }
    if (game.mouse.down) { const wx = game.camera.x + game.mouse.x, wy = game.camera.y + game.mouse.y; p.angle = Math.atan2(wy - p.y, wx - p.x); }
    tryShoot(game, dt);
    // cars can hurt a pedestrian player
    for (const c of game.cars) {
      if ((c.kind === 'traffic' || c.kind === 'police') && Math.abs(c.speed) > 90 && Math.hypot(c.x - p.x, c.y - p.y) < 26) {
        p.health -= 26 * dt * 3; p.x += Math.cos(c.angle) * 30 * dt; p.y += Math.sin(c.angle) * 30 * dt;
        game.audio.crash(false);
        if (p.health <= 0) { p.health = 0; game.state = 'wasted'; game.audio.fail(); }
      }
    }
  }
  updateBullets(game, dt);
  for (const c of game.cars) if (c.kind === 'traffic') updateTraffic(c, dt, rngLive, game);
  game.cars = game.cars.filter((c) => !c.dead);
  for (const ped of game.peds) updatePed(ped, dt, rngLive, game);
  game.peds = game.peds.filter((ped) => ped.alive || ped.fallTimer < 14);
  while (game.peds.length < 34) { const extra = spawnPeds(rngLive, city, 4); game.peds.push(...extra); }
  updatePolice(game, dt);
  updateMissions(game, dt);
  // slow health regen when calm
  if (game.police.wanted === 0 && p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + dt * 2.2);
  if (p.health <= 0 && game.state === 'playing') { game.state = 'wasted'; game.audio.fail(); }
  // camera follows player
  const tx = clamp((p.inCar ? p.car.x : p.x) - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  const ty = clamp((p.inCar ? p.car.y : p.y) - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  game.camera.x += (tx - game.camera.x) * Math.min(1, dt * 6);
  game.camera.y += (ty - game.camera.y) * Math.min(1, dt * 6);
  // audio
  const speedRatio = p.inCar ? p.car.speed / TUNING.carMaxSpeed : 0;
  game.audio.update(dt, speedRatio, p.inCar, game.policeNear, game.police.wanted);
  void missionTarget;
}

// ---------- render ----------
function drawPlayer(ctx2) {
  const p = game.player;
  if (p.inCar) return;
  const sx = p.x - game.camera.x, sy = p.y - game.camera.y;
  ctx2.save(); ctx2.translate(sx, sy);
  ctx2.fillStyle = 'rgba(0,0,0,0.3)'; ctx2.beginPath(); ctx2.ellipse(0, 6, 8, 3.5, 0, 0, Math.PI * 2); ctx2.fill();
  const bob = p.moving ? Math.sin(p.legPhase) * 1.8 : 0;
  ctx2.strokeStyle = '#22303c'; ctx2.lineWidth = 3.4;
  ctx2.beginPath(); ctx2.moveTo(0, 1); ctx2.lineTo(Math.sin(p.legPhase) * 4.5, 8); ctx2.stroke();
  ctx2.beginPath(); ctx2.moveTo(0, 1); ctx2.lineTo(-Math.sin(p.legPhase) * 4.5, 8); ctx2.stroke();
  ctx2.fillStyle = '#ffcf3f'; ctx2.fillRect(-5.5, -6 + bob * 0.3, 11, 9); // signature yellow shirt
  ctx2.fillStyle = '#f1c27d'; ctx2.beginPath(); ctx2.arc(0, -9 + bob * 0.3, 5.2, 0, Math.PI * 2); ctx2.fill();
  ctx2.fillStyle = '#1d2733'; ctx2.fillRect(-5, -14 + bob * 0.3, 10, 3.4); // cap
  // pistol toward aim
  ctx2.rotate(p.angle);
  ctx2.fillStyle = '#111'; ctx2.fillRect(6, -1.6, 11, 3.2);
  ctx2.restore();
  // "E" prompt near a car
  const near = nearestCar(p.x, p.y, 52);
  if (near && game.state === 'playing') {
    ctx2.fillStyle = 'rgba(10,14,22,0.75)';
    ctx2.beginPath(); ctx2.roundRect(sx - 52, sy - 44, 104, 20, 6); ctx2.fill();
    ctx2.fillStyle = '#fff'; ctx2.font = 'bold 11px system-ui'; ctx2.textAlign = 'center';
    ctx2.fillText('E — ENTER CAR', sx, sy - 30);
  }
}
function drawWorld() {
  drawCity(ctx, city, game.camera, game.night);
  // mission target beacon
  const mt = game.state === 'playing' || game.shotMode ? missionTarget(game) : null;
  if (mt) {
    const sx = mt.x - game.camera.x, sy = mt.y - game.camera.y;
    const pulse = 26 + Math.sin(game.time * 5) * 6;
    ctx.strokeStyle = 'rgba(255,215,0,0.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx, sy, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,215,0,0.16)'; ctx.beginPath(); ctx.arc(sx, sy, pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('▼', sx, sy - pulse - 8 + Math.sin(game.time * 5) * 4);
    // off-screen direction arrow
    if (sx < 30 || sx > VIEW_W - 30 || sy < 30 || sy > VIEW_H - 30) {
      const cx = VIEW_W / 2, cy = VIEW_H / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const ax = clamp(sx, 44, VIEW_W - 44), ay = clamp(sy, 44, VIEW_H - 44);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
      ctx.restore(); void cx; void cy;
    }
  }
  for (const ped of game.peds) drawPed(ctx, ped, game.camera);
  for (const c of game.cars) drawCar(ctx, c, game.camera, game.night);
  drawPlayer(ctx);
  drawCombat(ctx, game, game.camera);
  // night darkness + sunset tint
  if (game.night > 0.03) {
    ctx.fillStyle = 'rgba(8,10,40,' + (game.night * 0.34).toFixed(3) + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  const dusk = clamp(1 - Math.abs(game.night - 0.45) * 3.2, 0, 1);
  if (dusk > 0.05 && game.night > 0.1 && game.night < 0.8) {
    ctx.fillStyle = 'rgba(255,110,60,' + (dusk * 0.10).toFixed(3) + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
function bigPanel(title, lines, accent) {
  ctx.fillStyle = 'rgba(5,8,16,0.72)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = accent; ctx.font = 'bold 64px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(title, VIEW_W / 2, 268);
  ctx.fillStyle = '#fff'; ctx.font = '19px system-ui';
  lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 330 + i * 30));
}
function render() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  drawWorld();
  if (game.state === 'playing' || game.state === 'paused') drawHUD(ctx, game);
  if (game.state === 'title') {
    ctx.fillStyle = 'rgba(5,8,20,0.55)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const grad = ctx.createLinearGradient(0, 120, 0, 300);
    grad.addColorStop(0, '#ff6b9d'); grad.addColorStop(0.55, '#ffd76e'); grad.addColorStop(1, '#54c8ff');
    ctx.fillStyle = grad; ctx.font = 'bold 84px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('NEON HARBOR', VIEW_W / 2, 218);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 40px system-ui';
    ctx.fillText('— VICE RUN —', VIEW_W / 2, 272);
    ctx.font = '19px system-ui'; ctx.fillStyle = '#dfe9f5';
    ctx.fillText('Port Azura. Sun, palms, easy money — and Mama Rosa, who always collects.', VIEW_W / 2, 336);
    ctx.fillText('Work her six jobs. Steal any car. Outrun a five-star heat. Just do not get caught.', VIEW_W / 2, 366);
    ctx.fillStyle = 'rgba(10,14,22,0.8)'; ctx.beginPath(); ctx.roundRect(340, 404, 600, 128, 12); ctx.fill();
    ctx.fillStyle = '#ffd76e'; ctx.font = 'bold 16px system-ui';
    ctx.fillText('CONTROLS', VIEW_W / 2, 434);
    ctx.fillStyle = '#fff'; ctx.font = '16px system-ui';
    ctx.fillText('WASD / Arrows — move & drive      SHIFT — run      SPACE — drift', VIEW_W / 2, 464);
    ctx.fillText('E — enter / exit car      MOUSE + CLICK — shoot      P — pause      M — mute', VIEW_W / 2, 492);
    const blink = Math.floor(game.time * 1.6) % 2 === 0;
    if (blink) { ctx.fillStyle = '#7bed9f'; ctx.font = 'bold 24px system-ui'; ctx.fillText('PRESS ENTER OR CLICK TO PLAY', VIEW_W / 2, 592); }
    if (game.missions.idx > 0 || game.money > 0) {
      ctx.fillStyle = '#a4b0be'; ctx.font = '15px system-ui';
      ctx.fillText('Saved progress: $' + game.money + ' • Jobs done: ' + game.missions.idx + '/6', VIEW_W / 2, 640);
    }
  }
  if (game.state === 'paused') bigPanel('PAUSED', ['Press P to resume. Port Azura waits for no one.'], '#ffd76e');
  if (game.state === 'busted') bigPanel('BUSTED', ['The Port Azura PD got you. Bail posted: 10% of your cash.', 'Press ENTER to get back on the street.'], '#ff5a5a');
  if (game.state === 'wasted') bigPanel('WASTED', ['You wake up outside Port Clinic, lighter in the wallet.', 'Press ENTER to keep running.'], '#ff5a5a');
}

// ---------- boot / loop ----------
if (shot) {
  setupShot(game, shot.scene);
  // settle the scene with fixed steps so screenshots are stable & deterministic
  const savedState = game.state;
  if (shot.scene !== 'title') game.state = 'playing';
  for (let i = 0; i < 55; i++) update(1 / 60);
  game.state = savedState;
  game.camera.x = clamp((game.player.inCar ? game.player.car.x : game.player.x) - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  game.camera.y = clamp((game.player.inCar ? game.player.car.y : game.player.y) - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  if (shot.scene === 'title') { game.camera.x = 760; game.camera.y = 620; }
  render();
  window.__shotReady = true;
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!game.shotMode) { update(dt); render(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
