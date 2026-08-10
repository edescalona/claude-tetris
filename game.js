'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#f06292', // + pentomino - pink
  '#4db6ac', // U pentomino - teal
  '#7986cb', // Y pentomino - indigo
  '#ffffff', // single - white (reward piece)
  '#a1887f', // hollow 3x3 - brown
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + pentomino
  [[0,0,0],[9,0,9],[9,9,9]],                  // U pentomino
  [[0,0,10,0],[0,10,10,0],[0,0,10,0],[0,0,10,0]], // Y pentomino
  [[11]],                                     // single
  [[12,12,12],[12,0,12],[12,12,12]],          // hollow 3x3
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const STANDARD_TYPES = 7;
const SPECIAL_TYPES = [8, 9, 10, 12]; // +, U, Y, hollow — the single is reward-only
const SINGLE_TYPE = 11;
const SPECIAL_CHANCE = 0.08;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIcon = themeToggleBtn.querySelector('.theme-icon');
const themeLabel = themeToggleBtn.querySelector('.theme-label');
const pauseOverlay = document.getElementById('pause-overlay');
const pauseMenuView = document.getElementById('pause-menu-view');
const pauseControlsView = document.getElementById('pause-controls-view');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const viewControlsBtn = document.getElementById('view-controls-btn');
const backToPauseMenuBtn = document.getElementById('back-to-pause-menu-btn');
const startLevelSelect = document.getElementById('start-level-select');
const skinGrid = document.getElementById('skin-grid');
const skinCards = [...skinGrid.querySelectorAll('.skin-card')];

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, rewardPending;
let currentSkin;

// Menu setting, not per-game state: survives across restarts, so init() must not reset it.
let startLevel = 1;

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

const MOON_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>';
const SUN_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  // Icon reflects the current theme; label names the theme a click switches into.
  themeIcon.innerHTML = theme === 'light' ? SUN_ICON : MOON_ICON;
  themeLabel.textContent = theme === 'light' ? 'DARK' : 'LIGHT';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggleBtn.addEventListener('click', () => {
  const theme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
  if (current) draw();
  if (next && !gameOver) drawNext();
});

function applySkin(skin) {
  currentSkin = skin;
  skinCards.forEach(card => card.classList.toggle('active', card.dataset.skin === skin));
  document.body.classList.toggle('skin-neon', skin === 'neon');
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(SKIN_NAMES.includes(saved) ? saved : 'retro');
}

skinGrid.addEventListener('click', e => {
  const card = e.target.closest('.skin-card');
  if (!card) return;
  applySkin(card.dataset.skin);
  localStorage.setItem(SKIN_KEY, currentSkin);
  if (current) draw();
  if (next && !gameOver) drawNext();
});

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

// Reward pieces take precedence, then the occasional special, otherwise a standard piece.
function pickType() {
  if (rewardPending) {
    rewardPending = false;
    return SINGLE_TYPE;
  }
  if (Math.random() < SPECIAL_CHANCE) {
    return SPECIAL_TYPES[Math.floor(Math.random() * SPECIAL_TYPES.length)];
  }
  return Math.floor(Math.random() * STANDARD_TYPES) + 1;
}

function randomPiece() {
  const type = pickType();
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    // A Tetris grants a 1x1 piece, delivered as the next piece so the player sees it coming.
    if (cleared === 4) rewardPending = true;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lighten(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const mix = c => Math.round(c + (255 - c) * amt);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function mixColor(hexA, hexB, ratio) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const mix = (x, y) => Math.round(x * (1 - ratio) + y * ratio);
  return `rgb(${mix(a.r, b.r)}, ${mix(a.g, b.g)}, ${mix(a.b, b.b)})`;
}

function pastelize(hex) {
  return lighten(hex, 0.55);
}

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawBlockRetro(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBlockNeon(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.fillStyle = color;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.strokeRect(x * size + 2.5, y * size + 2.5, size - 5, size - 5);
  context.restore();
}

function drawBlockPastel(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = pastelize(color);
  roundedRectPath(context, x * size + 1.5, y * size + 1.5, size - 3, size - 3, size * 0.22);
  context.fill();
  context.restore();
}

function drawBlockPixel(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  context.save();
  context.globalAlpha = alpha ?? 1;
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  const step = s / 3;
  context.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if ((i + j) % 2 === 0) context.fillRect(px + i * step, py + j * step, step, step);
  context.strokeStyle = 'rgba(0,0,0,0.35)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  context.restore();
}

function drawBlockMono(context, x, y, colorIndex, size, alpha) {
  const { r, g, b } = hexToRgb(COLORS[colorIndex]);
  const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = `rgb(${lum}, ${lum}, ${lum})`;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.strokeStyle = lum > 140 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.25)';
  context.lineWidth = 1;
  context.strokeRect(x * size + 1.5, y * size + 1.5, size - 3, size - 3);
  context.restore();
}

function drawBlockGlass(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  context.save();
  context.globalAlpha = (alpha ?? 1) * 0.88;
  const grad = context.createLinearGradient(px, py, px, py + s);
  grad.addColorStop(0, lighten(color, 0.35));
  grad.addColorStop(1, color);
  context.fillStyle = grad;
  roundedRectPath(context, px, py, s, s, size * 0.15);
  context.fill();
  context.globalAlpha = (alpha ?? 1) * 0.5;
  context.fillStyle = 'rgba(255,255,255,0.55)';
  roundedRectPath(context, px + 2, py + 2, s * 0.5, s * 0.3, size * 0.1);
  context.fill();
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = 'rgba(255,255,255,0.3)';
  context.lineWidth = 1;
  roundedRectPath(context, px + 0.5, py + 0.5, s - 1, s - 1, size * 0.15);
  context.stroke();
  context.restore();
}

function drawBlockWood(context, x, y, colorIndex, size, alpha) {
  const color = COLORS[colorIndex];
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = mixColor(color, '#8a5a34', 0.5);
  context.fillRect(px, py, s, s);
  context.strokeStyle = 'rgba(0,0,0,0.18)';
  context.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const gy = py + (s / 4) * i + Math.sin(x * 3 + y * 7 + i) * 1.5;
    context.beginPath();
    context.moveTo(px, gy);
    context.lineTo(px + s, gy + Math.cos(y * 2 + i) * 1.5);
    context.stroke();
  }
  context.strokeStyle = 'rgba(0,0,0,0.35)';
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  context.restore();
}

function drawBlockRainbow(context, x, y, colorIndex, size, alpha) {
  const hue = ((colorIndex - 1) * 30) % 360;
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  context.save();
  context.globalAlpha = alpha ?? 1;
  const grad = context.createLinearGradient(px, py, px + s, py + s);
  grad.addColorStop(0, `hsl(${hue}, 85%, 70%)`);
  grad.addColorStop(1, `hsl(${hue}, 85%, 45%)`);
  context.fillStyle = grad;
  context.fillRect(px, py, s, s);
  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.fillRect(px, py, s, 4);
  context.restore();
}

const SKIN_DRAWERS = {
  retro: drawBlockRetro,
  neon: drawBlockNeon,
  pastel: drawBlockPastel,
  pixel: drawBlockPixel,
  mono: drawBlockMono,
  glass: drawBlockGlass,
  wood: drawBlockWood,
  rainbow: drawBlockRainbow,
};

const SKIN_NAMES = Object.keys(SKIN_DRAWERS);

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const drawer = SKIN_DRAWERS[currentSkin] || drawBlockRetro;
  drawer(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // Freeze the board once the game is over: no ghost, no floating piece.
  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function showPauseMenuView() {
  pauseMenuView.classList.remove('hidden');
  pauseControlsView.classList.add('hidden');
}

function showPauseControlsView() {
  pauseMenuView.classList.add('hidden');
  pauseControlsView.classList.remove('hidden');
}

function openPauseMenu() {
  paused = true;
  cancelAnimationFrame(animId);
  showPauseMenuView();
  startLevelSelect.value = String(startLevel);
  pauseOverlay.classList.remove('hidden');
}

function closePauseMenu() {
  paused = false;
  pauseOverlay.classList.add('hidden');
  lastTime = performance.now();
  loop(lastTime);
}

function togglePause() {
  if (gameOver) return;
  if (paused) {
    closePauseMenu();
  } else {
    openPauseMenu();
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // lockPiece() may have ended the game from inside this very frame, and
  // cancelAnimationFrame() cannot stop a frame that is already running.
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (startLevel - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  rewardPending = false;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  showPauseMenuView();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

resumeBtn.addEventListener('click', closePauseMenu);
pauseRestartBtn.addEventListener('click', init);
viewControlsBtn.addEventListener('click', showPauseControlsView);
backToPauseMenuBtn.addEventListener('click', showPauseMenuView);
startLevelSelect.addEventListener('change', e => {
  startLevel = parseInt(e.target.value, 10);
});

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

initTheme();
initSkin();
init();
