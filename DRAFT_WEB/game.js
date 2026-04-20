const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
ctx.imageSmoothingEnabled = false;

const menuOverlay = 0.96;
const gameOverlay = 0.52;

const startTitle = 110;
const startSub = 88;
const startInstruc = 32;

const HUD_LABEL_H = 28;
const HUD_NUM_H = 38;
const HUD_TIME_GAP = 20;

const endGameover = 90;
const endTraveler = 30;
const endScore = 200;

const WIZ_TARGET_H = 100;
const COLLECT_SIZE = 36;
const PLANK_H = 22;

const GRAVITY = 0.35;
const JUMP_FORCE = -12;
const PLAYER_SPEED = 3.5;

const LGAP = 3;
const LSPC = 10;

const assets = {};
let assetsLoaded = 0, assetsTotal = 0;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUM_NAMES = { 0: 'Zero', 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine' };

const ASSET_LIST = [
  { key: 'bg', src: 'Background.png' },
  { key: 'floor', src: 'Floor.png' },
  { key: 'plank1', src: 'Planks/Plank1.png' },
  { key: 'plank2', src: 'Planks/Plank2.png' },
  { key: 'plank3', src: 'Planks/Plank3.png' },
  { key: 'plank4', src: 'Planks/Plank4.png' },
  { key: 'plank5', src: 'Planks/Plank5.png' },
  { key: 'wizRaw', src: 'WizWalk.png' },
  { key: 'musicBtn', src: 'MusicButton.png' },
  ...ALPHABET.split('').map(l => ({ key: 'lr_' + l, src: 'Letters/' + l + '.png' })),
  ...Object.entries(NUM_NAMES).map(([d, n]) => ({ key: 'num_' + d, src: 'Numbers/' + n + '.png' })),
];

function loadAssets(onDone) {
  assetsTotal = ASSET_LIST.length; assetsLoaded = 0;
  const tick = () => { if (++assetsLoaded >= assetsTotal) processWizard(() => processLetters(onDone)); };
  ASSET_LIST.forEach(({ key, src }) => {
    const img = new Image(); img.id = key;
    img.onload = tick;
    img.onerror = () => { console.warn('Asset failed:', src); tick(); };
    img.src = src; assets[key] = img;
  });
}

const WIZ_FRAME_REGIONS = [[9, 81], [93, 165], [177, 249], [261, 333], [345, 417]];

function processWizard(onDone) {
  const raw = assets.wizRaw;
  if (!raw?.naturalWidth) { assets.wiz = null; onDone(); return; }

  const tc = document.createElement('canvas');
  tc.width = raw.naturalWidth; tc.height = raw.naturalHeight;
  const tx = tc.getContext('2d'); tx.drawImage(raw, 0, 0);
  const px = tx.getImageData(0, 0, tc.width, tc.height).data;
  const IW = tc.width, IH = tc.height;

  const frameCvs = [], bboxes = [];
  WIZ_FRAME_REGIONS.forEach(([rx1, rx2]) => {
    const fw = rx2 - rx1;
    const fc = document.createElement('canvas'); fc.width = fw; fc.height = IH;
    const fx = fc.getContext('2d');
    const id = fx.createImageData(fw, IH); const fd = id.data;
    let x0 = fw, xm = 0, y0 = IH, ym = 0;
    for (let y = 0; y < IH; y++) {
      for (let x = 0; x < fw; x++) {
        const si = (y * IW + (rx1 + x)) * 4, di = (y * fw + x) * 4;
        const r = px[si], g = px[si + 1], b = px[si + 2];
        const isBg = r < 25 && g < 25 && b < 25;
        fd[di] = r; fd[di + 1] = g; fd[di + 2] = b; fd[di + 3] = isBg ? 0 : 255;
        if (!isBg) { x0 = Math.min(x0, x); xm = Math.max(xm, x); y0 = Math.min(y0, y); ym = Math.max(ym, y); }
      }
    }
    fx.putImageData(id, 0, 0);
    frameCvs.push(fc); bboxes.push([x0, y0, xm, ym]);
  });

  const ul = Math.min(...bboxes.map(b => b[0])), ut = Math.min(...bboxes.map(b => b[1]));
  const ur = Math.max(...bboxes.map(b => b[2])), ub = Math.max(...bboxes.map(b => b[3]));
  const cw = ur - ul, ch = ub - ut;
  const TH = WIZ_TARGET_H, TW = Math.round(cw / ch * TH), PAD = 5;
  const CW = TW + PAD * 2, CH = TH + PAD;
  assets.wizCellW = CW; assets.wizCellH = CH;

  const sheet = document.createElement('canvas');
  sheet.width = CW * frameCvs.length; sheet.height = CH;
  const sx = sheet.getContext('2d'); sx.imageSmoothingEnabled = false;
  frameCvs.forEach((fc, i) => {
    const cropW = Math.min(cw, fc.width - ul);
    sx.drawImage(fc, ul, ut, cropW, ch, i * CW + PAD, PAD, TW, TH);
  });

  assets.wiz = sheet;
  console.log(`Wizard ready: ${sheet.width}x${sheet.height}, cell=${CW}x${CH}`);
  onDone();
}

const WIZ_FRAMES = 5, WIZ_IDLE_DLY = 12, WIZ_WALK_DLY = 5;
let wizFrame = 0, wizTick = 0;

function tickWizard(state) {
  if (state === 'jump') { wizFrame = 2; return; }
  const delay = state === 'walk' ? WIZ_WALK_DLY : WIZ_IDLE_DLY;
  if (++wizTick >= delay) { wizTick = 0; wizFrame = (wizFrame + 1) % WIZ_FRAMES; }
}

function drawWizard() {
  if (!assets.wiz) { ctx.fillStyle = '#4fc3f7'; ctx.fillRect(player.x, player.y, player.w, player.h); return; }
  const CW = assets.wizCellW, CH = assets.wizCellH;
  const dx = Math.round(player.x - (CW - player.w) / 2), dy = Math.round(player.y + player.h - CH);
  ctx.save();
  if (player.facing === 1) { ctx.translate(dx + CW / 2, 0); ctx.scale(-1, 1); ctx.translate(-(dx + CW / 2), 0); }
  ctx.drawImage(assets.wiz, wizFrame * CW, 0, CW, CH, dx, dy, CW, CH);
  ctx.restore();
}

function processLetters(onDone) {
  let done = 0;
  ALPHABET.split('').forEach(l => {
    const raw = assets['lr_' + l];
    const finish = () => { if (++done >= 26) { console.log('Letters ready'); onDone(); } };
    if (!raw?.naturalWidth) { assets['lc_' + l] = null; finish(); return; }

    const tc = document.createElement('canvas'); tc.width = raw.naturalWidth; tc.height = raw.naturalHeight;
    const tx = tc.getContext('2d'); tx.drawImage(raw, 0, 0);
    const id = tx.getImageData(0, 0, tc.width, tc.height); const px = id.data;
    let x0 = tc.width, xm = 0, y0 = tc.height, ym = 0;

    for (let i = 0; i < px.length; i += 4) {
      const isBg = px[i] < 25 && px[i + 1] < 25 && px[i + 2] < 25;
      px[i + 3] = isBg ? 0 : 255;
      if (!isBg) {
        const xi = (i / 4) % tc.width, yi = Math.floor((i / 4) / tc.width);
        x0 = Math.min(x0, xi); xm = Math.max(xm, xi); y0 = Math.min(y0, yi); ym = Math.max(ym, yi);
      }
    }
    if (xm <= x0 || ym <= y0) { assets['lc_' + l] = null; finish(); return; }
    tx.putImageData(id, 0, 0);

    const cw = xm - x0 + 1, ch = ym - y0 + 1;
    const out = document.createElement('canvas'); out.width = cw; out.height = ch;
    out.getContext('2d').drawImage(tc, x0, y0, cw, ch, 0, 0, cw, ch);
    out._ar = cw / ch;
    assets['lc_' + l] = out;
    finish();
  });
}

const lgap = h => Math.round(LGAP * h / 16);
const lspc = h => Math.round(LSPC * h / 16);

function measureStr(str, h) {
  let w = 0;
  for (const ch of str.toUpperCase()) {
    const lc = assets['lc_' + ch];
    w += ch === ' ' ? lspc(h) : lc ? Math.round(h * lc._ar) + lgap(h) : 0;
  }
  return Math.max(0, w - lgap(h));
}

function drawStr(x, y, str, h, align = 'left') {
  let cx = align === 'center' ? x - measureStr(str, h) / 2 : align === 'right' ? x - measureStr(str, h) : x;
  for (const ch of str.toUpperCase()) {
    if (ch === ' ') { cx += lspc(h); continue; }
    const lc = assets['lc_' + ch];
    if (lc) { const dw = Math.round(h * lc._ar); ctx.drawImage(lc, 0, 0, lc.width, lc.height, Math.round(cx), y, dw, h); cx += dw + lgap(h); }
  }
}

function measureDigitStr(num, h, gap = 4) {
  let w = 0;
  for (const d of String(num)) {
    const img = assets['num_' + d];
    w += (img?.naturalWidth ? Math.round(h * img.naturalWidth / img.naturalHeight) : Math.round(h * 0.7)) + gap;
  }
  return Math.max(0, w - gap);
}

function drawDigitStr(x, y, num, h, align = 'left', gap = 4) {
  let cx = align === 'center' ? x - measureDigitStr(num, h, gap) / 2 : align === 'right' ? x - measureDigitStr(num, h, gap) : x;
  for (const d of String(num)) {
    const img = assets['num_' + d];
    if (img?.naturalWidth) {
      const dw = Math.round(h * img.naturalWidth / img.naturalHeight);
      ctx.drawImage(img, Math.round(cx), y, dw, h); cx += dw + gap;
    } else {
      ctx.save(); ctx.font = `bold ${h}px monospace`; ctx.fillStyle = '#ffd700';
      ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText(d, Math.round(cx), y);
      cx += Math.round(h * 0.7) + gap; ctx.restore();
    }
  }
}

function drawBG(tintAlpha = 0) {
  if (assets.bg?.naturalWidth) ctx.drawImage(assets.bg, 0, 0, W, H);
  else { ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, W, H); }
  if (assets.floor?.naturalWidth) ctx.drawImage(assets.floor, 0, 0, W, H);
  if (tintAlpha) { ctx.fillStyle = `rgba(0,0,0,${tintAlpha})`; ctx.fillRect(0, 0, W, H); }
}

function plankW(key) {
  const img = assets[key];
  if (!img?.naturalWidth) return 120;
  return Math.round(PLANK_H * img.naturalWidth / img.naturalHeight);
}

const PLATFORMS = [
  { x: 0, y: 525, h: 75, plank: null },
  { x: 80, y: 415, h: PLANK_H, plank: 'plank1' },
  { x: 480, y: 415, h: PLANK_H, plank: 'plank3' },
  { x: 900, y: 415, h: PLANK_H, plank: 'plank5' },
  { x: 180, y: 315, h: PLANK_H, plank: 'plank2' },
  { x: 520, y: 310, h: PLANK_H, plank: 'plank4' },
  { x: 870, y: 310, h: PLANK_H, plank: 'plank1' },
  { x: 50, y: 210, h: PLANK_H, plank: 'plank3' },
  { x: 440, y: 205, h: PLANK_H, plank: 'plank5' },
  { x: 920, y: 210, h: PLANK_H, plank: 'plank2' },
  { x: 260, y: 115, h: PLANK_H, plank: 'plank4' },
  { x: 740, y: 115, h: PLANK_H, plank: 'plank3' },
];

function drawLedges() {
  for (let i = 1; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i], img = assets[p.plank], w = plankW(p.plank);
    if (img?.naturalWidth) {
      ctx.drawImage(img, p.x, p.y, w, p.h);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(p.x, p.y + p.h - 2, w, 3);
    } else {
      ctx.fillStyle = '#5c3d1e'; ctx.fillRect(p.x, p.y, w, p.h);
    }
  }
}

const SPAWN_Y = 525 - 66;
const player = { x: 586, y: SPAWN_Y, w: 42, h: 66, vx: 0, vy: 0, onGround: false, facing: 1, dropThrough: 0 };

function resetPlayer() {
  Object.assign(player, { x: 586, y: SPAWN_Y, vx: 0, vy: 0, onGround: false, facing: 1, dropThrough: 0 });
  wizFrame = 0; wizTick = 0;
}

const keys = {};
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (gameState === 'start') startGame();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

const GAME_DURATION = 25, SPAWN_MS = 2200, MAX_NUMBERS = 5, MAX_SCORE = 100;
let score = 0, timeLeft = GAME_DURATION, gameActive = false, gameState = 'start';
let numbers = [], timerID = null, spawnID = null, rafID = null, playedOnce = false;

const MIN_SPAWN_DIST = COLLECT_SIZE * 2;

function spawnNumber() {
  if (numbers.length >= MAX_NUMBERS) return;
  for (let attempt = 0; attempt < 10; attempt++) {
    const p = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
    const pw = p.plank ? plankW(p.plank) : W;
    const pad = 20;
    const nx = p.x + pad + Math.random() * (pw - pad * 2);
    const ny = p.y - 22;
    const tooClose = numbers.some(n => Math.abs(n.x - nx) < MIN_SPAWN_DIST && Math.abs(n.y - ny) < MIN_SPAWN_DIST);
    if (!tooClose) { numbers.push({ x: nx, y: ny, value: Math.floor(Math.random() * 9) + 1, bob: Math.random() * Math.PI * 2 }); return; }
  }
}

function drawNumbers(now) {
  for (const n of numbers) {
    const by = Math.sin(now + n.bob) * 5, img = assets['num_' + n.value];
    ctx.save(); ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 14;
    if (img?.naturalWidth) ctx.drawImage(img, Math.round(n.x - COLLECT_SIZE / 2), Math.round(n.y + by - COLLECT_SIZE / 2), COLLECT_SIZE, COLLECT_SIZE);
    else { ctx.font = `bold ${COLLECT_SIZE}px monospace`; ctx.fillStyle = '#ffd700'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n.value, n.x, n.y + by); }
    ctx.restore();
  }
}

const music = document.getElementById('bg-music');
let musicStarted = false, musicMuted = false;
const MBTN_SIZE = 44;
const musicBtnRect = { x: W - MBTN_SIZE - 10, y: H - MBTN_SIZE - 10, w: MBTN_SIZE, h: MBTN_SIZE };

function tryStartMusic() {
  if (musicStarted) return;
  music.volume = 0.4;
  music.play().then(() => musicStarted = true).catch(() => { });
}
document.addEventListener('click', tryStartMusic, { once: true });

canvas.addEventListener('click', e => {
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (W / r.width), my = (e.clientY - r.top) * (H / r.height);
  if (mx >= musicBtnRect.x && mx <= musicBtnRect.x + musicBtnRect.w && my >= musicBtnRect.y && my <= musicBtnRect.y + musicBtnRect.h) {
    if (!musicStarted) { tryStartMusic(); return; }
    musicMuted = !musicMuted;
    musicMuted ? music.pause() : music.play();
  }
});

function drawMusicBtn() {
  const mb = assets.musicBtn;
  ctx.globalAlpha = musicMuted ? 0.35 : 0.85;
  if (mb?.naturalWidth) ctx.drawImage(mb, musicBtnRect.x, musicBtnRect.y, musicBtnRect.w, musicBtnRect.h);
  else {
    ctx.fillStyle = musicMuted ? '#334' : '#4fc3f7'; ctx.fillRect(musicBtnRect.x, musicBtnRect.y, musicBtnRect.w, musicBtnRect.h);
    ctx.fillStyle = '#fff'; ctx.font = '18px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(musicMuted ? '🔇' : '♪', musicBtnRect.x + musicBtnRect.w / 2, musicBtnRect.y + musicBtnRect.h / 2);
  }
  ctx.globalAlpha = 1;
}

function update() {
  const gL = keys['ArrowLeft'] || keys['KeyA'];
  const gR = keys['ArrowRight'] || keys['KeyD'];
  const gD = keys['ArrowDown'] || keys['KeyS'];

  player.vx = gL ? -PLAYER_SPEED : gR ? PLAYER_SPEED : 0;
  if (gL) player.facing = -1; if (gR) player.facing = 1;
  player.x = Math.max(0, Math.min(W - player.w, player.x + player.vx));

  if (gD && player.onGround && player.dropThrough === 0) player.dropThrough = 12;
  if (player.dropThrough > 0) player.dropThrough--;

  player.vy += GRAVITY;
  const prevBot = player.y + player.h;
  player.y += player.vy;
  player.onGround = false;

  for (const p of PLATFORMS) {
    const pw = p.plank ? plankW(p.plank) : W;
    const curBot = player.y + player.h;
    if (player.dropThrough > 0 && p.plank !== null) continue;
    if (player.vy >= 0 && prevBot <= p.y + 1 && curBot >= p.y && player.x + player.w > p.x + 2 && player.x < p.x + pw - 2) {
      player.y = p.y - player.h; player.vy = 0; player.onGround = true;
    }
  }

  if ((keys['ArrowUp'] || keys['KeyW'] || keys['Space']) && player.onGround) {
    player.vy = JUMP_FORCE; player.onGround = false;
  }

  if (player.y > H + 80) resetPlayer();

  tickWizard(!player.onGround ? 'jump' : (gL || gR) ? 'walk' : 'idle');

  const hr = COLLECT_SIZE / 2 + 6;
  numbers = numbers.filter(n => {
    if (player.x < n.x + hr && player.x + player.w > n.x - hr && player.y < n.y + hr && player.y + player.h > n.y - hr) {
      score = Math.min(score + n.value, MAX_SCORE); if (score >= MAX_SCORE) endGame(); return false;
    }
    return true;
  });
}

function drawHUD() {
  ctx.shadowBlur = 0;
  drawStr(12, 8, 'SCORE', HUD_LABEL_H, 'left');
  drawDigitStr(12 + measureStr('SCORE', HUD_LABEL_H) + 8, 8 + Math.round((HUD_LABEL_H - HUD_NUM_H) / 2), score, HUD_NUM_H, 'left');
  const tnw = measureDigitStr(timeLeft, HUD_NUM_H);
  drawDigitStr(W - 12, 8 + Math.round((HUD_LABEL_H - HUD_NUM_H) / 2), timeLeft, HUD_NUM_H, 'right');
  drawStr(W - 12 - tnw - HUD_TIME_GAP, 8, 'TIME', HUD_LABEL_H, 'right');
  drawMusicBtn();
}

function scanlines() {
  for (let y = 0; y < H; y += 4) { ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, y, W, 2); }
}

function drawStartScreen() {
  drawBG(menuOverlay); scanlines();
  ctx.fillStyle = '#0088cc'; ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2);
  const blockH = startTitle + 10 + startSub;
  const ty = Math.round(H * 0.35 - blockH / 2);
  drawStr(W / 2, ty, 'AUDIOMANCER', startTitle, 'center');
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() * 0.004);
  drawStr(W / 2, H - 50, 'PRESS A KEY TO BEGIN', startInstruc, 'center');
  ctx.globalAlpha = 1;
}

function drawGameOverScreen() {
  drawBG(menuOverlay); scanlines();
  const gy = 32;
  drawStr(W / 2, gy, 'GAME', endGameover, 'center');
  drawStr(W / 2, gy + endGameover + 6, 'OVER', endGameover, 'center');
  const dy = gy + endGameover * 2 + 18;
  const sy = dy + 12;
  drawStr(W / 2, sy, 'TRAVELER YOUR VOLUME IS', endTraveler, 'center');
  drawDigitStr(W / 2, sy + endTraveler + 14, score, endScore, 'center');
}

function drawGame(t) {
  const now = t ? t * 0.002 : Date.now() * 0.002;
  drawBG(gameOverlay); drawLedges(); drawNumbers(now); drawWizard(); drawHUD();
}

function startGame() {
  if (playedOnce) return; playedOnce = true;
  cancelAnimationFrame(rafID); clearInterval(timerID); clearInterval(spawnID);
  score = 0; timeLeft = GAME_DURATION; numbers = [];
  gameState = 'playing'; gameActive = true;
  resetPlayer(); spawnNumber();
  timerID = setInterval(() => { if (--timeLeft <= 0) endGame(); }, 1000);
  spawnID = setInterval(spawnNumber, SPAWN_MS);
  rafID = requestAnimationFrame(gameLoop);
}

function endGame() {
  if (!gameActive) return;
  gameActive = false; gameState = 'gameover';
  clearInterval(timerID); clearInterval(spawnID); cancelAnimationFrame(rafID);
  rafID = requestAnimationFrame(menuLoop);
}

function gameLoop(t) { if (!gameActive) return; update(); drawGame(t); rafID = requestAnimationFrame(gameLoop); }
function menuLoop() { if (gameState === 'start') drawStartScreen(); if (gameState === 'gameover') drawGameOverScreen(); rafID = requestAnimationFrame(menuLoop); }

document.addEventListener('DOMContentLoaded', () => { const btn = document.getElementById('music-btn'); if (btn) btn.style.display = 'none'; });

loadAssets(() => { rafID = requestAnimationFrame(menuLoop); });