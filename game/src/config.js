// Neon Harbor: Vice Run — world & tuning constants for Port Azura.
export const VIEW_W = 1280;
export const VIEW_H = 800;
export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const ROAD_W = 120;
export const BEACH_X = 2860; // sand starts here, water beyond WORLD edge strip
export const WATER_X = 3020;
export const ROADS_X = [200, 600, 1000, 1400, 1800, 2200, 2600];
export const ROADS_Y = [200, 600, 1000, 1400, 1800, 2160];
export const COLORS = {
  asphalt: '#3a3f4a', asphaltNight: '#23262e', lane: '#f5d76e', sidewalk: '#9aa0a8',
  sand: '#eed9a0', water: '#1b7f9e', waterDeep: '#14667f', grass: '#4d9e5f',
  player: '#ffcf3f', police: '#2b4bd8',
};
export const CAR_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#ecf0f1','#e67e22','#1abc9c','#fd79a8','#95a5a6','#dfe6e9','#fdcb6e'];
export const PED_COLORS = ['#ff7675','#74b9ff','#55efc4','#ffeaa7','#a29bfe','#fd79a8','#81ecec','#fab1a0'];
export const TUNING = {
  playerWalk: 150, playerRun: 255,
  carAccel: 320, carMaxSpeed: 430, carMaxReverse: 130, carTurn: 2.6, carFriction: 0.86,
  trafficSpeed: 150, policeSpeed: 395,
  wantedDecay: 14, // seconds out of sight per star roughly
  bustedTime: 2.2,
  dayLength: 240, // seconds for full day-night cycle
};
export const BUILDING_NAMES = [
  ['Azura Bank','bank'],['Coral Diner','diner'],['Hotel Marisol','hotel'],['Palm Court','hotel'],
  ['Neon Arcade','arcade'],['Vice Records','shop'],['Taco Sol','diner'],['Harbor Gym','gym'],
  ['Azura Loans','bank'],['Club Lagoon','club'],['Surf Shop','shop'],['Mama Rosa Cantina','diner'],
  ['Port Clinic','clinic'],['Auto Reyes','garage'],['Lotus Spa','spa'],['Harbor Hotel','hotel'],
  ['Pawn & Gold','shop'],['Club Sirena','club'],['Fish Market','market'],['Azura Realty','office'],
  ['Tech Nova','office'],['Cafe Brisa','diner'],['Grand Palms','hotel'],['Tire King','garage'],
];
export const STORAGE_KEY = 'neon-harbor-vice-run-v1';
