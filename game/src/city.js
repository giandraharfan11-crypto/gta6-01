// Port Azura: procedural grid city — blocks, named buildings, roads, beach & sea.
import { WORLD_W, WORLD_H, ROADS_X, ROADS_Y, ROAD_W, BEACH_X, WATER_X, BUILDING_NAMES, COLORS } from './config.js';
import { pick, randRange } from './random.js';

const PALETTE = ['#e8b4b8','#f2d492','#a8d8ea','#f6e6ad','#d5a6bd','#9fd8c9','#f9c784','#c3bef0','#ffd6a5','#b8f2e6','#efa8b8','#a0c4ff'];

export function generateCity(rng) {
  const buildings = [], colliders = [], trees = [], lamps = [];
  let nameIdx = 0;
  // Blocks sit between roads; each block holds 1-4 buildings with gaps.
  for (let bi = 0; bi < ROADS_X.length; bi++) {
    for (let bj = 0; bj < ROADS_Y.length; bj++) {
      const x0 = ROADS_X[bi] + ROAD_W / 2 + 14;
      const y0 = ROADS_Y[bj] + ROAD_W / 2 + 14;
      const x1 = (bi + 1 < ROADS_X.length ? ROADS_X[bi + 1] : WORLD_W - 60) - ROAD_W / 2 - 14;
      const y1 = (bj + 1 < ROADS_Y.length ? ROADS_Y[bj + 1] : WORLD_H - 40) - ROAD_W / 2 - 14;
      const bw = x1 - x0, bh = y1 - y0;
      if (bw < 90 || bh < 90) continue;
      if (x1 > BEACH_X - 30) continue; // keep the beach & shore clear of buildings
      const split = rng() > 0.45;
      const cells = split
        ? [{ x: x0, y: y0, w: bw * 0.48, h: bh * 0.48 }, { x: x0 + bw * 0.52, y: y0, w: bw * 0.48, h: bh * 0.48 },
           { x: x0, y: y0 + bh * 0.52, w: bw * 0.48, h: bh * 0.48 }, { x: x0 + bw * 0.52, y: y0 + bh * 0.52, w: bw * 0.48, h: bh * 0.48 }]
        : [{ x: x0 + bw * 0.12, y: y0 + bh * 0.12, w: bw * 0.76, h: bh * 0.76 }];
      for (const c of cells) {
        if (rng() < 0.12) { // small plaza / parking pocket inside the block
          for (let t = 0; t < 3; t++) trees.push({ x: c.x + randRange(rng, 10, c.w - 10), y: c.y + randRange(rng, 10, c.h - 10), r: randRange(rng, 9, 14) });
          continue;
        }
        const def = BUILDING_NAMES[nameIdx % BUILDING_NAMES.length]; nameIdx++;
        const b = { x: c.x, y: c.y, w: c.w, h: c.h, color: pick(rng, PALETTE), roof: pick(rng, PALETTE), name: def[0], kind: def[1], floors: 2 + Math.floor(rng() * 5) };
        buildings.push(b); colliders.push({ x: b.x, y: b.y, w: b.w, h: b.h });
      }
    }
  }
  // Palm trees along beach + sidewalks, street lamps at intersections.
  for (let y = 60; y < WORLD_H - 40; y += 130) trees.push({ x: BEACH_X + randRange(rng, 14, 90), y: y + randRange(rng, -16, 16), r: randRange(rng, 11, 17), palm: true });
  for (const rx of ROADS_X) for (const ry of ROADS_Y) {
    lamps.push({ x: rx - ROAD_W / 2 - 8, y: ry - ROAD_W / 2 - 8 });
    lamps.push({ x: rx + ROAD_W / 2 + 8, y: ry + ROAD_W / 2 + 8 });
    if (rng() > 0.4) trees.push({ x: rx + ROAD_W / 2 + 16, y: ry - ROAD_W / 2 - 18, r: 10, palm: true });
  }
  return { buildings, colliders, trees, lamps, beachX: BEACH_X, waterX: WATER_X };
}

export function collideRects(x, y, r, colliders) {
  // returns true if a circle at x,y radius r overlaps any building rect (expanded by r)
  for (const c of colliders) {
    if (x + r > c.x && x - r < c.x + c.w && y + r > c.y && y - r < c.y + c.h) return c;
  }
  return null;
}
export function nearestRoadNode(x, y) {
  let bx = ROADS_X[0], by = ROADS_Y[0], bd = Infinity;
  for (const rx of ROADS_X) for (const ry of ROADS_Y) {
    const d = Math.hypot(rx - x, ry - y);
    if (d < bd) { bd = d; bx = rx; by = ry; }
  }
  return { x: bx, y: by };
}

export function drawCity(ctx, city, cam, night) {
  const vx = cam.x, vy = cam.y, vw = 1280, vh = 800;
  // ground: city blocks base
  ctx.fillStyle = night > 0.5 ? '#3d4a3a' : COLORS.grass;
  ctx.fillRect(0, 0, vw, vh);
  // beach sand + sea (east side)
  ctx.fillStyle = night > 0.5 ? '#a68d5b' : COLORS.sand;
  ctx.fillRect(city.beachX - vx, -vy, WORLD_W - city.beachX, WORLD_H);
  const wg = ctx.createLinearGradient(city.waterX - vx, 0, WORLD_W - vx, 0);
  wg.addColorStop(0, night > 0.5 ? '#0d4a63' : COLORS.water); wg.addColorStop(1, night > 0.5 ? '#082f42' : COLORS.waterDeep);
  ctx.fillStyle = wg; ctx.fillRect(city.waterX - vx, -vy, WORLD_W - city.waterX + 400, WORLD_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  for (let y = 40; y < WORLD_H; y += 90) {
    ctx.beginPath();
    ctx.moveTo(city.waterX - vx + 6, y - vy);
    ctx.quadraticCurveTo(city.waterX - vx + 26, y + 12 - vy, city.waterX - vx + 6, y + 26 - vy);
    ctx.stroke();
  }
  // sidewalks (slightly larger than roads)
  ctx.fillStyle = night > 0.5 ? '#6d7278' : COLORS.sidewalk;
  for (const rx of ROADS_X) ctx.fillRect(rx - ROAD_W / 2 - 12 - vx, -vy, ROAD_W + 24, WORLD_H);
  for (const ry of ROADS_Y) ctx.fillRect(-vx, ry - ROAD_W / 2 - 12 - vy, WORLD_W, ROAD_W + 24);
  // asphalt
  ctx.fillStyle = night > 0.5 ? COLORS.asphaltNight : COLORS.asphalt;
  for (const rx of ROADS_X) ctx.fillRect(rx - ROAD_W / 2 - vx, -vy, ROAD_W, WORLD_H);
  for (const ry of ROADS_Y) ctx.fillRect(-vx, ry - ROAD_W / 2 - vy, WORLD_W, ROAD_W);
  // lane markings
  ctx.strokeStyle = COLORS.lane; ctx.lineWidth = 3; ctx.setLineDash([22, 18]);
  ctx.globalAlpha = night > 0.5 ? 0.5 : 0.85;
  for (const rx of ROADS_X) { ctx.beginPath(); ctx.moveTo(rx - vx, -vy); ctx.lineTo(rx - vx, WORLD_H - vy); ctx.stroke(); }
  for (const ry of ROADS_Y) { ctx.beginPath(); ctx.moveTo(-vx, ry - vy); ctx.lineTo(WORLD_W - vx, ry - vy); ctx.stroke(); }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  // crosswalks at intersections
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const rx of ROADS_X) for (const ry of ROADS_Y) {
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(rx - ROAD_W / 2 - vx, ry + i * 16 - 4 - vy, 14, 8);
      ctx.fillRect(rx + ROAD_W / 2 - 14 - vx, ry + i * 16 - 4 - vy, 14, 8);
    }
  }
  // buildings with roofs, windows, names
  for (const b of city.buildings) {
    const sx = b.x - vx, sy = b.y - vy;
    if (sx + b.w < -40 || sy + b.h < -40 || sx > vw + 40 || sy > vh + 40) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx + 6, sy + 8, b.w, b.h);
    ctx.fillStyle = b.color; ctx.fillRect(sx, sy, b.w, b.h);
    ctx.fillStyle = b.roof; ctx.fillRect(sx + 6, sy + 6, b.w - 12, b.h - 12);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(sx + 6, sy + 6, b.w - 12, b.h - 12);
    // windows (lit at night)
    const lit = night > 0.45;
    ctx.fillStyle = lit ? 'rgba(255,214,120,0.9)' : 'rgba(40,60,90,0.35)';
    const cols = Math.max(1, Math.floor(b.w / 26)), rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (((i * 7 + j * 13 + b.floors) % 3) === 0) continue;
      ctx.fillRect(sx + 12 + i * 24, sy + 12 + j * 24, 10, 8);
    }
    // name label
    if (b.w > 92 && b.h > 56) {
      ctx.fillStyle = lit ? '#ffe9b0' : '#26303c';
      ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(b.name.toUpperCase(), sx + b.w / 2, sy + b.h / 2 + 4);
    }
    // kind icon dot
    ctx.fillStyle = b.kind === 'bank' ? '#ffd700' : b.kind === 'hotel' ? '#ff6b9d' : b.kind === 'diner' ? '#ff9f43' : '#54a0ff';
    ctx.beginPath(); ctx.arc(sx + 14, sy + 14, 5, 0, Math.PI * 2); ctx.fill();
  }
  // trees / palms
  for (const t of city.trees) {
    const sx = t.x - vx, sy = t.y - vy;
    if (sx < -30 || sy < -30 || sx > vw + 30 || sy > vh + 30) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(sx + 3, sy + 5, t.r, t.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    if (t.palm) {
      ctx.strokeStyle = '#8a6d3b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx, sy + 8); ctx.lineTo(sx, sy - 4); ctx.stroke();
      ctx.strokeStyle = night > 0.5 ? '#2e7d4f' : '#27ae60'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(sx, sy - 4);
        ctx.quadraticCurveTo(sx + Math.cos(a) * t.r * 0.8, sy - 6 + Math.sin(a) * 3, sx + Math.cos(a) * t.r * 1.25, sy + 2 + Math.abs(Math.sin(a)) * 5);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = night > 0.5 ? '#2e7d4f' : '#2ecc71';
      ctx.beginPath(); ctx.arc(sx, sy, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(sx - t.r * 0.3, sy - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
  }
  // street lamps glow at night
  if (night > 0.35) {
    for (const l of city.lamps) {
      const sx = l.x - vx, sy = l.y - vy;
      if (sx < -60 || sy < -60 || sx > vw + 60 || sy > vh + 60) continue;
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 46);
      g.addColorStop(0, 'rgba(255,200,90,0.5)'); g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 46, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd76e'; ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}
