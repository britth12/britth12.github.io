const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
const W      = canvas.width;   //800
const H      = canvas.height;  //400
ctx.imageSmoothingEnabled = false; //* Bit 

//first screen
const START_TITLE_LINE1_SCALE  = 0.52; // volumagus 
const START_TITLE_LINE2_SCALE  = 0.44; // the vast
const START_INSTRUCT_SCALE     = 0.19; 
const START_CONTROLS_SCALE     = 0.16; 
const START_PROMPT_SCALE       = 0.22; 

//game screen
const HUD_SCORE_LABEL_SCALE    = 0.24; 
const HUD_TIME_LABEL_SCALE     = 0.24; 
const HUD_SCORE_NUM_SIZE       = 28;  
const HUD_TIME_NUM_SIZE        = 28;   

//game over screen
const END_GAMEOVER_SCALE       = 0.62; // "GAME" and "OVER" stacked text
const END_SUBTITLE_SCALE       = 0.26; // "YOUR VOLUME IS" line
const END_SCORE_NUM_SIZE       = 48;   
const END_THANKS_SCALE         = 0.20; 

// =============================================================================
// ASSET LOADING
// =============================================================================

const assets      = {};
let assetsLoaded  = 0;
let assetsTotal   = 0;
let onAssetsReady = null;

// ── Number image names ────────────────────────────────────────────────────────
// Maps digit (0–9) to the PNG filename in the Numbers/ folder.
// Zero.png was added by you — used for score display and timer.
// key format: 'num_0' through 'num_9'
// file format: Numbers/Zero.png through Numbers/Nine.png
const NUMBER_FILE_NAMES = {
  0: 'Zero', 
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
};

// Build asset list entries for all 10 digit images (0–9)
const digitAssets = Object.entries(NUMBER_FILE_NAMES).map(([digit, name]) => ({
  key: 'num_' + digit,           // e.g. 'num_0', 'num_3', 'num_9'
  src: 'Numbers/' + name + '.png', // e.g. Numbers/Zero.png, Numbers/Three.png
}));

const ASSET_LIST = [
  { key: 'bg',     src: 'Background.png'    }, // Background stone tile — drawn first every frame
  { key: 'floor',  src: 'Floor.png'         }, // Floor stone — RGBA PNG, upper area transparent
  { key: 'plank1', src: 'Planks/Plank1.png' }, // Top-left platform texture
  { key: 'plank2', src: 'Planks/Plank2.png' }, // Top-right platform texture
  { key: 'plank3', src: 'Planks/Plank3.png' }, // Center-mid platform texture
  { key: 'plank4', src: 'Planks/Plank4.png' }, // Left-lower platform texture
  { key: 'plank5', src: 'Planks/Plank5.png' }, // Right-lower platform texture
  { key: 'wizRaw',   src: 'WizWalk.png'     }, // Raw wizard sheet — processed at runtime by processWizard()
  { key: 'fontRaw', src: 'LETTERSHEET.png'  }, // Raw A–Z letter sheet — processed at runtime by processFont()
  ...digitAssets,                               // num_0 through num_9 from Numbers/ folder
];

function loadAssets(onDone) {
  onAssetsReady = onDone;
  assetsTotal   = ASSET_LIST.length;
  assetsLoaded  = 0;

  function checkDone() {
    assetsLoaded++;
    if (assetsLoaded < assetsTotal) return;
    // All images loaded — process WizWalk.png then LETTERSHEET.png
    processWizard(() => processFont(onDone));
  }

  ASSET_LIST.forEach(({ key, src }) => {
    const img   = new Image();
    img.id      = key; // id attribute matches the asset key for identification
    img.onload  = checkDone;
    img.onerror = () => { console.warn('Asset failed to load:', src); checkDone(); };
    img.src     = src;
    assets[key] = img;
  });
}

// =============================================================================
// WIZARD PROCESSOR
// =============================================================================
// Runs once after WizWalk.png finishes loading.
// WizWalk.png is your raw 4389×882 file with:
//   - 5 animation frames side by side
//   - Blue vertical divider lines between frames
//   - Solid black background
// This function:
//   1. Reads every pixel from the raw image
//   2. Finds the blue dividers to locate frame boundaries
//   3. Removes the black background (makes it transparent)
//   4. Crops all 5 frames to the same tight bounding box
//   5. Scales them down to game size
//   6. Assembles them into an offscreen canvas (assets.wiz)
// The game then draws from assets.wiz exactly like a normal image.

function processWizard(onDone) {
  const raw = assets.wizRaw;

  if (!raw || !raw.complete || !raw.naturalWidth) {
    console.warn('WizWalk.png failed to load — wizard will show as blue placeholder');
    assets.wiz = null;
    onDone();
    return;
  }

  // Step 1: Draw raw image onto a temporary canvas so we can read its pixels
  const tempC     = document.createElement('canvas');
  tempC.width     = raw.naturalWidth;   // 4389px
  tempC.height    = raw.naturalHeight;  // 882px
  const tempCtx   = tempC.getContext('2d');
  tempCtx.drawImage(raw, 0, 0);
  const rawData   = tempCtx.getImageData(0, 0, tempC.width, tempC.height);
  const px        = rawData.data; // flat array: [R,G,B,A, R,G,B,A, ...]
  const IW        = tempC.width;
  const IH        = tempC.height;

  // Step 2: Find the 4 blue divider columns
  // A divider column has most of its pixels with blue >> red (the colour of your separator lines)
  const dividers = [];
  for (let x = 100; x < IW - 100; x++) {
    let blueCount = 0;
    for (let y = 0; y < IH; y++) {
      const i = (y * IW + x) * 4;
      if (px[i+2] - px[i] > 40 && px[i+2] > 60) blueCount++; // blue dominates red
    }
    if (blueCount / IH > 0.5) {
      // Only keep the first column of each divider group (ignore adjacent blue columns)
      if (!dividers.length || x - dividers[dividers.length - 1] > 20) {
        dividers.push(x);
      }
    }
  }

  // Step 3: Compute the 5 frame x-ranges (skip past the divider pixels)
  const frameStarts = [0, ...dividers.map(d => d + 20)];
  const frameEnds   = [...dividers, IW];

  // Trim any residual blue pixels at the start of each frame region
  const frameRegions = frameStarts.map((s, i) => {
    let start = s;
    while (start < frameEnds[i]) {
      let isBlue = true;
      for (let y = 0; y < IH; y++) {
        const idx = (y * IW + start) * 4;
        if (px[idx+2] - px[idx] < 30) { isBlue = false; break; }
      }
      if (!isBlue) break;
      start++;
    }
    return [start, frameEnds[i]];
  });

  // Step 4: Extract each frame, remove black background, track content bounding box
  const frameCanvases = [];
  const bboxes        = [];

  frameRegions.forEach(([x1, x2]) => {
    const fw    = x2 - x1;
    const fc    = document.createElement('canvas');
    fc.width    = fw;
    fc.height   = IH;
    const fctx  = fc.getContext('2d');
    const imgD  = fctx.createImageData(fw, IH);
    const fd    = imgD.data;
    let minX = fw, maxX = 0, minY = IH, maxY = 0;

    for (let y = 0; y < IH; y++) {
      for (let x = 0; x < fw; x++) {
        const srcI  = (y * IW + (x1 + x)) * 4;
        const dstI  = (y * fw + x) * 4;
        const r = px[srcI], g = px[srcI+1], b = px[srcI+2];
        // Pixels where all channels < 25 are the black background — make transparent
        const isBlack = r < 25 && g < 25 && b < 25;
        fd[dstI]   = r;
        fd[dstI+1] = g;
        fd[dstI+2] = b;
        fd[dstI+3] = isBlack ? 0 : 255;
        if (!isBlack) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    fctx.putImageData(imgD, 0, 0);
    frameCanvases.push(fc);
    bboxes.push([minX, minY, maxX, maxY]);
  });

  // Step 5: Compute the union bounding box — same crop for every frame
  // This ensures all frames are the same size and the wizard doesn't jump around
  const ul = Math.min(...bboxes.map(b => b[0]));
  const ut = Math.min(...bboxes.map(b => b[1]));
  const ur = Math.max(...bboxes.map(b => b[2]));
  const ub = Math.max(...bboxes.map(b => b[3]));
  const contentW = ur - ul;
  const contentH = ub - ut;

  // Step 6: Scale to game size and build the final offscreen sprite sheet
  // ↓ Change TARGET_H to make the wizard taller or shorter in-game
  const TARGET_H   = 96;
  const TARGET_W   = Math.round(contentW / contentH * TARGET_H);
  const PAD        = 6;  // transparent padding around each frame so edges aren't clipped
  const CELL_W     = TARGET_W + PAD * 2;
  const CELL_H     = TARGET_H + PAD;
  const NUM_FRAMES = frameCanvases.length; // should be 5

  // Store cell dimensions on assets so drawWizard() can read them at draw time
  assets.wizCellW = CELL_W;
  assets.wizCellH = CELL_H;

  const sheetC   = document.createElement('canvas');
  sheetC.width   = CELL_W * NUM_FRAMES;
  sheetC.height  = CELL_H;
  const sheetCtx = sheetC.getContext('2d');
  sheetCtx.imageSmoothingEnabled = false; // pixel art — no blurring when scaling

  frameCanvases.forEach((fc, i) => {
    const cropX = Math.min(ul, fc.width - 1);
    const cropW = Math.min(contentW, fc.width - cropX);
    sheetCtx.drawImage(
      fc,
      cropX, ut, cropW, contentH,              // source region: content crop
      i * CELL_W + PAD, PAD, TARGET_W, TARGET_H // destination: padded cell on sheet
    );
  });

  assets.wiz = sheetC; // store the finished offscreen canvas — game draws from this
  console.log(`WizWalk processed: sheet=${sheetC.width}x${sheetC.height}, cell=${CELL_W}x${CELL_H}`);
  onDone();
}

// =============================================================================
// FONT PROCESSOR
// =============================================================================
// Runs once after LETTERSHEET.png finishes loading (chained after processWizard).
// LETTERSHEET.png is your raw 4526×868 file with:
//   - 2 visual rows of letters: Row 1 = A–M (y 0–344), Row 2 = N–Z (y 345–867)
//   - ~20px black gaps between each letter
//   - Solid black background
// This function:
//   1. Reads every pixel from the raw image via a temp canvas
//   2. Splits the image into two halves at the row boundary (y=345)
//   3. Scans each half column-by-column to find where each letter starts and ends
//   4. Removes the black background (makes it transparent)
//   5. Crops each letter to its tight bounding box
//   6. Scales each to a consistent cell size
//   7. Assembles all 26 letters into an offscreen canvas grid (assets.fontCanvas)
// drawStr() then reads from assets.fontCanvas using the glyphMap lookup.

function processFont(onDone) {
  const raw = assets.fontRaw; // the loaded LETTERSHEET.png image

  if (!raw || !raw.complete || !raw.naturalWidth) {
    console.warn('LETTERSHEET.png failed to load — letters will not display');
    assets.fontCanvas = null;
    onDone();
    return;
  }

  // Step 1: Draw raw image onto a temp canvas to read pixels
  const tempC   = document.createElement('canvas');
  tempC.width   = raw.naturalWidth;   // 4526
  tempC.height  = raw.naturalHeight;  // 868
  const tempCtx = tempC.getContext('2d');
  tempCtx.drawImage(raw, 0, 0);
  const imgData = tempCtx.getImageData(0, 0, tempC.width, tempC.height);
  const px      = imgData.data; // flat RGBA array [R,G,B,A, R,G,B,A, ...]
  const IW      = tempC.width;
  const IH      = tempC.height;

  // Step 2: Define the two row strips
  // Row 1 (A–M): top portion, y = 0 to ROW_SPLIT-1
  // Row 2 (N–Z): bottom portion, y = ROW_SPLIT to IH-1
  const ROW_SPLIT = 345; // determined by analysis of LETTERSHEET.png pixel content

  const rowStrips = [
    { yStart: 0,          yEnd: ROW_SPLIT - 1, letters: 'ABCDEFGHIJKLM' }, // Row 1: A–M
    { yStart: ROW_SPLIT,  yEnd: IH - 1,         letters: 'NOPQRSTUVWXYZ' }, // Row 2: N–Z
  ];

  // Step 3: For each row strip, scan columns to find letter boundaries
  // A letter boundary is a gap of MIN_GAP or more consecutive empty columns
  const MIN_GAP = 20; // minimum pixels of black between letters

  // Helper: check if a column has any non-black pixels within a row range
  function colHasContent(x, yStart, yEnd) {
    for (let y = yStart; y <= yEnd; y++) {
      const i = (y * IW + x) * 4;
      if (px[i] > 15 || px[i+1] > 15 || px[i+2] > 15) return true;
    }
    return false;
  }

  // Helper: find letter x-ranges in a row strip
  function findLetterRanges(yStart, yEnd) {
    const ranges = [];
    let inLetter  = false;
    let lStart    = 0;
    let gapCount  = 0;
    for (let x = 0; x < IW; x++) {
      if (colHasContent(x, yStart, yEnd)) {
        if (!inLetter) { lStart = x; inLetter = true; }
        gapCount = 0;
      } else {
        gapCount++;
        if (inLetter && gapCount >= MIN_GAP) {
          ranges.push([lStart, x - gapCount]); // end of this letter
          inLetter = false;
        }
      }
    }
    if (inLetter) ranges.push([lStart, IW - 1]); // last letter reaches edge
    return ranges;
  }

  // Step 4: Extract each letter — remove black bg, find tight bbox, store
  const letterImages = {}; // maps letter char → {canvas, bbox}

  rowStrips.forEach(({ yStart, yEnd, letters }) => {
    const ranges = findLetterRanges(yStart, yEnd);

    // Match found ranges to the expected letters in order
    // If we find fewer ranges than letters, we still map what we have
    ranges.forEach(([ x1, x2 ], i) => {
      if (i >= letters.length) return; // more ranges than letters — skip extras
      const letter = letters[i];
      const fw     = x2 - x1 + 1;
      const fh     = yEnd - yStart + 1;

      // Create a canvas for this letter's region
      const lc     = document.createElement('canvas');
      lc.width     = fw;
      lc.height    = fh;
      const lctx   = lc.getContext('2d');
      const lImgD  = lctx.createImageData(fw, fh);
      const ld     = lImgD.data;

      let minX = fw, maxX = 0, minY = fh, maxY = 0;

      // Copy pixels, making black → transparent and tracking content bounds
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const srcI   = ((yStart + y) * IW + (x1 + x)) * 4;
          const dstI   = (y * fw + x) * 4;
          const r = px[srcI], g = px[srcI+1], b = px[srcI+2];
          const isBlack = r < 20 && g < 20 && b < 20; // black background threshold
          ld[dstI]   = r;
          ld[dstI+1] = g;
          ld[dstI+2] = b;
          ld[dstI+3] = isBlack ? 0 : 255; // transparent if black, opaque otherwise
          if (!isBlack) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      lctx.putImageData(lImgD, 0, 0);
      letterImages[letter] = {
        canvas: lc,
        bbox:   [minX, minY, maxX + 1, maxY + 1], // tight content bounds within the canvas
      };
    });
  });

  console.log(`LETTERSHEET processed: found ${Object.keys(letterImages).length} / 26 letters`);

  // Step 5: Build the final font canvas — a uniform grid of cells
  // Each cell is CELL_W × CELL_H pixels, letters scaled to fit and centered.
  // Layout: 13 columns × 2 rows, matching the glyphMap in drawStr()
  // Row 0: A–M  |  Row 1: N–Z
  const CELL_W = 48;  // must match GLYPH_W constant used in drawStr/measureStr
  const CELL_H = 64;  // must match GLYPH_H constant used in drawStr/measureStr
  const COLS   = 13;
  const ROWS   = 2;

  const fontC   = document.createElement('canvas');
  fontC.width   = CELL_W * COLS; // 624px
  fontC.height  = CELL_H * ROWS; // 128px
  const fontCtx = fontC.getContext('2d');
  fontCtx.imageSmoothingEnabled = false; // pixel art — no blurring

  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  ABC.split('').forEach((letter, idx) => {
    const col    = idx % COLS;           // which column (0-12)
    const row    = Math.floor(idx / COLS); // which row (0 or 1)
    const destX  = col * CELL_W;
    const destY  = row * CELL_H;

    const entry = letterImages[letter];
    if (!entry) {
      console.warn('processFont: missing letter', letter);
      return; // cell stays blank
    }

    const { canvas: lc, bbox: [bx, by, bx2, by2] } = entry;
    const bw   = bx2 - bx; // bounding box width
    const bh   = by2 - by; // bounding box height

    // Scale letter to fit inside the cell with a small padding margin
    const PAD    = 3;
    const maxW   = CELL_W - PAD * 2;
    const maxH   = CELL_H - PAD * 2;
    const scale  = Math.min(maxW / bw, maxH / bh);
    const drawW  = Math.round(bw * scale);
    const drawH  = Math.round(bh * scale);

    // Center the scaled letter within the cell
    const offX   = destX + PAD + Math.round((maxW - drawW) / 2);
    const offY   = destY + PAD + Math.round((maxH - drawH) / 2);

    fontCtx.drawImage(
      lc,
      bx, by, bw, bh,         // source: tight crop of the letter
      offX, offY, drawW, drawH // destination: centered, scaled into the cell
    );
  });

  // Store the finished font canvas — drawStr() will read from this
  assets.fontCanvas = fontC;
  console.log(`Font canvas built: ${fontC.width}x${fontC.height}, ${CELL_W}x${CELL_H} per cell`);
  onDone();
}

// =============================================================================
// BACKGROUND + FLOOR
// =============================================================================
// Draw order every frame:
//   1. Background.png — fills entire canvas, drawn first (bottommost layer)
//   2. Floor.png      — RGBA with transparent upper area, drawn on top of background
//      The floor image is 2816x1408. Only the bottom ~12% has stone content.
//      The upper 88% is transparent (alpha=0) so only the tiles show.
//      This renders at full 100% opacity — no bleed-through from background.

function drawBackground() {
  // Layer 1: background
  if (assets.bg && assets.bg.complete && assets.bg.naturalWidth) {
    ctx.drawImage(assets.bg, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#0a0e1a'; // dark fallback while loading
    ctx.fillRect(0, 0, W, H);
  }
  // Layer 2: floor (drawn normally — transparency handled by PNG alpha channel)
  if (assets.floor && assets.floor.complete && assets.floor.naturalWidth) {
    ctx.drawImage(assets.floor, 0, 0, W, H);
  }
}

// =============================================================================
// PLATFORMS
// =============================================================================
// Positions taken pixel-perfectly from PlankLocation.png (same size as background).
// Ground (index 0): visual handled by Floor.png — no drawImage needed here.
// Ledges (indices 1–5): each stretched to fill its rectangle using its plank PNG.

const PLATFORMS = [
  { x: 0,   y: 350, w: 800, h: 50, plank: null      }, // Ground — Floor.png handles visual
  { x: 100, y: 90,  w: 221, h: 14, plank: 'plank1'  }, // Top-left
  { x: 602, y: 100, w: 160, h: 14, plank: 'plank2'  }, // Top-right
  { x: 334, y: 190, w: 228, h: 14, plank: 'plank3'  }, // Center-mid
  { x: 87,  y: 237, w: 172, h: 14, plank: 'plank4'  }, // Left-lower
  { x: 596, y: 252, w: 184, h: 14, plank: 'plank5'  }, // Right-lower
];

function drawLedges() {
  for (let i = 1; i < PLATFORMS.length; i++) {
    const p   = PLATFORMS[i];
    const img = assets[p.plank];
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, p.x, p.y, p.w, p.h); // stretch plank image to exact platform rect
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x, p.y + p.h - 2, p.w, 3); // thin shadow under plank
    } else {
      ctx.fillStyle = '#5c3d1e'; // fallback while loading
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
  }
}

// =============================================================================
// CUSTOM BITMAP FONT (A–Z)
// =============================================================================
// Font canvas: 624×128px, 13 cols × 2 rows, each glyph 48×64px — built by processFont() from LETTERSHEET.png
// Row 0 (y=0):   A B C D E F G H I J K L M
// Row 1 (y=64):  N O P Q R S T U V W X Y Z
// Letters are drawn from the sheet; spaces and unknown chars are skipped/fallback.

const GLYPH_W   = 48; // native width of one glyph on the sheet
const GLYPH_H   = 64; // native height of one glyph on the sheet
const GLYPH_GAP = 2;  // pixels between glyphs when drawing a string
const SPACE_W   = 14; // pixels wide for a space character

// Build the glyph lookup map: 'A' → {col:0, row:0}, 'N' → {col:0, row:1} etc.
const glyphMap = {};
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
for (let i = 0; i < ABC.length; i++) {
  glyphMap[ABC[i]] = { col: i % 13, row: Math.floor(i / 13) };
}

// Measure how wide a string will be at a given scale (used for centering)
function measureStr(str, scale) {
  let w = 0;
  const s = str.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if      (ch === ' ')   w += Math.round(SPACE_W * scale);
    else if (glyphMap[ch]) w += Math.round(GLYPH_W * scale) + Math.round(GLYPH_GAP * scale);
  }
  return Math.max(0, w - Math.round(GLYPH_GAP * scale));
}

// Draw a string using the custom bitmap font.
// x, y   = top-left starting position
// str    = text (only A–Z and spaces — other chars are skipped)
// scale  = size multiplier: 1.0 = native 48×64px, 0.5 = 24×32px
// align  = 'left' | 'center' | 'right'
function drawStr(x, y, str, scale, align) {
  scale = scale || 0.3;
  align = align || 'left';
  const gw  = Math.round(GLYPH_W   * scale);
  const gh  = Math.round(GLYPH_H   * scale);
  const gap = Math.round(GLYPH_GAP * scale);
  const spw = Math.round(SPACE_W   * scale);
  const s   = str.toUpperCase();

  let cx = x;
  if (align === 'center') cx = x - measureStr(s, scale) / 2;
  if (align === 'right')  cx = x - measureStr(s, scale);

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ' ') { cx += spw; continue; }
    if (glyphMap[ch] && assets.fontCanvas) {  // fontCanvas is set by processFont() after LETTERSHEET.png loads
      const g = glyphMap[ch];
      ctx.drawImage(
        assets.fontCanvas,  // offscreen canvas containing the cleaned, cropped letter grid
        g.col * GLYPH_W, g.row * GLYPH_H, GLYPH_W, GLYPH_H, // source crop
        Math.round(cx), y, gw, gh                              // dest on canvas
      );
      cx += gw + gap;
    }
    // Non-letter characters are silently skipped — use drawDigitStr for numbers
  }
}

// =============================================================================
// NUMBER IMAGE RENDERER
// =============================================================================
// Draws a number (integer) using your custom digit PNG images from Numbers/ folder.
// Each digit 0–9 maps to: num_0=Zero.png, num_1=One.png … num_9=Nine.png
//
// How it works:
//   1. Convert the number to a string, e.g. score=47 → "47"
//   2. Split into individual digits: ['4', '7']
//   3. For each digit, look up assets['num_4'] and assets['num_7']
//   4. Draw each digit image side by side at the given position
//
// x, y      = top-left of the first digit
// num       = the integer to display (0–999)
// digitH    = how tall each digit image should be drawn (width scales proportionally)
// align     = 'left' | 'center' | 'right' (centers the whole number)
// digitGap  = pixels between digit images (default 2)

function measureDigitStr(num, digitH, digitGap) {
  digitGap = digitGap || 2;
  const digits = String(num).split('');
  let totalW = 0;
  digits.forEach(d => {
    const img = assets['num_' + d];
    if (img && img.complete && img.naturalWidth) {
      // Scale width proportionally to digitH
      const aspect = img.naturalWidth / img.naturalHeight;
      totalW += Math.round(digitH * aspect) + digitGap;
    } else {
      totalW += Math.round(digitH * 0.7) + digitGap; // fallback estimate
    }
  });
  return Math.max(0, totalW - digitGap); // remove trailing gap
}

function drawDigitStr(x, y, num, digitH, align, digitGap) {
  digitGap  = digitGap  || 2;
  align     = align     || 'left';
  const digits = String(num).split(''); // e.g. 47 → ['4', '7']

  // Compute starting x based on alignment
  let cx = x;
  if (align === 'center') cx = x - measureDigitStr(num, digitH, digitGap) / 2;
  if (align === 'right')  cx = x - measureDigitStr(num, digitH, digitGap);

  digits.forEach(d => {
    const img = assets['num_' + d]; // look up e.g. assets['num_4'] = Numbers/Four.png
    if (img && img.complete && img.naturalWidth) {
      // Scale width proportionally so the image doesn't stretch
      const aspect = img.naturalWidth / img.naturalHeight;
      const dw     = Math.round(digitH * aspect);
      ctx.drawImage(img, Math.round(cx), y, dw, digitH);
      cx += dw + digitGap;
    } else {
      // Fallback: plain text if image not loaded
      ctx.save();
      ctx.font         = `bold ${digitH}px monospace`;
      ctx.fillStyle    = '#ffd700';
      ctx.textBaseline = 'top';
      ctx.textAlign    = 'left';
      ctx.fillText(d, Math.round(cx), y);
      cx += Math.round(digitH * 0.7) + digitGap;
      ctx.restore();
    }
  });
}

// =============================================================================
// WIZARD SPRITE
// =============================================================================

const WIZ_FRAMES   = 5;  // total frames in the walk cycle
const WIZ_IDLE_DLY = 12; // ticks between frames when standing still (lower = faster)
const WIZ_WALK_DLY = 5;  // ticks between frames when walking (lower = snappier)

let wizFrame = 0;
let wizTick  = 0;

function tickWizard(state) {
  if (state === 'jump') { wizFrame = 2; return; } // hold a mid-stride frame while airborne
  const delay = state === 'walk' ? WIZ_WALK_DLY : WIZ_IDLE_DLY;
  if (++wizTick >= delay) { wizTick = 0; wizFrame = (wizFrame + 1) % WIZ_FRAMES; }
}

function drawWizard() {
  const sheet = assets.wiz; // offscreen canvas built by processWizard()
  if (!sheet) {
    ctx.fillStyle = '#4fc3f7'; // blue placeholder if WizWalk.png failed
    ctx.fillRect(player.x, player.y, player.w, player.h);
    return;
  }
  const CW    = assets.wizCellW; // frame width  — set by processWizard()
  const CH    = assets.wizCellH; // frame height — set by processWizard()
  const destX = Math.round(player.x - (CW - player.w) / 2); // center sprite over collision box
  const destY = Math.round(player.y + player.h - CH);        // align sprite bottom with feet

  ctx.save();
  if (player.facing === -1) {
    // Mirror the sprite when facing left
    ctx.translate(destX + CW / 2, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(destX + CW / 2), 0);
  }
  ctx.drawImage(sheet, wizFrame * CW, 0, CW, CH, destX, destY, CW, CH);
  ctx.restore();
}

// =============================================================================
// PHYSICS + PLAYER
// =============================================================================

const GRAVITY      = 0.52;
const JUMP_FORCE   = -13;
const PLAYER_SPEED = 4.2;

const player = {
  x: 386, y: 298, // starting position — 298 = ground y(350) - player height(52)
  w: 36,  h: 52,  // collision box (narrower than the drawn sprite)
  vx: 0, vy: 0,
  onGround: false,
  facing:   1,     // 1 = right, -1 = left
};

function resetPlayer() {
  player.x = 386; player.y = 298;
  player.vx = 0; player.vy = 0;
  player.onGround = false; player.facing = 1;
  wizFrame = 0; wizTick = 0;
}

// =============================================================================
// INPUT
// =============================================================================

const keys = {};
window.addEventListener('keydown', e => {
  const BLOCK = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD'];
  if (BLOCK.includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  // Only start from the start screen — game over screen has no restart
  if (gameState === 'start') startGame();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// =============================================================================
// GAME STATE
// =============================================================================

const GAME_DURATION = 20;   // round length in seconds
const SPAWN_MS      = 2200; // ms between number spawns (lower = more frequent)
const MAX_NUMBERS   = 5;    // max collectible numbers on screen at once
const MAX_SCORE     = 100;  // score cap — reaching this ends the game immediately

let score      = 0;
let timeLeft   = GAME_DURATION;
let gameActive = false;
let gameState  = 'start'; // 'start' | 'playing' | 'gameover'
let numbers    = [];
let timerID    = null;
let spawnID    = null;
let rafID      = null;
let playedOnce = false; // prevents replaying — game can only be played once per page load

// =============================================================================
// NUMBER COLLECTIBLES (the things the player runs into to collect points)
// =============================================================================

const NUM_W = 28; // display width of each collectible number image on screen
const NUM_H = 28; // display height

function spawnNumber() {
  if (numbers.length >= MAX_NUMBERS) return;
  const p   = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
  const val = Math.floor(Math.random() * 9) + 1; // value 1–9 (collectibles are never zero)
  const pad = 24;
  numbers.push({
    x:     p.x + pad + Math.random() * (p.w - pad * 2),
    y:     p.y - 22,  // float above the platform surface
    value: val,       // used to look up the digit image: assets['num_' + val]
    bob:   Math.random() * Math.PI * 2, // random phase so numbers don't all bob in sync
  });
}

function drawNumbers(now) {
  for (const n of numbers) {
    const bobY = Math.sin(now + n.bob) * 5; // gentle floating animation ±5px
    const img  = assets['num_' + n.value];  // e.g. assets['num_7'] = Numbers/Seven.png
    const dx   = n.x - NUM_W / 2;
    const dy   = n.y + bobY - NUM_H / 2;
    ctx.save();
    ctx.shadowColor = '#ffd700'; // gold glow behind number images
    ctx.shadowBlur  = 14;
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, Math.round(dx), Math.round(dy), NUM_W, NUM_H);
    } else {
      // Fallback text while image loads
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n.value, n.x, n.y + bobY);
    }
    ctx.restore();
  }
}

// =============================================================================
// MUSIC
// =============================================================================

const music        = document.getElementById('bg-music');
let   musicStarted = false;
let   musicMuted   = false;

function tryStartMusic() {
  if (musicStarted) return;
  music.volume = 0.4;
  music.play().then(() => { musicStarted = true; }).catch(() => {});
}
document.addEventListener('click', tryStartMusic, { once: true });

const musicBtn = document.getElementById('music-btn');
musicBtn.addEventListener('click', e => {
  e.stopPropagation();
  if (!musicStarted) { tryStartMusic(); return; }
  musicMuted = !musicMuted;
  if (musicMuted) { music.pause(); musicBtn.textContent = '♪ OFF'; musicBtn.classList.add('muted'); }
  else            { music.play();  musicBtn.textContent = '♪';     musicBtn.classList.remove('muted'); }
});

// =============================================================================
// PHYSICS UPDATE
// =============================================================================

function update() {
  const goLeft  = keys['ArrowLeft']  || keys['KeyA'];
  const goRight = keys['ArrowRight'] || keys['KeyD'];

  player.vx = 0;
  if (goLeft)  { player.vx = -PLAYER_SPEED; player.facing = -1; }
  if (goRight) { player.vx =  PLAYER_SPEED; player.facing =  1; }

  player.x += player.vx;
  player.x  = Math.max(0, Math.min(W - player.w, player.x));

  player.vy      += GRAVITY;
  const prevBot   = player.y + player.h;
  player.y       += player.vy;
  player.onGround = false;

  // Top-surface platform collision
  for (const p of PLATFORMS) {
    const curBot = player.y + player.h;
    if (player.vy >= 0 && prevBot <= p.y + 1 && curBot >= p.y &&
        player.x + player.w > p.x + 2 && player.x < p.x + p.w - 2) {
      player.y = p.y - player.h; player.vy = 0; player.onGround = true;
    }
  }

  if ((keys['ArrowUp'] || keys['KeyW'] || keys['Space']) && player.onGround) {
    player.vy = JUMP_FORCE; player.onGround = false;
  }

  if (player.y > H + 60) resetPlayer(); // fell off bottom — respawn

  // Wizard animation state
  if      (!player.onGround)      tickWizard('jump');
  else if (goLeft || goRight)     tickWizard('walk');
  else                             tickWizard('idle');

  // Collect numbers — AABB overlap check
  const hw = NUM_W / 2 + 6;
  const hh = NUM_H / 2 + 6;
  numbers = numbers.filter(n => {
    const hit = player.x < n.x + hw && player.x + player.w > n.x - hw &&
                player.y < n.y + hh && player.y + player.h > n.y - hh;
    if (hit) {
      score = Math.min(score + n.value, MAX_SCORE); // add value, cap at MAX_SCORE
      if (score >= MAX_SCORE) endGame();            // instant end when score maxes out
      return false; // remove this number from the array
    }
    return true; // keep uncollected numbers
  });
}

// =============================================================================
// HUD — drawn on top of everything during gameplay
// =============================================================================
// Score and timer are both drawn using your custom digit images from Numbers/ folder.
// "SCORE" and "TIME" labels use your bitmap font (A–Z sheet).
// Sizes are controlled by the variables at the top of this file:
//   HUD_SCORE_LABEL_SCALE, HUD_TIME_LABEL_SCALE, HUD_SCORE_NUM_SIZE, HUD_TIME_NUM_SIZE

function drawHUD() {
  ctx.shadowBlur = 0; // clear any shadow from previous draw calls

  // ── SCORE (top-left) ──────────────────────────────────────────────────────
  // Draw the word "SCORE" using the bitmap font
  const scoreLabelX = 10;
  const scoreLabelY = 6;
  drawStr(scoreLabelX, scoreLabelY, 'SCORE', HUD_SCORE_LABEL_SCALE, 'left');

  // Draw the score number using digit images, placed right after the label
  // The score can be 0–100, so it may be 1, 2, or 3 digits
  const scoreLabelW = measureStr('SCORE', HUD_SCORE_LABEL_SCALE);
  const scoreNumX   = scoreLabelX + scoreLabelW + 6; // 6px gap after the label
  const scoreNumY   = scoreLabelY + Math.round(GLYPH_H * HUD_SCORE_LABEL_SCALE / 2)
                      - Math.round(HUD_SCORE_NUM_SIZE / 2); // vertically center digits on label
  drawDigitStr(scoreNumX, scoreNumY, score, HUD_SCORE_NUM_SIZE, 'left');

  // ── TIMER (top-right) ─────────────────────────────────────────────────────
  // The countdown goes from 20 down to 1, then the game ends.
  // We display it using digit images so it matches your custom number art.
  // "TIME" label is drawn to the RIGHT-ALIGNED edge, digits to its left.
  const timeLabelX = W - 10;
  const timeLabelY = 6;
  drawStr(timeLabelX, timeLabelY, 'TIME', HUD_TIME_LABEL_SCALE, 'right');

  // Draw the timer number just to the left of the "TIME" label
  const timeLabelW = measureStr('TIME', HUD_TIME_LABEL_SCALE);
  const timeNumW   = measureDigitStr(timeLeft, HUD_TIME_NUM_SIZE);
  const timeNumX   = timeLabelX - timeLabelW - timeNumW - 8; // 8px gap between number and label
  const timeNumY   = timeLabelY + Math.round(GLYPH_H * HUD_TIME_LABEL_SCALE / 2)
                     - Math.round(HUD_TIME_NUM_SIZE / 2); // vertically center
  drawDigitStr(timeNumX, timeNumY, timeLeft, HUD_TIME_NUM_SIZE, 'left');
}

// =============================================================================
// SCREENS
// =============================================================================

function drawScanlines() {
  // Subtle horizontal scan line effect for atmosphere
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, y, W, 2);
  }
}

// ── START SCREEN ──────────────────────────────────────────────────────────────
// Title: "VOLUMAGUS THE VAST" (two lines using bitmap font)
// Instructions: how to play
// Pulsing prompt: "PRESS A KEY TO BEGIN"
// Font sizes controlled by START_* variables at the top of this file.

function drawStartScreen() {
  drawBackground();
  drawLedges();

  // Dark overlay so text is readable over the background
  ctx.fillStyle = 'rgba(2,8,20,0.92)';
  ctx.fillRect(0, 0, W, H);
  drawScanlines();

  // Blue accent lines top and bottom
  ctx.fillStyle = '#0088cc';
  ctx.fillRect(0, 0, W, 2);
  ctx.fillRect(0, H - 2, W, 2);

  // ── Title ─────────────────────────────────────────────────────────────────
  // Line 1: "VOLUMAGUS"
  // Line 2: "THE VAST"
  // Sizes: START_TITLE_LINE1_SCALE and START_TITLE_LINE2_SCALE
  const t1H    = Math.round(GLYPH_H * START_TITLE_LINE1_SCALE);
  const t2H    = Math.round(GLYPH_H * START_TITLE_LINE2_SCALE);
  const titleY = 38;
  drawStr(W / 2, titleY,          'VOLUMAGUS', START_TITLE_LINE1_SCALE, 'center');
  drawStr(W / 2, titleY + t1H + 4, 'THE VAST',  START_TITLE_LINE2_SCALE, 'center');

  // Decorative divider line beneath title
  const divY = titleY + t1H + t2H + 14;
  ctx.fillStyle = 'rgba(0,170,255,0.45)';
  ctx.fillRect(W / 2 - 130, divY, 260, 1);

  // ── Instructions ──────────────────────────────────────────────────────────
  // Size: START_INSTRUCT_SCALE
  const iH = Math.round(GLYPH_H * START_INSTRUCT_SCALE) + 5;
  const iY = divY + 12;
  drawStr(W / 2, iY,           'RUN AND JUMP TO COLLECT',  START_INSTRUCT_SCALE, 'center');
  drawStr(W / 2, iY + iH,      'NUMBERS',                  START_INSTRUCT_SCALE, 'center');
  drawStr(W / 2, iY + iH * 2,  'YOU HAVE TWENTY SECONDS',  START_INSTRUCT_SCALE, 'center');

  // ── Controls hint ─────────────────────────────────────────────────────────
  // Size: START_CONTROLS_SCALE
  const cH = Math.round(GLYPH_H * START_CONTROLS_SCALE) + 4;
  const cY = iY + iH * 3 + 6;
  drawStr(W / 2, cY,      'WASD OR ARROWS TO MOVE', START_CONTROLS_SCALE, 'center');
  drawStr(W / 2, cY + cH, 'SPACE OR UP TO JUMP',    START_CONTROLS_SCALE, 'center');

  // ── Pulsing "PRESS A KEY TO BEGIN" prompt ─────────────────────────────────
  // Spells out correctly: "PRESS A KEY TO BEGIN"
  // Size: START_PROMPT_SCALE
  // Alpha pulses between 0.6 and 1.0 using a sine wave
  const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.004);
  ctx.globalAlpha = pulse;
  drawStr(W / 2, H - 44, 'PRESS A KEY TO BEGIN', START_PROMPT_SCALE, 'center');
  ctx.globalAlpha = 1; // always reset globalAlpha after using it
}

// ── GAME OVER SCREEN ──────────────────────────────────────────────────────────
// "GAME OVER" — large, in your bitmap font
// "YOUR VOLUME IS" — subtitle in your bitmap font
// Final score — displayed using your digit images from Numbers/ folder
// "THANKS FOR PLAYING" — small footer line
// Sizes controlled by END_* variables at the top of this file.

function drawGameOverScreen() {
  drawBackground();
  drawLedges();

  // Dark overlay
  ctx.fillStyle = 'rgba(2,4,14,0.94)';
  ctx.fillRect(0, 0, W, H);
  drawScanlines();

  // Red accent lines
  ctx.fillStyle = '#660000';
  ctx.fillRect(0, 0, W, 2);
  ctx.fillRect(0, H - 2, W, 2);

  // ── "GAME" and "OVER" stacked ─────────────────────────────────────────────
  // Size: END_GAMEOVER_SCALE
  const goH  = Math.round(GLYPH_H * END_GAMEOVER_SCALE);
  const goY  = 30;
  drawStr(W / 2, goY,          'GAME', END_GAMEOVER_SCALE, 'center');
  drawStr(W / 2, goY + goH + 4, 'OVER', END_GAMEOVER_SCALE, 'center');

  // Decorative divider
  const divY = goY + goH * 2 + 14;
  ctx.fillStyle = 'rgba(255,50,50,0.35)';
  ctx.fillRect(W / 2 - 110, divY, 220, 1);

  // ── "YOUR VOLUME IS" subtitle ─────────────────────────────────────────────
  // Placed just below the divider
  // Size: END_SUBTITLE_SCALE
  const subH = Math.round(GLYPH_H * END_SUBTITLE_SCALE);
  const subY = divY + 10;
  drawStr(W / 2, subY, 'YOUR VOLUME IS', END_SUBTITLE_SCALE, 'center');

  // ── Final score using digit images ────────────────────────────────────────
  // Score is displayed using the same Numbers/ images as everywhere else.
  // The score can be 0–100 (1–3 digits) — drawDigitStr handles all cases.
  // Size: END_SCORE_NUM_SIZE (pixel height of each digit image)
  const scoreY = subY + subH + 12;
  drawDigitStr(W / 2, scoreY, score, END_SCORE_NUM_SIZE, 'center');

  // ── "THANKS FOR PLAYING" footer ───────────────────────────────────────────
  // Size: END_THANKS_SCALE
  drawStr(W / 2, H - 46, 'THANKS FOR PLAYING', END_THANKS_SCALE, 'center');
}

// =============================================================================
// MAIN GAME DRAW — called every frame during gameplay
// =============================================================================

function drawGame(t) {
  const now = t ? t * 0.002 : Date.now() * 0.002; // slow time value for bob animation

  drawBackground(); // layer 1: Background.png then Floor.png
  drawLedges();     // layer 2: plank textures on each platform
  drawNumbers(now); // layer 3: collectible number images (bobbing)
  drawWizard();     // layer 4: wizard sprite (animated walk cycle)
  drawHUD();        // layer 5: SCORE and TIME — always drawn last (topmost)
}

// =============================================================================
// GAME FLOW
// =============================================================================

function startGame() {
  if (playedOnce) return; // one play per page load — no restart
  playedOnce = true;

  cancelAnimationFrame(rafID);
  clearInterval(timerID);
  clearInterval(spawnID);

  score = 0; timeLeft = GAME_DURATION; numbers = [];
  gameState = 'playing'; gameActive = true;
  resetPlayer();
  spawnNumber();

  // Countdown timer: fires every 1 second, decrements timeLeft
  // When timeLeft hits 0 after decrementing to 1 and then 0, endGame() is called.
  // The game ends after displaying "1" for one second — not after "0".
  timerID = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) endGame(); // end when counter reaches 0 (was showing 1)
  }, 1000);

  spawnID = setInterval(spawnNumber, SPAWN_MS);
  rafID   = requestAnimationFrame(gameLoop);
}

function endGame() {
  if (!gameActive) return; // guard against double-call
  gameActive = false;
  gameState  = 'gameover';
  clearInterval(timerID);
  clearInterval(spawnID);
  cancelAnimationFrame(rafID);
  rafID = requestAnimationFrame(menuLoop);
}

// =============================================================================
// LOOPS
// =============================================================================

function gameLoop(t) {
  if (!gameActive) return;
  update();
  drawGame(t);
  rafID = requestAnimationFrame(gameLoop);
}

function menuLoop() {
  if (gameState === 'start')    drawStartScreen();
  if (gameState === 'gameover') drawGameOverScreen();
  rafID = requestAnimationFrame(menuLoop);
}

// =============================================================================
// BOOT — load all assets then show start screen
// =============================================================================

loadAssets(() => {
  rafID = requestAnimationFrame(menuLoop);
});