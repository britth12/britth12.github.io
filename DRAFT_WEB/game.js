// ─────────────────────────────────────────────────────────────────────────────
// VOLUMAGUS THE VAST — game.js
// Canvas: 1200×600  (2:1 ratio matching Background.png / Floor.png at 2816×1408)
// All tuning variables are at the top. Change them freely — nothing is hardcoded
// below the TUNING block except internal logic constants that don't need changing.
// ─────────────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
const W = canvas.width, H = canvas.height; // 1200, 600
ctx.imageSmoothingEnabled = false; // nearest-neighbour scaling — keeps pixel art crisp

// ═════════════════════════════════════════════════════════════════════════════
//  TUNING — every meaningful size, speed, and darkness lives here
// ═════════════════════════════════════════════════════════════════════════════

// ── Background darkness overlays (0=transparent, 1=solid black) ─────────────
const OVERLAY_MENU  = 0.96; // start screen + game-over screen darkness
const OVERLAY_GAME  = 0.52; // in-game tint — raises contrast for HUD readability

// ── Start screen letter heights (px tall; width auto from aspect ratio) ──────
const START_TITLE_H    = 110; // "VOLUMAGUS"  — main title line
const START_SUB_H      = 88;  // "THE VAST"   — subtitle line
const START_PROMPT_H   = 32;  // "PRESS A KEY TO BEGIN" — pulsing bottom prompt

// ── HUD (in-game score + timer) letter and digit heights ─────────────────────
const HUD_LABEL_H  = 28;  // height of the word "SCORE" / "TIME" in your letter font
const HUD_NUM_H    = 38;  // height of the digit images (Numbers/*.png) for score+timer

// ── End screen letter and digit heights ──────────────────────────────────────
const END_GAMEOVER_H  = 90;  // "GAME" and "OVER" stacked
const END_TRAVELER_H  = 30;  // "TRAVELER YOUR VOLUME IS" subtitle
const END_SCORE_H     = 100; // final score digit images — made large for impact
const END_THANKS_H    = 22;  // "THANKS FOR PLAYING" footer

// ── Wizard ───────────────────────────────────────────────────────────────────
// TARGET_H: how tall the wizard is drawn on screen (px).
// The sprite processor will scale all 5 frames to this height preserving aspect ratio.
const WIZ_TARGET_H = 100;

// ── Collectible number images ─────────────────────────────────────────────────
// The floating numbers the player collects are drawn as square images this size.
const COLLECT_SIZE = 36;

// ── Plank height ──────────────────────────────────────────────────── ─────────
// Each plank is drawn at this height. Width is computed automatically from each
// plank image's own aspect ratio, so the texture never stretches.
const PLANK_H = 22;

// ── Physics ───────────────────────────────────────────────────────────────────
// GRAVITY:     added to vertical velocity every frame. Higher = heavier/faster fall.
// JUMP_FORCE:  instant upward velocity on jump. More negative = higher jump.
//              Max height = JUMP_FORCE² / (2×GRAVITY). At -11/0.60 ≈ 101px.
// SPEED:       horizontal pixels moved per frame while a direction key is held.
const GRAVITY    = 0.60;
const JUMP_FORCE = -15;
const SPEED      = 5.5;

// ── Letter-font spacing (relative to 16px reference size, scaled at draw time) ─
const LGAP  = 3;  // gap between letters
const LSPC  = 10; // width of a space character

// ═════════════════════════════════════════════════════════════════════════════
//  ASSET LOADING
//  Every image the game uses is declared here. loadAssets() fetches them all,
//  then chains processWizard → processLetters → boots the menu loop.
// ═════════════════════════════════════════════════════════════════════════════

const assets = {};
let assetsLoaded = 0, assetsTotal = 0;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUM_NAMES = {0:'Zero',1:'One',2:'Two',3:'Three',4:'Four',5:'Five',6:'Six',7:'Seven',8:'Eight',9:'Nine'};

const ASSET_LIST = [
  {key:'bg',       src:'Background.png'   },
  {key:'floor',    src:'Floor.png'        },
  {key:'plank1',   src:'Planks/Plank1.png'},
  {key:'plank2',   src:'Planks/Plank2.png'},
  {key:'plank3',   src:'Planks/Plank3.png'},
  {key:'plank4',   src:'Planks/Plank4.png'},
  {key:'plank5',   src:'Planks/Plank5.png'},
  {key:'wizRaw',   src:'WizWalk.png'      }, // raw sprite sheet — processed at runtime
  {key:'musicBtn', src:'MusicButton.png'  }, // custom 1998×1998 music toggle button
  ...ALPHABET.split('').map(l => ({key:'lr_'+l, src:'Letters/'+l+'.png'})),
  ...Object.entries(NUM_NAMES).map(([d,n]) => ({key:'num_'+d, src:'Numbers/'+n+'.png'})),
];

function loadAssets(onDone) {
  assetsTotal = ASSET_LIST.length; assetsLoaded = 0;
  // Each image fires the same callback on load or error.
  // When the last one finishes, we chain the two processors before calling onDone.
  const tick = () => { if (++assetsLoaded >= assetsTotal) processWizard(() => processLetters(onDone)); };
  ASSET_LIST.forEach(({key, src}) => {
    const img = new Image(); img.id = key;
    img.onload = tick;
    img.onerror = () => { console.warn('Asset failed:', src); tick(); };
    img.src = src; assets[key] = img;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  WIZARD PROCESSOR
//  WizWalk.png is a raw 4389×882 sprite sheet with 5 animation frames separated
//  by ~125px solid-black gaps. The exact frame x-ranges were measured from the file:
//    Frame 0: x 104–860   (756px wide)
//    Frame 1: x 986–1741  (755px wide)
//    Frame 2: x 1868–2624 (756px wide)
//    Frame 3: x 2750–3506 (756px wide)
//    Frame 4: x 3632–4388 (756px wide)
//  This function:
//    1. Draws WizWalk.png onto a temp canvas to read pixels via getImageData.
//    2. Crops each of the 5 frames using the hardcoded x-ranges (no guesswork).
//    3. Makes every pixel with R<25, G<25, B<25 transparent (removes black bg).
//    4. Computes the union bounding box across all 5 frames so every frame is
//       cropped identically — prevents the wizard from jumping around.
//    5. Scales all 5 frames to WIZ_TARGET_H tall (width proportional).
//    6. Assembles them side-by-side into a single offscreen canvas (assets.wiz).
//  drawWizard() then crops the right cell from assets.wiz each frame.
// ═════════════════════════════════════════════════════════════════════════════

// Hardcoded frame regions — measured directly from WizWalk.png pixel data.
// If you replace WizWalk.png with a new file, update these values.
const WIZ_FRAME_REGIONS = [[9,81],[93,165],[177,249],[261,333],[345,417]];
// Frame regions measured directly from WizWalk.png (418x84).
// Each frame is 73px wide. Gaps between frames are ~9px of solid black.
// If you replace WizWalk.png with a new layout, update these 5 pairs.

function processWizard(onDone) {
  const raw = assets.wizRaw;
  if (!raw?.naturalWidth) { assets.wiz = null; onDone(); return; }

  // Step 1 — read all pixels from the raw image
  const tc = document.createElement('canvas');
  tc.width = raw.naturalWidth; tc.height = raw.naturalHeight;
  const tx = tc.getContext('2d'); tx.drawImage(raw, 0, 0);
  const imgData = tx.getImageData(0, 0, tc.width, tc.height);
  const px = imgData.data; // flat RGBA array
  const IW = tc.width, IH = tc.height;

  // Step 2 — for each frame region, extract pixels, remove black bg, record content bbox
  const frameCvs = [], bboxes = [];
  WIZ_FRAME_REGIONS.forEach(([rx1, rx2]) => {
    const fw = rx2 - rx1;
    const fc = document.createElement('canvas'); fc.width = fw; fc.height = IH;
    const fx = fc.getContext('2d');
    const id = fx.createImageData(fw, IH); const fd = id.data;
    let x0=fw, xm=0, y0=IH, ym=0;

    for (let y = 0; y < IH; y++) {
      for (let x = 0; x < fw; x++) {
        const si = (y*IW + (rx1+x)) * 4;
        const di = (y*fw + x) * 4;
        const r=px[si], g=px[si+1], b=px[si+2];
        const isBg = r<25 && g<25 && b<25; // black background threshold
        fd[di]=r; fd[di+1]=g; fd[di+2]=b; fd[di+3] = isBg ? 0 : 255;
        if (!isBg) { x0=Math.min(x0,x); xm=Math.max(xm,x); y0=Math.min(y0,y); ym=Math.max(ym,y); }
      }
    }
    fx.putImageData(id, 0, 0);
    frameCvs.push(fc); bboxes.push([x0,y0,xm,ym]);
  });

  // Step 3 — union bounding box: same crop rectangle applied to every frame
  const ul=Math.min(...bboxes.map(b=>b[0])), ut=Math.min(...bboxes.map(b=>b[1]));
  const ur=Math.max(...bboxes.map(b=>b[2])), ub=Math.max(...bboxes.map(b=>b[3]));
  const cw = ur-ul, ch = ub-ut;

  // Step 4 — scale to WIZ_TARGET_H and assemble sprite sheet
  const TH=WIZ_TARGET_H, TW=Math.round(cw/ch*TH), PAD=5;
  const CW=TW+PAD*2, CH=TH+PAD;
  assets.wizCellW = CW; assets.wizCellH = CH; // saved so drawWizard() can read them

  const sheet = document.createElement('canvas');
  sheet.width = CW * frameCvs.length; sheet.height = CH;
  const sx = sheet.getContext('2d'); sx.imageSmoothingEnabled = false;

  frameCvs.forEach((fc, i) => {
    // Clamp crop to the frame canvas's actual width (frame 1 is 755px, others 756px)
    const cropW = Math.min(cw, fc.width - ul);
    sx.drawImage(fc, ul, ut, cropW, ch, i*CW+PAD, PAD, TW, TH);
  });

  assets.wiz = sheet;
  console.log(`Wizard ready: ${sheet.width}x${sheet.height}, cell=${CW}x${CH}, ${frameCvs.length} frames`);
  onDone();
}

// Wizard animation state
const WIZ_FRAMES=5, WIZ_IDLE_DLY=12, WIZ_WALK_DLY=5;
let wizFrame=0, wizTick=0;

// Advance the animation by one game tick.
// 'jump' holds frame 2 (a mid-stride pose that looks natural mid-air).
// 'walk' cycles faster than 'idle' to feel snappier while running.
function tickWizard(state) {
  if (state==='jump') { wizFrame=2; return; }
  const delay = state==='walk' ? WIZ_WALK_DLY : WIZ_IDLE_DLY;
  if (++wizTick >= delay) { wizTick=0; wizFrame=(wizFrame+1)%WIZ_FRAMES; }
}

// Draw the current animation frame centred horizontally over the collision box,
// bottom-aligned with the player's feet. Mirrors horizontally when facing left.
function drawWizard() {
  if (!assets.wiz) { ctx.fillStyle='#4fc3f7'; ctx.fillRect(player.x,player.y,player.w,player.h); return; }
  const CW=assets.wizCellW, CH=assets.wizCellH;
  const dx=Math.round(player.x-(CW-player.w)/2), dy=Math.round(player.y+player.h-CH);
  ctx.save();
  if (player.facing===-1) { ctx.translate(dx+CW/2,0); ctx.scale(-1,1); ctx.translate(-(dx+CW/2),0); }
  ctx.drawImage(assets.wiz, wizFrame*CW, 0, CW, CH, dx, dy, CW, CH);
  ctx.restore();
}

// ═════════════════════════════════════════════════════════════════════════════
//  LETTER PROCESSOR
//  Letters/A.png through Letters/Z.png each have a black background.
//  For every letter:
//    1. Draw onto temp canvas, read pixels via getImageData.
//    2. Any pixel with R<25, G<25, B<25 → alpha=0 (transparent).
//    3. Crop tightly to the content bounding box.
//    4. Store the cropped canvas as assets['lc_A'] etc.
//    5. Store the natural aspect ratio on the canvas as ._ar — drawStr() uses this
//       to calculate draw width = letterH × _ar, preserving proportions at any size.
// ═════════════════════════════════════════════════════════════════════════════

function processLetters(onDone) {
  let done=0;
  ALPHABET.split('').forEach(l => {
    const raw = assets['lr_'+l];
    const finish = () => { if (++done>=26) { console.log('Letters ready'); onDone(); } };
    if (!raw?.naturalWidth) { assets['lc_'+l]=null; finish(); return; }

    const tc=document.createElement('canvas'); tc.width=raw.naturalWidth; tc.height=raw.naturalHeight;
    const tx=tc.getContext('2d'); tx.drawImage(raw,0,0);
    const id=tx.getImageData(0,0,tc.width,tc.height); const px=id.data;
    let x0=tc.width, xm=0, y0=tc.height, ym=0;

    for (let i=0; i<px.length; i+=4) {
      const isBg = px[i]<25 && px[i+1]<25 && px[i+2]<25;
      px[i+3] = isBg ? 0 : 255;
      if (!isBg) {
        const xi=(i/4)%tc.width, yi=Math.floor((i/4)/tc.width);
        x0=Math.min(x0,xi); xm=Math.max(xm,xi); y0=Math.min(y0,yi); ym=Math.max(ym,yi);
      }
    }
    if (xm<=x0||ym<=y0) { assets['lc_'+l]=null; finish(); return; }
    tx.putImageData(id,0,0);

    const cw=xm-x0+1, ch=ym-y0+1;
    const out=document.createElement('canvas'); out.width=cw; out.height=ch;
    out.getContext('2d').drawImage(tc,x0,y0,cw,ch,0,0,cw,ch);
    out._ar = cw/ch; // aspect ratio stored on the canvas element for drawStr()
    assets['lc_'+l]=out;
    finish();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  FONT RENDERER — drawStr / measureStr
//  Uses per-letter canvases from processLetters().
//  letterH controls height in px; width is always auto from each letter's _ar.
//  Spacing (gap between letters, width of space) scales proportionally with letterH.
// ═════════════════════════════════════════════════════════════════════════════

const lgap  = h => Math.round(LGAP * h/16);  // inter-letter gap at given height
const lspc  = h => Math.round(LSPC * h/16);  // space character width at given height

function measureStr(str, h) {
  let w=0;
  for (const ch of str.toUpperCase()) {
    const lc=assets['lc_'+ch];
    w += ch===' ' ? lspc(h) : lc ? Math.round(h*lc._ar)+lgap(h) : 0;
  }
  return Math.max(0, w-lgap(h)); // remove trailing gap after last character
}

// x,y = reference point; align governs whether x is left-edge, centre, or right-edge
function drawStr(x, y, str, h, align='left') {
  let cx = align==='center' ? x-measureStr(str,h)/2 : align==='right' ? x-measureStr(str,h) : x;
  for (const ch of str.toUpperCase()) {
    if (ch===' ') { cx+=lspc(h); continue; }
    const lc=assets['lc_'+ch];
    if (lc) { const dw=Math.round(h*lc._ar); ctx.drawImage(lc,0,0,lc.width,lc.height,Math.round(cx),y,dw,h); cx+=dw+lgap(h); }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  DIGIT RENDERER — drawDigitStr / measureDigitStr
//  Draws integers using Numbers/*.png images.
//  Each digit's draw width = digitH × (img.naturalWidth / img.naturalHeight).
//  Handles any integer 0–999 automatically by splitting into individual digits.
// ═════════════════════════════════════════════════════════════════════════════

function measureDigitStr(num, h, gap=4) {
  let w=0;
  for (const d of String(num)) {
    const img=assets['num_'+d];
    w += (img?.naturalWidth ? Math.round(h*img.naturalWidth/img.naturalHeight) : Math.round(h*0.7)) + gap;
  }
  return Math.max(0, w-gap);
}

function drawDigitStr(x, y, num, h, align='left', gap=4) {
  let cx = align==='center' ? x-measureDigitStr(num,h,gap)/2 : align==='right' ? x-measureDigitStr(num,h,gap) : x;
  for (const d of String(num)) {
    const img=assets['num_'+d];
    if (img?.naturalWidth) {
      const dw=Math.round(h*img.naturalWidth/img.naturalHeight);
      ctx.drawImage(img,Math.round(cx),y,dw,h); cx+=dw+gap;
    } else {
      ctx.save(); ctx.font=`bold ${h}px monospace`; ctx.fillStyle='#ffd700';
      ctx.textBaseline='top'; ctx.textAlign='left'; ctx.fillText(d,Math.round(cx),y);
      cx+=Math.round(h*0.7)+gap; ctx.restore();
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  BACKGROUND + FLOOR
//  Background.png is drawn first, stretched to fill the canvas.
//  Floor.png is an RGBA PNG where the upper ~88% is fully transparent;
//  only the bottom stone-tile strip (y≈525+ at 1200×600) is opaque.
//  Drawing Floor.png on top of Background.png with source-over compositing
//  gives a clean floor with 100% opacity — no background bleed-through.
//  tintAlpha: if non-zero, a solid black rect is drawn on top at that opacity
//  to darken the scene (menu screens use 0.96, gameplay uses 0.52).
// ═════════════════════════════════════════════════════════════════════════════

function drawBG(tintAlpha=0) {
  if (assets.bg?.naturalWidth) ctx.drawImage(assets.bg,0,0,W,H);
  else { ctx.fillStyle='#0a0e1a'; ctx.fillRect(0,0,W,H); }
  if (assets.floor?.naturalWidth) ctx.drawImage(assets.floor,0,0,W,H);
  if (tintAlpha) { ctx.fillStyle=`rgba(0,0,0,${tintAlpha})`; ctx.fillRect(0,0,W,H); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  PLATFORMS
//  Ground (index 0) at y=525 — its visual is Floor.png, no drawImage needed.
//  Ledges (indices 1–11): each platform stores its plank key.
//  drawLedges() draws each plank at its NATURAL aspect ratio width so the texture
//  never stretches. Width = PLANK_H × (img.naturalWidth / img.naturalHeight).
//  Platform collision in update() uses the same natural width.
//  The PLATFORMS array stores w=0; actual w is computed lazily via plankW().
//
//  Layout: 4 rows at y=115,210,310,415 — each row is ~95–105px above the next.
//  Max jump height with JUMP_FORCE=-11, GRAVITY=0.60 is ~101px, so every row
//  is exactly one jump apart. Chain path: ground→y415→y310→y210→y115.
// ═════════════════════════════════════════════════════════════════════════════

// Returns the natural draw width for a plank key at the current PLANK_H.
// Computed on the fly so changing PLANK_H automatically resizes all platforms.
function plankW(key) {
  const img = assets[key];
  if (!img?.naturalWidth) return 120; // fallback while image loads
  return Math.round(PLANK_H * img.naturalWidth / img.naturalHeight);
}

const PLATFORMS = [
  {x:0,   y:525, h:75,      plank:null    }, // ground — Floor.png handles visual
  // Row: lower (y=415)
  {x:80,  y:415, h:PLANK_H, plank:'plank1'},
  {x:480, y:415, h:PLANK_H, plank:'plank3'},
  {x:900, y:415, h:PLANK_H, plank:'plank5'},
  // Row: mid (y=310)
  {x:180, y:310, h:PLANK_H, plank:'plank2'},
  {x:520, y:310, h:PLANK_H, plank:'plank4'},
  {x:870, y:310, h:PLANK_H, plank:'plank1'},
  // Row: upper (y=210)
  {x:50,  y:210, h:PLANK_H, plank:'plank3'},
  {x:440, y:210, h:PLANK_H, plank:'plank5'},
  {x:920, y:210, h:PLANK_H, plank:'plank2'},
  // Row: top (y=115)
  {x:260, y:115, h:PLANK_H, plank:'plank4'},
  {x:740, y:115, h:PLANK_H, plank:'plank3'},
];

function drawLedges() {
  for (let i=1; i<PLATFORMS.length; i++) {
    const p=PLATFORMS[i], img=assets[p.plank];
    const w=plankW(p.plank); // natural-ratio width — no stretching
    if (img?.naturalWidth) {
      ctx.drawImage(img, p.x, p.y, w, p.h);
      // Thin drop shadow beneath each plank for visual grounding
      ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(p.x, p.y+p.h-2, w, 3);
    } else {
      ctx.fillStyle='#5c3d1e'; ctx.fillRect(p.x, p.y, w, p.h);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  PLAYER / PHYSICS
//  Collision box is smaller than the drawn wizard sprite — this is intentional.
//  The wizard's staff and hat extend outside the collision box so the game feels
//  fair (you won't get hit by something that visually looks like it missed).
//  SPAWN_Y positions the player standing on the ground platform.
// ═════════════════════════════════════════════════════════════════════════════

const SPAWN_Y = 525 - 66; // ground.y(525) minus player height(66) = 459
const player = {x:586, y:SPAWN_Y, w:42, h:66, vx:0, vy:0, onGround:false, facing:1};
// x:586 = horizontal centre of 1200px canvas  |  w:42 h:66 = collision box

function resetPlayer() {
  Object.assign(player, {x:586, y:SPAWN_Y, vx:0, vy:0, onGround:false, facing:1});
  wizFrame=0; wizTick=0;
}

// ═════════════════════════════════════════════════════════════════════════════
//  INPUT
// ═════════════════════════════════════════════════════════════════════════════

const keys={};
window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) e.preventDefault();
  keys[e.code]=true;
  if (gameState==='start') startGame(); // any key starts the game from the title screen
});
window.addEventListener('keyup', e => { keys[e.code]=false; });

// ═════════════════════════════════════════════════════════════════════════════
//  GAME STATE
// ═════════════════════════════════════════════════════════════════════════════

const GAME_DURATION=20, SPAWN_MS=2200, MAX_NUMBERS=5, MAX_SCORE=100;
let score=0, timeLeft=GAME_DURATION, gameActive=false, gameState='start';
let numbers=[], timerID=null, spawnID=null, rafID=null, playedOnce=false;

// ═════════════════════════════════════════════════════════════════════════════
//  COLLECTIBLES
//  Numbers 1–9 float above platforms. They bob up and down using Math.sin().
//  Each number stores a random bob phase so they don't all move in sync.
//  Collision uses a square hit radius around the number's centre position.
// ═════════════════════════════════════════════════════════════════════════════

function spawnNumber() {
  if (numbers.length>=MAX_NUMBERS) return;
  const p=PLATFORMS[Math.floor(Math.random()*PLATFORMS.length)];
  const w=p.plank ? plankW(p.plank) : p.x; // ground uses full width, ledges use natural plank width
  const pad=20;
  numbers.push({x:p.x+pad+Math.random()*(w-pad*2), y:p.y-22, value:Math.floor(Math.random()*9)+1, bob:Math.random()*Math.PI*2});
}

function drawNumbers(now) {
  for (const n of numbers) {
    const by=Math.sin(now+n.bob)*5, img=assets['num_'+n.value];
    ctx.save(); ctx.shadowColor='#ffd700'; ctx.shadowBlur=14;
    if (img?.naturalWidth) ctx.drawImage(img, Math.round(n.x-COLLECT_SIZE/2), Math.round(n.y+by-COLLECT_SIZE/2), COLLECT_SIZE, COLLECT_SIZE);
    else { ctx.font=`bold ${COLLECT_SIZE}px monospace`; ctx.fillStyle='#ffd700'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(n.value,n.x,n.y+by); }
    ctx.restore();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  MUSIC BUTTON
//  MusicButton.png replaces the old HTML button in the corner.
//  It is drawn directly on the canvas as a small square in the bottom-right.
//  Clicking inside that square on the canvas toggles music on/off.
//  musicBtnRect tracks the on-screen position for hit testing.
// ═════════════════════════════════════════════════════════════════════════════

const music=document.getElementById('bg-music');
let musicStarted=false, musicMuted=false;
const MBTN_SIZE = 44; // drawn size of the music button square (px)
const musicBtnRect = {x: W-MBTN_SIZE-10, y: H-MBTN_SIZE-10, w: MBTN_SIZE, h: MBTN_SIZE};

function tryStartMusic() {
  if (musicStarted) return;
  music.volume=0.4;
  music.play().then(()=>musicStarted=true).catch(()=>{});
}
document.addEventListener('click', tryStartMusic, {once:true});

// Canvas click → check if the hit lands inside the music button rect, then toggle
canvas.addEventListener('click', e => {
  const rect=canvas.getBoundingClientRect();
  // Scale mouse coords from CSS pixels to canvas pixels (in case CSS scales the canvas)
  const mx=(e.clientX-rect.left)*(W/rect.width);
  const my=(e.clientY-rect.top)*(H/rect.height);
  if (mx>=musicBtnRect.x && mx<=musicBtnRect.x+musicBtnRect.w && my>=musicBtnRect.y && my<=musicBtnRect.y+musicBtnRect.h) {
    if (!musicStarted) { tryStartMusic(); return; }
    musicMuted=!musicMuted;
    musicMuted ? music.pause() : music.play();
  }
});

function drawMusicBtn() {
  const mb=assets.musicBtn;
  if (mb?.naturalWidth) {
    // Draw MusicButton.png scaled to MBTN_SIZE × MBTN_SIZE, slightly dimmed when muted
    ctx.globalAlpha = musicMuted ? 0.35 : 0.85;
    ctx.drawImage(mb, musicBtnRect.x, musicBtnRect.y, musicBtnRect.w, musicBtnRect.h);
    ctx.globalAlpha = 1;
  } else {
    // Fallback text button if image hasn't loaded
    ctx.fillStyle = musicMuted ? '#334' : '#4fc3f7';
    ctx.fillRect(musicBtnRect.x, musicBtnRect.y, musicBtnRect.w, musicBtnRect.h);
    ctx.fillStyle='#fff'; ctx.font='18px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(musicMuted?'🔇':'♪', musicBtnRect.x+musicBtnRect.w/2, musicBtnRect.y+musicBtnRect.h/2);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  UPDATE — physics, input, collision, collection, animation
// ═════════════════════════════════════════════════════════════════════════════

function update() {
  const gL=keys['ArrowLeft']||keys['KeyA'], gR=keys['ArrowRight']||keys['KeyD'];

  // Horizontal movement: instant velocity set each frame (no momentum/sliding)
  player.vx = gL ? -SPEED : gR ? SPEED : 0;
  if (gL) player.facing=-1; if (gR) player.facing=1;
  player.x = Math.max(0, Math.min(W-player.w, player.x+player.vx));

  // Vertical: accumulate gravity, then resolve platform collisions
  player.vy += GRAVITY;
  const prevBot = player.y+player.h;
  player.y += player.vy;
  player.onGround = false;

  for (const p of PLATFORMS) {
    // Use natural plank width for ledges, full canvas width for ground
    const pw = p.plank ? plankW(p.plank) : W;
    const curBot = player.y+player.h;
    // Top-surface-only collision: player was above platform last frame and is at/below this frame
    if (player.vy>=0 && prevBot<=p.y+1 && curBot>=p.y && player.x+player.w>p.x+2 && player.x<p.x+pw-2) {
      player.y=p.y-player.h; player.vy=0; player.onGround=true;
    }
  }

  // Jump: only allowed when standing on a surface
  if ((keys['ArrowUp']||keys['KeyW']||keys['Space']) && player.onGround) {
    player.vy=JUMP_FORCE; player.onGround=false;
  }

  if (player.y>H+80) resetPlayer(); // fell off bottom — teleport back to spawn

  // Wizard animation: pick state based on physics, advance one tick
  tickWizard(!player.onGround ? 'jump' : (gL||gR) ? 'walk' : 'idle');

  // Collectible hit detection: square AABB around each number's centre
  const hr=COLLECT_SIZE/2+6;
  numbers = numbers.filter(n => {
    if (player.x<n.x+hr && player.x+player.w>n.x-hr && player.y<n.y+hr && player.y+player.h>n.y-hr) {
      score=Math.min(score+n.value, MAX_SCORE); if(score>=MAX_SCORE) endGame(); return false;
    }
    return true;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  HUD — score (top-left) and timer (top-right) drawn on canvas every frame
// ═════════════════════════════════════════════════════════════════════════════

function drawHUD() {
  ctx.shadowBlur=0;
  // SCORE: label word then digit images to its right
  drawStr(12, 8, 'SCORE', HUD_LABEL_H, 'left');
  drawDigitStr(12+measureStr('SCORE',HUD_LABEL_H)+8, 8+Math.round((HUD_LABEL_H-HUD_NUM_H)/2), score, HUD_NUM_H, 'left');
  // TIME: digit images on the far right, then "TIME" label to their left
  const tnw=measureDigitStr(timeLeft, HUD_NUM_H);
  drawDigitStr(W-12, 8+Math.round((HUD_LABEL_H-HUD_NUM_H)/2), timeLeft, HUD_NUM_H, 'right');
  drawStr(W-12-tnw-8, 8, 'TIME', HUD_LABEL_H, 'right');
  // Music button always on top
  drawMusicBtn();
}

// ═════════════════════════════════════════════════════════════════════════════
//  SCREENS
// ═════════════════════════════════════════════════════════════════════════════

// Subtle CRT scanline effect — every 4px a semi-transparent black strip
function scanlines() {
  for (let y=0; y<H; y+=4) { ctx.fillStyle='rgba(0,0,0,0.08)'; ctx.fillRect(0,y,W,2); }
}

// ── Start screen: title centred vertically in upper 35% of canvas, prompt at bottom ──
function drawStartScreen() {
  drawBG(OVERLAY_MENU); scanlines();
  ctx.fillStyle='#0088cc'; ctx.fillRect(0,0,W,2); ctx.fillRect(0,H-2,W,2);

  const blockH = START_TITLE_H+10+START_SUB_H;
  const ty = Math.round(H*0.35 - blockH/2);
  drawStr(W/2, ty,                    'VOLUMAGUS', START_TITLE_H, 'center');
  drawStr(W/2, ty+START_TITLE_H+10,   'THE VAST',  START_SUB_H,  'center');

  ctx.globalAlpha = 0.6+0.4*Math.sin(Date.now()*0.004);
  drawStr(W/2, H-50, 'PRESS A KEY TO BEGIN', START_PROMPT_H, 'center');
  ctx.globalAlpha=1;
}

// ── Game over: GAME/OVER, subtitle, large score, footer ──────────────────────
function drawGameOverScreen() {
  drawBG(OVERLAY_MENU); scanlines();
  ctx.fillStyle='#660000'; ctx.fillRect(0,0,W,2); ctx.fillRect(0,H-2,W,2);

  const gy=32;
  drawStr(W/2, gy,                  'GAME', END_GAMEOVER_H, 'center');
  drawStr(W/2, gy+END_GAMEOVER_H+6, 'OVER', END_GAMEOVER_H, 'center');

  const dy=gy+END_GAMEOVER_H*2+18;
  ctx.fillStyle='rgba(255,50,50,0.35)'; ctx.fillRect(W/2-130,dy,260,1);

  const sy=dy+12;
  drawStr(W/2, sy, 'TRAVELER YOUR VOLUME IS', END_TRAVELER_H, 'center');
  drawDigitStr(W/2, sy+END_TRAVELER_H+14, score, END_SCORE_H, 'center');
  drawStr(W/2, H-46, 'THANKS FOR PLAYING', END_THANKS_H, 'center');
}

// ── Gameplay frame: bg → planks → collectibles → wizard → HUD ────────────────
function drawGame(t) {
  const now=t ? t*0.002 : Date.now()*0.002;
  drawBG(OVERLAY_GAME);
  drawLedges();
  drawNumbers(now);
  drawWizard();
  drawHUD();
}

// ═════════════════════════════════════════════════════════════════════════════
//  GAME FLOW
// ═════════════════════════════════════════════════════════════════════════════

function startGame() {
  if (playedOnce) return; playedOnce=true; // one play per page load
  cancelAnimationFrame(rafID); clearInterval(timerID); clearInterval(spawnID);
  score=0; timeLeft=GAME_DURATION; numbers=[];
  gameState='playing'; gameActive=true;
  resetPlayer(); spawnNumber();
  timerID=setInterval(()=>{ if(--timeLeft<=0) endGame(); }, 1000);
  spawnID=setInterval(spawnNumber, SPAWN_MS);
  rafID=requestAnimationFrame(gameLoop);
}

function endGame() {
  if (!gameActive) return; // guard against double-call (timer + score cap firing simultaneously)
  gameActive=false; gameState='gameover';
  clearInterval(timerID); clearInterval(spawnID); cancelAnimationFrame(rafID);
  rafID=requestAnimationFrame(menuLoop);
}

function gameLoop(t) { if(!gameActive)return; update(); drawGame(t); rafID=requestAnimationFrame(gameLoop); }
function menuLoop()  { if(gameState==='start')drawStartScreen(); if(gameState==='gameover')drawGameOverScreen(); rafID=requestAnimationFrame(menuLoop); }

// ── Also remove the old HTML music button since we draw our own on canvas ────
// (The HTML <button id="music-btn"> is kept in the DOM but hidden via CSS or ignored)
document.addEventListener('DOMContentLoaded', () => {
  const btn=document.getElementById('music-btn');
  if (btn) btn.style.display='none'; // hide the old HTML button
});

loadAssets(() => { rafID=requestAnimationFrame(menuLoop); });