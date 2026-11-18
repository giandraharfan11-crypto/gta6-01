// Deterministic screenshot scenes: ?shot=<scene>&seed=<n>
import { makeCar } from './vehicles.js';

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  const scene = q.get('shot');
  if (!scene) return null;
  const seed = parseInt(q.get('seed') || '7', 10) || 7;
  return { scene, seed };
}
export function setupShot(game, scene) {
  const p = game.player;
  game.shotMode = true;
  if (scene === 'title') {
    game.state = 'title';
    game.timeOfDay = 0.86; // night over the city
    p.x = 1400; p.y = 1000;
    return;
  }
  game.state = 'playing';
  game.missions.idx = 0;
  if (scene === 'cover') {
    game.timeOfDay = 0.36; // golden afternoon
    const car = makeCar(1420, 1028, Math.PI, '#e74c3c', 'player');
    car.speed = 300;
    game.cars.push(car);
    p.inCar = true; p.car = car; p.x = car.x; p.y = car.y;
    game.police.heat = 65; game.police.wanted = 4;
    for (let i = 0; i < 2; i++) {
      const cop = makeCar(1560 + i * 90, 990 + i * 74, Math.PI, '#eef2f5', 'police');
      cop.speed = 280; game.police.cops.push(cop); game.cars.push(cop);
    }
    game.missions.started = true; game.missions.step = 1;
    game.missions.target = { x: 2260, y: 300 };
    game.missions.label = 'Deliver the package to Hotel Marisol';
    game.dialog = { text: 'Mama Rosa: "They are right behind you — do NOT stop, mijo!"', timer: 99 };
    game.money = 1250;
  } else if (scene === 'foot') {
    game.timeOfDay = 0.4;
    p.x = 1035; p.y = 1065; p.inCar = false; p.angle = -0.6;
    game.missions.started = true; game.missions.step = 0;
    game.missions.target = { x: 1060, y: 700 };
    game.missions.label = 'Pick up the package at Mama Rosa Cantina';
    game.money = 420;
  } else if (scene === 'drive') {
    game.timeOfDay = 0.44; // bright late morning on the beach road
    const car = makeCar(2628, 760, Math.PI / 2, '#3498db', 'player');
    car.speed = 240;
    game.cars.push(car);
    p.inCar = true; p.car = car; p.x = car.x; p.y = car.y;
    game.missions.started = true; game.missions.step = 1;
    game.missions.target = { x: 2260, y: 300 };
    game.missions.label = 'Deliver the package to Hotel Marisol';
    game.money = 890;
  }
}
