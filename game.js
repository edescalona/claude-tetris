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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, rewardPending;

const THEME_KEY = 'tetris-theme';

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
    updateHUD();
  }
  hsTrackCombo(cleared);
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

// Every block on every canvas goes through here; the active skin owns the painting.
function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  (SKINS[activeSkin] || SKINS[DEFAULT_SKIN]).drawBlock(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  // Read from body: skin classes live there, alongside the theme class.
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
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
  hsShowGameOver();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenuClose();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    pauseMenuOpen();
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
  startLevel = readStartLevel();
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  rewardPending = false;
  hsResetRun();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenuClose();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (hsKeysBlocked(e)) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  // While the pause menu is open every game key is swallowed, so the page cannot
  // scroll and a focused menu button cannot be activated with Space. The level
  // selector is exempt or it would become mouse-only.
  if (paused && GAME_KEYS.includes(e.code) && e.target !== pauseLevelSelect) e.preventDefault();
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

/* ==========================================================================
   Local high scores + start screen
   ========================================================================== */

const HS_KEY = 'tetris-highscores';
const HS_LEVEL_KEY = 'tetris-start-level';
const HS_MAX_ENTRIES = 5;
const HS_NAME_MAX = 12;
const HS_DEFAULT_NAME = 'Jugador';
const START_LEVEL_MAX = 15;
const HS_RESET_TIMEOUT = 4000;

const hsPanel = document.getElementById('hs-gameover-panel');
const hsRunSummary = document.getElementById('hs-run-summary');
const hsNameForm = document.getElementById('hs-name-form');
const hsNameInput = document.getElementById('hs-name-input');
const hsSaveBtn = document.getElementById('hs-save-btn');
const hsGameOverScores = document.getElementById('hs-gameover-scores');
const startScreen = document.getElementById('start-screen');
const startScores = document.getElementById('start-scores');
const startLevelSelect = document.getElementById('start-level-select');
const startPlayBtn = document.getElementById('start-play-btn');
const startResetBtn = document.getElementById('start-reset-btn');
const startMenuBtn = document.getElementById('start-menu-btn');

// Combo = streak of consecutive locked pieces that clear at least one line.
let combo = 0;
let maxCombo = 0;
let startLevel = 1;
// Entry waiting for the player to confirm a name at game over.
let hsPendingEntry = null;
let hsResetArmed = false;
let hsResetTimer = null;

function hsClampLevel(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(START_LEVEL_MAX, Math.max(1, Math.floor(value)));
}

function hsReadStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

// Returns false when the write was rejected (private mode, quota); records are optional.
function hsWriteStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function hsSanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // Only real, positive scores: coercion would turn {}, null or "" into a bogus 0-point row.
  const score = typeof raw.score === 'number' ? raw.score : NaN;
  if (!Number.isFinite(score) || score <= 0) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, HS_NAME_MAX) : '';
  const entryLines = Number(raw.lines);
  const entryCombo = Number(raw.maxCombo);
  return {
    name: name || HS_DEFAULT_NAME,
    score: Math.max(0, Math.floor(score)),
    lines: Number.isFinite(entryLines) ? Math.max(0, Math.floor(entryLines)) : 0,
    maxCombo: Number.isFinite(entryCombo) ? Math.max(0, Math.floor(entryCombo)) : 0,
    date: typeof raw.date === 'string' ? raw.date : '',
  };
}

// Never trust what is in localStorage: corrupt or foreign data must not crash the game.
function hsLoadScores() {
  const stored = hsReadStorage(HS_KEY);
  if (!stored) return [];
  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(hsSanitizeEntry)
    .filter(entry => entry !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, HS_MAX_ENTRIES);
}

function hsQualifies(value) {
  if (!value || value <= 0) return false;
  const entries = hsLoadScores();
  if (entries.length < HS_MAX_ENTRIES) return true;
  return value > entries[entries.length - 1].score;
}

// Returns the index of the saved entry inside the stored top, or -1 if it did not make it.
function hsSaveEntry(entry) {
  const entries = hsLoadScores();
  entries.push(entry);
  entries.sort((a, b) => b.score - a.score);
  const top = entries.slice(0, HS_MAX_ENTRIES);
  // Without a successful write the table is re-rendered from storage, so there is nothing to highlight.
  if (!hsWriteStorage(HS_KEY, JSON.stringify(top))) return -1;
  return top.indexOf(entry);
}

function hsFormatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-ES');
}

function hsAppendText(parent, tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function hsRenderScores(container, highlightIndex) {
  const entries = hsLoadScores();
  container.textContent = '';
  hsAppendText(container, 'p', 'hs-scores-title', 'MEJORES PUNTUACIONES');

  if (!entries.length) {
    hsAppendText(container, 'p', 'hs-empty', 'Sin records todavía');
    return;
  }

  const table = document.createElement('table');
  table.className = 'hs-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS', 'COMBO'].forEach(text => {
    hsAppendText(headRow, 'th', '', text);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  entries.forEach((entry, index) => {
    const row = document.createElement('tr');
    if (index === highlightIndex) row.className = 'hs-row-highlight';
    const date = hsFormatDate(entry.date);
    if (date) row.title = date;
    hsAppendText(row, 'td', '', String(index + 1));
    // The name goes in a span: a max-width on the cell alone would not truncate a long name.
    const nameCell = document.createElement('td');
    nameCell.className = 'hs-cell-name';
    hsAppendText(nameCell, 'span', 'hs-cell-name-text', entry.name);
    row.appendChild(nameCell);
    hsAppendText(row, 'td', '', entry.score.toLocaleString());
    hsAppendText(row, 'td', '', String(entry.lines));
    hsAppendText(row, 'td', '', `x${entry.maxCombo}`);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  container.appendChild(table);

  const bestCombo = entries.reduce((best, entry) => Math.max(best, entry.maxCombo), 0);
  const bestLines = entries.reduce((best, entry) => Math.max(best, entry.lines), 0);
  hsAppendText(container, 'p', 'hs-summary', `Mejor combo: x${bestCombo} · Máx. líneas: ${bestLines}`);
}

function hsRefreshScores(highlightIndex) {
  hsRenderScores(hsGameOverScores, highlightIndex);
  hsRenderScores(startScores, -1);
}

// Called once per locked piece from clearLines().
function hsTrackCombo(cleared) {
  if (cleared > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
}

function hsCommitPendingEntry() {
  if (!hsPendingEntry) return -1;
  const name = hsNameInput.value.trim().slice(0, HS_NAME_MAX);
  hsPendingEntry.name = name || HS_DEFAULT_NAME;
  const index = hsSaveEntry(hsPendingEntry);
  hsPendingEntry = null;
  hsNameForm.classList.add('hs-hidden');
  return index;
}

// Runs from init(): flushes any unconfirmed entry, then clears the per-game counters.
function hsResetRun() {
  hsCommitPendingEntry();
  hsPanel.classList.add('hs-hidden');
  hsNameForm.classList.add('hs-hidden');
  startMenuBtn.classList.add('hs-hidden');
  combo = 0;
  maxCombo = 0;
}

function hsShowGameOver() {
  hsPendingEntry = null;
  hsPanel.classList.remove('hs-hidden');
  startMenuBtn.classList.remove('hs-hidden');
  hsRunSummary.textContent = `Líneas: ${lines} · Combo máx.: x${maxCombo}`;

  if (hsQualifies(score)) {
    hsPendingEntry = { name: HS_DEFAULT_NAME, score, lines, maxCombo, date: new Date().toISOString() };
    hsNameInput.value = HS_DEFAULT_NAME;
    hsNameForm.classList.remove('hs-hidden');
    hsRefreshScores(-1);
    hsNameInput.focus();
    hsNameInput.select();
  } else {
    hsNameForm.classList.add('hs-hidden');
    hsRefreshScores(-1);
  }
}

function hsDisarmReset() {
  clearTimeout(hsResetTimer);
  hsResetTimer = null;
  hsResetArmed = false;
  startResetBtn.textContent = 'Resetear records';
  startResetBtn.classList.remove('hs-btn-danger');
}

function hsLoadStartLevel() {
  return hsClampLevel(parseInt(hsReadStorage(HS_LEVEL_KEY), 10));
}

function startFillLevelOptions() {
  for (let value = 1; value <= START_LEVEL_MAX; value++) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = String(value);
    startLevelSelect.appendChild(option);
  }
}

function startShowScreen() {
  hsDisarmReset();
  // Read storage, not `startLevel`: the pause menu selector writes the preference
  // without touching the run in progress, so the variable can be one game behind.
  startLevelSelect.value = String(readStartLevel());
  hsRenderScores(startScores, -1);
  startScreen.classList.remove('hs-hidden');
}

// Game keys must stay inert while the start screen is up or the player is typing a name.
function hsKeysBlocked(e) {
  if (!startScreen.classList.contains('hs-hidden')) return true;
  const target = e.target;
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

hsNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    hsRefreshScores(hsCommitPendingEntry());
  }
});

hsSaveBtn.addEventListener('click', () => {
  hsSaveBtn.blur();
  hsRefreshScores(hsCommitPendingEntry());
});

startPlayBtn.addEventListener('click', () => {
  startPlayBtn.blur();
  startLevel = hsClampLevel(parseInt(startLevelSelect.value, 10));
  hsWriteStorage(HS_LEVEL_KEY, String(startLevel));
  startScreen.classList.add('hs-hidden');
  init();
});

startLevelSelect.addEventListener('change', () => {
  startLevel = hsClampLevel(parseInt(startLevelSelect.value, 10));
  startLevelSelect.value = String(startLevel);
  hsWriteStorage(HS_LEVEL_KEY, String(startLevel));
});

// Two-step confirmation: no blocking confirm() dialog.
startResetBtn.addEventListener('click', () => {
  startResetBtn.blur();
  if (!hsResetArmed) {
    hsResetArmed = true;
    startResetBtn.textContent = '¿Seguro?';
    startResetBtn.classList.add('hs-btn-danger');
    clearTimeout(hsResetTimer);
    hsResetTimer = setTimeout(hsDisarmReset, HS_RESET_TIMEOUT);
    return;
  }
  hsDisarmReset();
  try {
    localStorage.removeItem(HS_KEY);
  } catch (e) {
    // Nothing to do: storage is unavailable.
  }
  hsRenderScores(startScores, -1);
});

startMenuBtn.addEventListener('click', () => {
  startMenuBtn.blur();
  hsCommitPendingEntry();
  overlay.classList.add('hidden');
  hsPanel.classList.add('hs-hidden');
  startMenuBtn.classList.add('hs-hidden');
  startShowScreen();
});

// Keeps Space from re-triggering the focused button while the next game runs.
restartBtn.addEventListener('click', () => restartBtn.blur());

function startBoot() {
  startFillLevelOptions();
  startLevel = hsLoadStartLevel();
  startShowScreen();
}

/* ---- Pause menu ---- */

const START_LEVEL_KEY = 'tetris-start-level';
const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 15;

// Keys that drive the falling piece: blocked while the pause menu is open.
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX'];

const pauseOverlay = document.getElementById('pause-overlay');
const pauseResumeBtn = document.getElementById('pause-resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const pauseControlsBtn = document.getElementById('pause-controls-btn');
const pauseControls = document.getElementById('pause-controls');
const pauseLevelSelect = document.getElementById('pause-level-select');

// `startLevel` is declared with the high score state above. init() re-reads the
// stored preference into it, so changing either selector mid-game never speeds up
// or slows down the run already in progress.
function readStartLevel() {
  const stored = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
  if (!Number.isFinite(stored)) return MIN_START_LEVEL;
  return Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, stored));
}

function pauseSetControlsVisible(visible) {
  pauseControls.classList.toggle('pause-hidden', !visible);
  pauseControlsBtn.setAttribute('aria-expanded', String(visible));
  pauseControlsBtn.textContent = visible ? 'Ocultar controles' : 'Ver controles';
}

function pauseMenuOpen() {
  // Re-sync in case the start screen selector changed the preference.
  pauseLevelSelect.value = String(readStartLevel());
  pauseOverlay.classList.remove('pause-hidden');
  pauseResumeBtn.focus();
}

function pauseMenuClose() {
  // Drop focus so Enter cannot re-trigger the button that closed the menu.
  if (pauseOverlay.contains(document.activeElement)) document.activeElement.blur();
  pauseOverlay.classList.add('pause-hidden');
  pauseSetControlsVisible(false);
}

function pauseBuildMenu() {
  const controlsList = document.querySelector('.controls ul');
  if (controlsList) pauseControls.appendChild(controlsList.cloneNode(true));

  for (let lvl = MIN_START_LEVEL; lvl <= MAX_START_LEVEL; lvl++) {
    const option = document.createElement('option');
    option.value = String(lvl);
    option.textContent = String(lvl);
    pauseLevelSelect.appendChild(option);
  }
  pauseLevelSelect.value = String(readStartLevel());
}

pauseResumeBtn.addEventListener('click', () => {
  if (paused) togglePause();
});

pauseRestartBtn.addEventListener('click', init);

pauseControlsBtn.addEventListener('click', () => {
  pauseSetControlsVisible(pauseControls.classList.contains('pause-hidden'));
});

// Only the stored preference changes here: it lands on the next init().
pauseLevelSelect.addEventListener('change', () => {
  const value = Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, parseInt(pauseLevelSelect.value, 10) || MIN_START_LEVEL));
  pauseLevelSelect.value = String(value);
  localStorage.setItem(START_LEVEL_KEY, String(value));
});

pauseBuildMenu();

/* ------------------------------------------------------------------ *
 * Visual skins
 *
 * A skin is { label, colors, drawBlock }. `colors` is index-aligned with
 * COLORS / PIECES (index 0 is the null placeholder, 1..7 tetrominoes,
 * 8..12 specials). `drawBlock` has the same signature as the top-level
 * drawBlock, which dispatches to the active skin.
 * ------------------------------------------------------------------ */

const SKIN_KEY = 'tetris-skin';
const DEFAULT_SKIN = 'retro';

const skinSelector = document.getElementById('skin-selector');
const skinButtons = skinSelector ? Array.from(skinSelector.querySelectorAll('.skin-option')) : [];

let activeSkin = DEFAULT_SKIN;

// Traces a rounded rect path; falls back to quadratic corners where roundRect is missing.
function skinRoundRectPath(context, px, py, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(px, py, w, h, rad);
    return;
  }
  context.moveTo(px + rad, py);
  context.lineTo(px + w - rad, py);
  context.quadraticCurveTo(px + w, py, px + w, py + rad);
  context.lineTo(px + w, py + h - rad);
  context.quadraticCurveTo(px + w, py + h, px + w - rad, py + h);
  context.lineTo(px + rad, py + h);
  context.quadraticCurveTo(px, py + h, px, py + h - rad);
  context.lineTo(px, py + rad);
  context.quadraticCurveTo(px, py, px + rad, py);
  context.closePath();
}

// Texture cells on a 6x6 sub-grid, as [col, row].
const SKIN_PIXEL_LIGHT = [[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[0,2],[0,3],[0,4],[2,2],[3,1]];
const SKIN_PIXEL_DARK = [[5,1],[5,2],[5,3],[5,4],[5,5],[1,5],[2,5],[3,5],[4,5],[3,3],[2,4]];

const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = COLORS[colorIndex];
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    label: 'Neón',
    colors: [
      null,
      '#00fff7', // I
      '#ffe600', // O
      '#d400ff', // T
      '#00ff6a', // S
      '#ff0044', // Z
      '#00a2ff', // J
      '#ff8c00', // L
      '#ff00a0', // +
      '#00ffc8', // U
      '#7a5cff', // Y
      '#ffffff', // single
      '#ff5e00', // hollow 3x3
    ],
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const color = SKINS.neon.colors[colorIndex];
      const px = x * size + 2;
      const py = y * size + 2;
      const s = size - 4;
      const inset = Math.max(2, Math.round(size * 0.12));
      context.globalAlpha = alpha ?? 1;
      context.shadowColor = color;
      context.shadowBlur = size * 0.45;
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      // Shadow state is global: leaving it on would smear the grid and every later draw.
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      // Dark core leaves a bright rim, so the glow reads as a tube outline.
      context.fillStyle = 'rgba(4, 4, 12, 0.8)';
      context.fillRect(px + inset, py + inset, s - inset * 2, s - inset * 2);
      context.globalAlpha = 1;
    },
  },
  pastel: {
    label: 'Pastel',
    colors: [
      null,
      '#a8e0dd', // I
      '#ffe9ac', // O
      '#d8c2ef', // T
      '#bfe3c8', // S
      '#f3b9b9', // Z
      '#c3d7f4', // J
      '#ffd5ab', // L
      '#f5c2da', // +
      '#aedcd2', // U
      '#c5c8ee', // Y
      '#ded7f0', // single
      '#dcc9bd', // hollow 3x3
    ],
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const color = SKINS.pastel.colors[colorIndex];
      const px = x * size + 2;
      const py = y * size + 2;
      const s = size - 4;
      const radius = Math.max(2, Math.round(size * 0.3));
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      skinRoundRectPath(context, px, py, s, s, radius);
      context.fill();
      // Soft top gloss.
      context.fillStyle = 'rgba(255,255,255,0.5)';
      const gloss = Math.max(2, Math.round(s * 0.3));
      skinRoundRectPath(context, px + 3, py + 3, s - 6, gloss, Math.max(2, radius - 2));
      context.fill();
      context.globalAlpha = 1;
    },
  },
  pixel: {
    label: 'Píxel',
    colors: [
      null,
      '#2fbfbf', // I
      '#e0bc1f', // O
      '#9c3fc0', // T
      '#3fae3f', // S
      '#cf2f2f', // Z
      '#3f6fcf', // J
      '#df801f', // L
      '#df3f8f', // +
      '#1f9f8f', // U
      '#4f4fbf', // Y
      '#f0f0f0', // single
      '#8a6a50', // hollow 3x3
    ],
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const color = SKINS.pixel.colors[colorIndex];
      const px = x * size;
      const py = y * size;
      const cell = size / 6;
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      context.fillStyle = 'rgba(255,255,255,0.38)';
      for (const [cx, cy] of SKIN_PIXEL_LIGHT) context.fillRect(px + cx * cell, py + cy * cell, cell, cell);
      context.fillStyle = 'rgba(0,0,0,0.38)';
      for (const [cx, cy] of SKIN_PIXEL_DARK) context.fillRect(px + cx * cell, py + cy * cell, cell, cell);
      context.strokeStyle = 'rgba(0,0,0,0.55)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      context.globalAlpha = 1;
    },
  },
};

// localStorage throws in private mode and on quota errors; never let that break the game.
function readSkinPref() {
  try {
    return localStorage.getItem(SKIN_KEY);
  } catch (e) {
    return null;
  }
}

function writeSkinPref(name) {
  try {
    localStorage.setItem(SKIN_KEY, name);
  } catch (e) {
    // Preference simply will not persist.
  }
}

function applySkin(name) {
  // Own-property check: a stale/garbage stored value must not resolve through Object.prototype.
  activeSkin = Object.prototype.hasOwnProperty.call(SKINS, name) ? name : DEFAULT_SKIN;
  // Board background and grid color per skin come from CSS on <body>.
  for (const key of Object.keys(SKINS)) {
    document.body.classList.toggle(`skin-${key}`, key === activeSkin);
  }
  for (const btn of skinButtons) {
    const selected = btn.dataset.skin === activeSkin;
    btn.classList.toggle('skin-option-active', selected);
    btn.setAttribute('aria-pressed', String(selected));
  }
}

function initSkin() {
  applySkin(readSkinPref() || DEFAULT_SKIN);
}

for (const btn of skinButtons) {
  btn.addEventListener('click', () => {
    // Blur so the button never swallows Space/Enter meant for the game.
    btn.blur();
    if (btn.dataset.skin === activeSkin) return;
    applySkin(btn.dataset.skin);
    writeSkinPref(activeSkin);
    if (current) draw();
    if (next && !gameOver) drawNext();
  });
}

initSkin();
initTheme();
startBoot();
