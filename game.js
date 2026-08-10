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
const recordsSection = document.getElementById('records-section');
const recordsList = document.getElementById('records-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const playBtn = document.getElementById('play-btn');
const restartBtn = document.getElementById('restart-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIcon = themeToggleBtn.querySelector('.theme-icon');
const themeLabel = themeToggleBtn.querySelector('.theme-label');
const pauseMenu = document.getElementById('pause-menu');
const pauseMainView = document.getElementById('pause-main-view');
const pauseControlsView = document.getElementById('pause-controls-view');
const resumeBtn = document.getElementById('resume-btn');
const restartPauseBtn = document.getElementById('restart-pause-btn');
const showControlsBtn = document.getElementById('show-controls-btn');
const backBtn = document.getElementById('back-btn');
const startLevelSelect = document.getElementById('start-level-select');

let board, current, next, score, lines, level, startLevel, paused, gameOver, lastTime, dropAccum, dropInterval, animId, rewardPending, combo, comboMax;

const THEME_KEY = 'tetris-theme';
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

// { scores: [{name, score}, ...] sorted desc, max 5, bestCombo: int, maxLines: int }
let records = loadRecords();

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return {
      scores: Array.isArray(raw?.scores) ? raw.scores : [],
      bestCombo: Number(raw?.bestCombo) || 0,
      maxLines: Number(raw?.maxLines) || 0,
    };
  } catch {
    return { scores: [], bestCombo: 0, maxLines: 0 };
  }
}

function saveRecords() {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function isTopScore(value) {
  return records.scores.length < MAX_RECORDS || value > records.scores[records.scores.length - 1].score;
}

function insertRecord(name, value) {
  records.scores.push({ name, score: value });
  records.scores.sort((a, b) => b.score - a.score);
  records.scores = records.scores.slice(0, MAX_RECORDS);
  saveRecords();
}

// Renders the top-5 list; highlightScore marks the just-saved entry (first match only).
function renderRecords(highlightScore) {
  recordsList.innerHTML = '';
  if (!records.scores.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin puntuaciones aún';
    recordsList.appendChild(li);
  } else {
    let highlighted = false;
    records.scores.forEach((r, i) => {
      const li = document.createElement('li');
      li.textContent = `${i + 1}. ${r.name} — ${r.score.toLocaleString()}`;
      if (!highlighted && highlightScore !== undefined && r.score === highlightScore) {
        li.classList.add('highlight');
        highlighted = true;
      }
      recordsList.appendChild(li);
    });
  }
  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
}

function resetRecords() {
  if (!confirm('¿Borrar todas las puntuaciones y récords guardados?')) return;
  records = { scores: [], bestCombo: 0, maxLines: 0 };
  saveRecords();
  renderRecords();
}

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
    combo++;
    comboMax = Math.max(comboMax, combo);
    updateHUD();
  } else {
    combo = 0;
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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

  // All-time bests update regardless of whether the score itself made the top 5.
  records.bestCombo = Math.max(records.bestCombo, comboMax);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords();

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlayScore.classList.remove('hidden');
  recordsSection.classList.remove('hidden');
  playBtn.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  resetRecordsBtn.classList.remove('hidden');

  if (isTopScore(score)) {
    nameEntry.classList.remove('hidden');
    nameInput.value = '';
    renderRecords();
    // Give the score entry focus without blocking restart/reset for players who skip naming.
    setTimeout(() => nameInput.focus(), 0);
  } else {
    nameEntry.classList.add('hidden');
    renderRecords();
  }

  overlay.classList.remove('hidden');
}

function saveScore() {
  const name = (nameInput.value.trim() || 'AAA').slice(0, 10).toUpperCase();
  insertRecord(name, score);
  nameEntry.classList.add('hidden');
  renderRecords(score);
}

function showStartScreen() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  overlayScore.classList.add('hidden');
  recordsSection.classList.remove('hidden');
  nameEntry.classList.add('hidden');
  playBtn.classList.remove('hidden');
  restartBtn.classList.add('hidden');
  resetRecordsBtn.classList.remove('hidden');
  renderRecords();
  overlay.classList.remove('hidden');
}

function openPauseMenu() {
  pauseMainView.classList.remove('hidden');
  pauseControlsView.classList.add('hidden');
  pauseMenu.classList.remove('hidden');
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
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
  startLevel = parseInt(startLevelSelect.value, 10) || 1;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  rewardPending = false;
  combo = 0;
  comboMax = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

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

playBtn.addEventListener('click', init);
restartBtn.addEventListener('click', init);
saveScoreBtn.addEventListener('click', saveScore);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveScore();
});
resetRecordsBtn.addEventListener('click', resetRecords);

resumeBtn.addEventListener('click', togglePause);
restartPauseBtn.addEventListener('click', init);
showControlsBtn.addEventListener('click', () => {
  pauseMainView.classList.add('hidden');
  pauseControlsView.classList.remove('hidden');
});
backBtn.addEventListener('click', () => {
  pauseControlsView.classList.add('hidden');
  pauseMainView.classList.remove('hidden');
});

initTheme();
board = createBoard();
gameOver = true;
draw();
showStartScreen();
