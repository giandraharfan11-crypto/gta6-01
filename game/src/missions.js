// Mama Rosa's six-job story chain for Port Azura.
import { WORLD_W, WORLD_H } from './config.js';
import { makeCar } from './vehicles.js';
import { crimeAt } from './police.js';

export const MISSION_DEFS = [
  { title: 'First Errand', pay: 150, intro: 'Mama Rosa: "Mijo, pick up a package at the cantina and drop it at Hotel Marisol. Quick and quiet."' },
  { title: 'Borrowed Wheels', pay: 300, intro: 'Mama Rosa: "See that gold coupe? Its owner owes me. Take it, bring it to Auto Reyes."' },
  { title: 'Send a Message', pay: 450, intro: 'Mama Rosa: "A rival courier is rolling through my streets. Ram his car until he stops. Hard."' },
  { title: 'Heat Wave', pay: 600, intro: 'Mama Rosa: "The cops are watching my block. Draw their heat and survive it — 40 seconds, then shake them."' },
  { title: 'The Fare', pay: 550, intro: 'Mama Rosa: "A very nervous accountant needs a ride to the Fish Market. Fast. He pays, I pay you."' },
  { title: 'Azura Gold', pay: 1500, intro: 'Mama Rosa: "Last job, mijo. Azura Bank. Walk in, hold the vault zone 5 seconds, then run the money to the beach hideout."' },
];
const SPOTS = {
  cantina: { x: 1060, y: 700 }, hotel: { x: 2260, y: 300 }, garage: { x: 660, y: 1500 },
  goldCar: { x: 1460, y: 1060 }, rivalStart: { x: 2060, y: 1060 },
  pickup: { x: 460, y: 460 }, market: { x: 1860, y: 1900 },
  bank: { x: 260, y: 260 }, hideout: { x: 2920, y: 1200 },
};
export function createMissionState(savedIdx) {
  return { idx: savedIdx || 0, step: 0, target: null, label: '', timer: 0, holdTime: 0, rams: 0, started: false, done: false, rivalCar: null, missionCar: null, passengerIn: false };
}
export function startMission(game) {
  const ms = game.missions;
  if (ms.idx >= MISSION_DEFS.length) { ms.done = true; ms.target = null; return; }
  const def = MISSION_DEFS[ms.idx];
  ms.step = 0; ms.timer = 0; ms.holdTime = 0; ms.rams = 0; ms.started = true; ms.passengerIn = false;
  game.notify(def.intro, '#ffd76e', 7);
  game.dialog = { text: def.intro, timer: 7 };
  setupStep(game);
}
function setupStep(game) {
  const ms = game.missions, p = game.player;
  const set = (spot, label) => { ms.target = { x: spot.x, y: spot.y }; ms.label = label; };
  switch (ms.idx) {
    case 0:
      if (ms.step === 0) set(SPOTS.cantina, 'Pick up the package at Mama Rosa Cantina');
      else set(SPOTS.hotel, 'Deliver the package to Hotel Marisol');
      break;
    case 1:
      if (ms.step === 0) {
        if (!ms.missionCar || ms.missionCar.dead) {
          ms.missionCar = makeCar(SPOTS.goldCar.x, SPOTS.goldCar.y, 0, '#ffd700', 'parked');
          ms.missionCar.isMissionCar = true;
          game.cars.push(ms.missionCar);
        }
        set(SPOTS.goldCar, 'Steal the gold coupe');
      } else set(SPOTS.garage, 'Deliver the gold coupe to Auto Reyes');
      break;
    case 2:
      if (!ms.rivalCar || ms.rivalCar.dead) {
        ms.rivalCar = makeCar(SPOTS.rivalStart.x, SPOTS.rivalStart.y, Math.PI, '#8e44ad', 'traffic');
        ms.rivalCar.isRival = true; ms.rivalCar.health = 55; ms.rivalCar.targetSpeed = 235;
        game.cars.push(ms.rivalCar);
      }
      ms.target = null; ms.label = 'Ram the purple rival car (' + Math.floor(Math.max(0, ms.rivalCar.health)) + ' HP)';
      break;
    case 3:
      ms.target = null; ms.label = 'Survive the heat! ' + Math.ceil(40 - ms.timer) + 's';
      if (ms.step === 0) { game.police.addHeat(40, game); ms.step = 1; }
      break;
    case 4:
      if (ms.step === 0) set(SPOTS.pickup, 'Pick up the accountant (stop beside him)');
      else set(SPOTS.market, 'Drive the accountant to the Fish Market — hurry!');
      break;
    case 5:
      if (ms.step === 0) set(SPOTS.bank, 'Enter Azura Bank vault zone (on foot)');
      else if (ms.step === 1) set(SPOTS.bank, 'Hold the vault zone… ' + ms.holdTime.toFixed(1) + ' / 5s');
      else set(SPOTS.hideout, 'Run the money to the beach hideout!');
      break;
  }
  void p;
}
function reach(game, r = 52) {
  const ms = game.missions; if (!ms.target) return false;
  const p = game.player;
  const x = p.inCar ? p.car.x : p.x, y = p.inCar ? p.car.y : p.y;
  return Math.hypot(x - ms.target.x, y - ms.target.y) < r;
}
function completeMission(game) {
  const ms = game.missions, def = MISSION_DEFS[ms.idx];
  game.addMoney(def.pay);
  game.audio.cash();
  game.notify('MISSION COMPLETE: ' + def.title + '  +$' + def.pay, '#7bed9f', 5);
  game.toast = { text: 'MISSION COMPLETE — ' + def.title, sub: '+$' + def.pay + ' from Mama Rosa', timer: 3.4 };
  ms.idx++; ms.started = false; ms.target = null; ms.label = ''; ms.rivalCar = null; ms.missionCar = null;
  game.saveProgress();
  if (ms.idx >= MISSION_DEFS.length) {
    ms.done = true;
    game.notify('Mama Rosa: "You run this harbor now, mijo. Port Azura is yours." Free roam!', '#ffd76e', 8);
    game.dialog = { text: 'Mama Rosa: "You run this harbor now, mijo. Port Azura is yours."', timer: 8 };
  } else {
    setTimeout(() => { if (game.state === 'playing') startMission(game); }, 2600);
  }
}
function failMission(game, why) {
  game.audio.fail();
  game.notify('MISSION FAILED: ' + why + ' — restarting job…', '#ff5a5a', 4);
  const ms = game.missions;
  if (ms.rivalCar) { ms.rivalCar.dead = true; ms.rivalCar = null; }
  if (ms.missionCar && !game.player.inCar) { ms.missionCar.dead = true; ms.missionCar = null; }
  ms.started = false;
  setTimeout(() => { if (game.state === 'playing') startMission(game); }, 2200);
}
export function updateMissions(game, dt) {
  const ms = game.missions;
  if (!ms.started || ms.done || game.state !== 'playing') return;
  const p = game.player;
  switch (ms.idx) {
    case 0:
      if (reach(game)) {
        if (ms.step === 0) { ms.step = 1; game.notify('Package picked up.', '#a4b0be'); setupStep(game); }
        else completeMission(game);
      }
      break;
    case 1:
      if (ms.step === 0) {
        if (p.inCar && p.car === ms.missionCar) { ms.step = 1; game.notify('You have the coupe. Go!', '#a4b0be'); setupStep(game); }
        else if (ms.missionCar) { ms.target = { x: ms.missionCar.x, y: ms.missionCar.y }; }
      } else if (reach(game, 70)) completeMission(game);
      break;
    case 2: {
      const r = ms.rivalCar;
      if (!r || r.dead) { failMission(game, 'target lost'); break; }
      ms.label = 'Ram the purple rival car (' + Math.max(0, Math.ceil(r.health)) + ' HP left)';
      if (r.health <= 0) { r.speed = 0; r.kind = 'parked'; game.notify('Rival stopped! Smoke pours from his hood.', '#7bed9f'); completeMission(game); }
      break;
    }
    case 3:
      ms.timer += dt;
      ms.label = 'Survive the heat! ' + Math.max(0, Math.ceil(40 - ms.timer)) + 's — wanted ' + game.police.wanted + '★';
      if (game.police.wanted === 0 && ms.timer < 40) { /* heat lost early still counts down slower */ ms.timer -= dt * 0.5; }
      if (ms.timer >= 40) completeMission(game);
      break;
    case 4:
      if (ms.step === 0) {
        if (p.inCar && Math.abs(p.car.speed) < 12 && reach(game, 60)) {
          ms.step = 1; ms.timer = 90; ms.passengerIn = true;
          game.notify('Accountant: "Fish Market. Do NOT stop for anyone."', '#ffd76e', 4);
          setupStep(game);
        }
      } else {
        ms.timer -= dt;
        ms.label = 'Drive the accountant to the Fish Market — ' + Math.max(0, Math.ceil(ms.timer)) + 's';
        if (!p.inCar) { failMission(game, 'you left the car'); break; }
        if (ms.timer <= 0) { failMission(game, 'too slow'); break; }
        if (reach(game, 64)) completeMission(game);
      }
      break;
    case 5:
      if (ms.step === 0) {
        if (!p.inCar && reach(game, 56)) { ms.step = 1; game.notify('You are in the vault zone. Hold it!', '#ffd76e'); setupStep(game); }
      } else if (ms.step === 1) {
        if (!p.inCar && reach(game, 56)) {
          ms.holdTime += dt; setupStep(game);
          if (ms.holdTime >= 5) {
            ms.step = 2; game.addMoney(0); game.carryMoney = true;
            game.police.addHeat(75, game); crimeAt(game, 10, p.x, p.y);
            game.notify('ALARM! Grab a car and RUN!', '#ff5a5a', 4);
            setupStep(game);
          }
        } else ms.holdTime = Math.max(0, ms.holdTime - dt * 1.5);
      } else if (reach(game, 64)) { game.carryMoney = false; completeMission(game); }
      break;
  }
}
export function missionTarget(game) {
  const ms = game.missions;
  if (ms.idx === 2 && ms.rivalCar) return { x: ms.rivalCar.x, y: ms.rivalCar.y, label: ms.label };
  if (ms.target) return { x: ms.target.x, y: ms.target.y, label: ms.label };
  return null;
}
export { SPOTS };
