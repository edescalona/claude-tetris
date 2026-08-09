# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Classic Tetris in vanilla JavaScript + HTML5 Canvas. Three files: `index.html`, `style.css`, `game.js`. No `package.json`, no bundler, no transpiler, no dependencies, no test suite.

## Running

```bash
open index.html            # macOS — works, file:// is enough (no modules, no fetch)
python3 -m http.server 8000  # or any static server, then open http://localhost:8000
```

There is no build, lint, or test command. Verification is manual: reload the page and play.

## Architecture (`game.js`)

Single IIFE-less script under `'use strict'`, all state in module-level `let` bindings (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `dropAccum`, `animId`). `init()` resets every one of them and is also the restart handler — any new state variable must be reset there or it leaks across games.

Data model:
- `board` is `ROWS × COLS` of ints: `0` = empty, `1..12` = piece type, which is also the index into `COLORS` and `PIECES`. These three arrays are index-aligned and each starts with a `null` placeholder at index 0. Adding a piece means appending to both `PIECES` and `COLORS` in the same position. `1..7` are the standard tetrominoes; `8..12` are the specials (`+`, `U`, `Y`, single, hollow 3×3) selected by `pickType`, which also consumes the `rewardPending` flag set by `clearLines` on a Tetris.
- A piece is `{ type, shape, x, y }` where `shape` is a square matrix of the same int; rotation mutates `shape` in place via `rotateCW` (transpose + row reverse), so pieces are never rotation-state indexed. `tryRotate` implements ad-hoc wall kicks by testing x-offsets `[0,-1,1,-2,2]` — this is not SRS.

Loop and rendering:
- `loop(ts)` is a `requestAnimationFrame` accumulator: adds `dt` to `dropAccum`, drops one row when `dropAccum >= dropInterval`, then `draw()`s the full frame (grid, board, ghost, current piece). Everything redraws every frame; there is no dirty-region logic.
- Pause stops the loop with `cancelAnimationFrame(animId)` — it is triggered from a keydown, outside the frame, so `animId` is a pending handle there; `togglePause` restarts it and must reset `lastTime` first or the first frame after resume gets a huge `dt`. Game over cannot rely on that alone: `endGame` is often reached from *inside* the running frame (`loop` → `lockPiece` → `spawn`), where `animId` is the current frame and cancelling it is a no-op — so `loop` also checks `gameOver` before scheduling the next frame, and `draw` returns early on `gameOver` to freeze the board without ghost or falling piece.
- The HUD is DOM, not canvas: `updateHUD()` writes to `#score`/`#lines`/`#level`. Any code that changes `score`, `lines`, or `level` outside the keydown handler must call `updateHUD()` itself (`clearLines` and `softDrop` do; `hardDrop` relies on the keydown handler's trailing call).

Progression: `level = floor(lines / 10) + 1`, `dropInterval = max(100, 1000 - (level - 1) * 90)`, line score `LINE_SCORES[cleared] * level`, hard drop `+2`/cell, soft drop `+1`/row.

## Cross-file coupling

Canvas dimensions are hardcoded in `index.html` (`#board` 300×600, `#next-canvas` 120×120) and must stay equal to `COLS * BLOCK` × `ROWS * BLOCK`. Changing `COLS`, `ROWS`, or `BLOCK` in `game.js` without editing the HTML silently clips or letterboxes the board. `drawNext` also assumes a 4×4 preview grid at 30px.

All DOM lookups happen at script top-level by id, so `game.js` must load after the markup (it does — `<script>` is at end of `<body>`, no `defer`).

## Conventions

- UI strings and README are Spanish; identifiers, comments, and docstrings are English.
- No frameworks or dependencies — keep it that way unless explicitly asked.
