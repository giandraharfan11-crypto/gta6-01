// HUD: health, cash, wanted stars, mission text, notifications, minimap.
import { WORLD_W, WORLD_H, ROADS_X, ROADS_Y } from './config.js';
import { missionTarget, MISSION_DEFS } from './missions.js';

export function drawHUD(ctx, game) {
  const p = game.player;
  ctx.save();
  // top-left panel
  panel(ctx, 14, 14, 252, 86);
  // health bar
  ctx.fillStyle = '#222'; ctx.fillRect(26, 28, 160, 14);
  ctx.fillStyle = p.health > 30 ? '#2ed573' : '#ff4757';
  ctx.fillRect(26, 28, 160 * Math.max(0, p.health) / 100, 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(26, 28, 160, 14);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('HEALTH', 26, 24);
  if (p.inCar) { ctx.fillStyle = '#a4b0be'; ctx.fillText('CAR ' + Math.max(0, Math.round(p.car.health)) + '%', 196, 39); }
  // money
  ctx.fillStyle = '#7bed9f'; ctx.font = 'bold 24px system-ui';
  ctx.fillText('$' + game.money.toLocaleString('en-US'), 26, 74);
  ctx.fillStyle = '#a4b0be'; ctx.font = '12px system-ui';
  ctx.fillText('Port Azura Bank' + (game.carryMoney ? '  •  CARRYING LOOT' : ''), 128, 74);
  // wanted stars top-right
  const w = game.police.wanted;
  ctx.font = '30px system-ui'; ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < w ? '#ffd700' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', 1266 - (4 - i) * 34, 44);
  }
  if (w > 0 && game.police.hiddenTimer > 0.5) {
    ctx.fillStyle = '#a4b0be'; ctx.font = '12px system-ui';
    ctx.fillText('losing the heat…', 1266, 64);
  }
  // busted meter
  if (game.police.busted > 0.03) {
    panel(ctx, 490, 14, 300, 40);
    ctx.fillStyle = '#ff4757'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', 640, 30);
    ctx.fillStyle = '#222'; ctx.fillRect(510, 36, 260, 9);
    ctx.fillStyle = '#ff4757'; ctx.fillRect(510, 36, 260 * Math.min(1, game.police.busted), 9);
  }
  // mission banner
  const mt = missionTarget(game);
  if (game.missions.started && !game.missions.done) {
    const def = MISSION_DEFS[game.missions.idx];
    panel(ctx, 340, 716, 600, 68);
    ctx.fillStyle = '#ffd76e'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('JOB ' + (game.missions.idx + 1) + '/6 — ' + def.title.toUpperCase(), 640, 740);
    ctx.fillStyle = '#fff'; ctx.font = '14px system-ui';
    let line = game.missions.label || '';
    if (mt) {
      const px = p.inCar ? p.car.x : p.x, py = p.inCar ? p.car.y : p.y;
      line += '   •   ' + Math.round(Math.hypot(mt.x - px, mt.y - py) / 10) + 'm';
    }
    ctx.fillText(line, 640, 764);
  } else if (game.missions.done) {
    panel(ctx, 440, 716, 400, 44);
    ctx.fillStyle = '#7bed9f'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('STORY COMPLETE — FREE ROAM PORT AZURA', 640, 744);
  }
  // dialog line (Mama Rosa)
  if (game.dialog && game.dialog.timer > 0) {
    panel(ctx, 240, 622, 800, 56);
    ctx.fillStyle = '#ffd76e'; ctx.font = 'italic 15px system-ui'; ctx.textAlign = 'center';
    wrapText(ctx, game.dialog.text, 640, 656, 760, 18);
  }
  // notifications stack
  ctx.textAlign = 'left'; let ny = 118;
  for (const n of game.notifications) {
    ctx.globalAlpha = Math.min(1, n.timer);
    panel(ctx, 14, ny - 16, Math.min(560, 30 + n.text.length * 7.4), 26);
    ctx.fillStyle = n.color; ctx.font = 'bold 13px system-ui';
    ctx.fillText(n.text, 26, ny + 2);
    ny += 32; ctx.globalAlpha = 1;
  }
  // controls hint
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '12px system-ui'; ctx.textAlign = 'right';
  ctx.fillText(p.inCar ? 'WASD drive • SPACE drift • E exit car • P pause' : 'WASD move • SHIFT run • E enter car • CLICK shoot • P pause • M mute', 1266, 782);
  // mission complete toast
  if (game.toast && game.toast.timer > 0) {
    const a = Math.min(1, game.toast.timer);
    ctx.globalAlpha = a;
    panel(ctx, 390, 250, 500, 92);
    ctx.fillStyle = '#7bed9f'; ctx.font = 'bold 26px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(game.toast.text, 640, 292);
    ctx.fillStyle = '#ffd76e'; ctx.font = '17px system-ui';
    ctx.fillText(game.toast.sub, 640, 322);
    ctx.globalAlpha = 1;
  }
  drawMinimap(ctx, game);
  ctx.restore();
}
function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,14,22,0.68)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; ctx.stroke();
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = '', yy = y - 8;
  for (const word of words) {
    if (ctx.measureText(line + word).width > maxW && line) { ctx.fillText(line, x, yy); line = ''; yy += lh; }
    line += word + ' ';
  }
  ctx.fillText(line.trim(), x, yy);
}
function drawMinimap(ctx, game) {
  const MW = 196, MH = 148, MX = 1070, MY = 540;
  const sx = MW / WORLD_W, sy = MH / WORLD_H;
  ctx.fillStyle = 'rgba(10,16,24,0.78)';
  ctx.beginPath(); ctx.roundRect(MX, MY, MW, MH, 8); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(MX, MY, MW, MH, 8); ctx.clip();
  // roads
  ctx.strokeStyle = 'rgba(200,210,220,0.5)'; ctx.lineWidth = 2;
  for (const rx of ROADS_X) { ctx.beginPath(); ctx.moveTo(MX + rx * sx, MY); ctx.lineTo(MX + rx * sx, MY + MH); ctx.stroke(); }
  for (const ry of ROADS_Y) { ctx.beginPath(); ctx.moveTo(MX, MY + ry * sy); ctx.lineTo(MX + MW, MY + ry * sy); ctx.stroke(); }
  // buildings dots
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (const b of game.city.buildings) ctx.fillRect(MX + b.x * sx, MY + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  // sea
  ctx.fillStyle = 'rgba(40,140,190,0.5)'; ctx.fillRect(MX + 3020 * sx, MY, MW, MH);
  // cops red
  ctx.fillStyle = '#ff3b30';
  for (const c of game.police.cops) { ctx.beginPath(); ctx.arc(MX + c.x * sx, MY + c.y * sy, 3, 0, Math.PI * 2); ctx.fill(); }
  // rival / mission car purple-gold
  // mission target yellow pulsing
  const mt = missionTarget(game);
  if (mt) {
    const pulse = 4 + Math.sin(performance.now() / 200) * 1.6;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(MX + mt.x * sx, MY + mt.y * sy, pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,0,0.6)'; ctx.beginPath(); ctx.arc(MX + mt.x * sx, MY + mt.y * sy, pulse + 4, 0, Math.PI * 2); ctx.stroke();
  }
  // player white arrow dot
  const p = game.player, px = p.inCar ? p.car.x : p.x, py = p.inCar ? p.car.y : p.y;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(MX + px * sx, MY + py * sy, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffd76e'; ctx.beginPath(); ctx.arc(MX + px * sx, MY + py * sy, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.roundRect(MX, MY, MW, MH, 8); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '10px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('PORT AZURA', MX + 8, MY + 14);
}
