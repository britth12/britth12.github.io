const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
ctx.imageSmoothingEnabled = false;

const menuOverlay = 0.96;
const gameOverlay = 0.52;
const startTitle = 110;
const startPrompt = 32;
const instructLine = 38;
const instructPrompt = 32;
const hudLabelH = 28;
const hudNumH = 38;
const endGameover = 90;
const endTraveler = 30;
const endScore = 120;
const wizTargetH = 100;
const collectSize = 36;
const plankH = 22;
const gravity = 0.87;
const jumpForce = -14;
const playerSpeed = 6;
const lgapBase = 3;
const lspcBase = 10;
const exitAboveFloor = 10;
const exitSignOffset = 10;
const exitSignOpacity = 0.99;
const submitGap = 40;

const assets = {};
let assetsLoaded = 0, assetsTotal = 0;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const numNames = { 0: 'Zero', 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine' };

const assetList = [
  { key: 'bg', src: 'Background.png' },
  { key: 'floor', src: 'Floor.png' },
  { key: 'plank1', src: 'Planks/Plank1.png' },
  { key: 'plank2', src: 'Planks/Plank2.png' },
  { key: 'plank3', src: 'Planks/Plank3.png' },
  { key: 'plank4', src: 'Planks/Plank4.png' },
  { key: 'plank5', src: 'Planks/Plank5.png' },
  { key: 'wizRaw', src: 'WizWalk.png' },
  { key: 'evilWizRaw', src: 'EvilWizWalk.png' },
  { key: 'musicBtn', src: 'MusicButton.png' },
  { key: 'exit', src: 'Exit.png' },
  { key: 'submitBtn', src: 'SubmitButton.png' },
  { key: 'replayBtn', src: 'Replay.png' },
  ...alphabet.split('').map(l => ({ key: 'lr_' + l, src: 'Letters/' + l + '.png' })),
  ...Object.entries(numNames).map(([d, n]) => ({ key: 'num_' + d, src: 'Numbers/' + n + '.png' })),
];

function loadAssets(onDone) {
  assetsTotal = assetList.length; assetsLoaded = 0;
  const tick = () => { if (++assetsLoaded >= assetsTotal) processWizard(() => processEvilWizard(() => processLetters(onDone))); };
  assetList.forEach(({ key, src }) => {
    const img = new Image(); img.id = key;
    img.onload = tick;
    img.onerror = () => { console.warn('Asset failed:', src); tick(); };
    img.src = src; assets[key] = img;
  });
}

const wizFrameRegions = [[9, 81], [93, 165], [177, 249], [261, 333], [345, 417]];

function buildWizSheet(raw, cellWKey, cellHKey, sheetKey) {
  if (!raw?.naturalWidth) { assets[sheetKey] = null; return; }
  const tc = document.createElement('canvas'); tc.width = raw.naturalWidth; tc.height = raw.naturalHeight;
  const tx = tc.getContext('2d'); tx.drawImage(raw, 0, 0);
  const px = tx.getImageData(0, 0, tc.width, tc.height).data;
  const IW = tc.width, IH = tc.height;
  const frameCvs = [], bboxes = [];
  wizFrameRegions.forEach(([rx1, rx2]) => {
    const fw = rx2 - rx1;
    const fc = document.createElement('canvas'); fc.width = fw; fc.height = IH;
    const fx = fc.getContext('2d');
    const id = fx.createImageData(fw, IH); const fd = id.data;
    let x0 = fw, xm = 0, y0 = IH, ym = 0;
    for (let y = 0; y < IH; y++) for (let x = 0; x < fw; x++) {
      const si = (y * IW + (rx1 + x)) * 4, di = (y * fw + x) * 4;
      const r = px[si], g = px[si + 1], b = px[si + 2], isBg = r < 25 && g < 25 && b < 25;
      fd[di] = r; fd[di + 1] = g; fd[di + 2] = b; fd[di + 3] = isBg ? 0 : 255;
      if (!isBg) { x0 = Math.min(x0, x); xm = Math.max(xm, x); y0 = Math.min(y0, y); ym = Math.max(ym, y); }
    }
    fx.putImageData(id, 0, 0);
    frameCvs.push(fc); bboxes.push([x0, y0, xm, ym]);
  });
  const ul = Math.min(...bboxes.map(b => b[0])), ut = Math.min(...bboxes.map(b => b[1]));
  const ur = Math.max(...bboxes.map(b => b[2])), ub = Math.max(...bboxes.map(b => b[3]));
  const cw = ur - ul, ch = ub - ut;
  const TH = wizTargetH, TW = Math.round(cw / ch * TH), PAD = 5;
  const CW = TW + PAD * 2, CH = TH + PAD;
  assets[cellWKey] = CW; assets[cellHKey] = CH;
  const sheet = document.createElement('canvas'); sheet.width = CW * frameCvs.length; sheet.height = CH;
  const sx = sheet.getContext('2d'); sx.imageSmoothingEnabled = false;
  frameCvs.forEach((fc, i) => { sx.drawImage(fc, ul, ut, Math.min(cw, fc.width - ul), ch, i * CW + PAD, PAD, TW, TH); });
  assets[sheetKey] = sheet;
}

function processWizard(onDone) { buildWizSheet(assets.wizRaw, 'wizCellW', 'wizCellH', 'wiz'); onDone(); }
function processEvilWizard(onDone) { buildWizSheet(assets.evilWizRaw, 'evilWizCellW', 'evilWizCellH', 'evilWiz'); onDone(); }

const wizFrames = 5, wizIdleDly = 12, wizWalkDly = 5;
let wizFrame = 0, wizTick = 0;

function tickWizard(state) {
  if (state === 'jump') { wizFrame = 2; return; }
  const delay = state === 'walk' ? wizWalkDly : wizIdleDly;
  if (++wizTick >= delay) { wizTick = 0; wizFrame = (wizFrame + 1) % wizFrames; }
}

function drawWizard() {
  const sheet = evilMode ? assets.evilWiz : assets.wiz;
  const CW = evilMode ? assets.evilWizCellW : assets.wizCellW;
  const CH = evilMode ? assets.evilWizCellH : assets.wizCellH;
  if (!sheet) { ctx.fillStyle = '#4fc3f7'; ctx.fillRect(player.x, player.y, player.w, player.h); return; }
  const dx = Math.round(player.x - (CW - player.w) / 2), dy = Math.round(player.y + player.h - CH);
  ctx.save();
  if (player.facing === 1) { ctx.translate(dx + CW / 2, 0); ctx.scale(-1, 1); ctx.translate(-(dx + CW / 2), 0); }
  ctx.drawImage(sheet, wizFrame * CW, 0, CW, CH, dx, dy, CW, CH);
  ctx.restore();
}

function processLetters(onDone) {
  let done = 0;
  alphabet.split('').forEach(l => {
    const raw = assets['lr_' + l];
    const finish = () => { if (++done >= 26) onDone(); };
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
    out._ar = cw / ch; assets['lc_' + l] = out; finish();
  });
}

const lgap = h => Math.round(lgapBase * h / 16);
const lspc = h => Math.round(lspcBase * h / 16);

function measureStr(str, h) {
  let w = 0;
  for (const ch of str.toUpperCase()) { const lc = assets['lc_' + ch]; w += ch === ' ' ? lspc(h) : lc ? Math.round(h * lc._ar) + lgap(h) : 0; }
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
  for (const d of String(num)) { const img = assets['num_' + d]; w += (img?.naturalWidth ? Math.round(h * img.naturalWidth / img.naturalHeight) : Math.round(h * 0.7)) + gap; }
  return Math.max(0, w - gap);
}

function drawDigitStr(x, y, num, h, align = 'left', gap = 4) {
  let cx = align === 'center' ? x - measureDigitStr(num, h, gap) / 2 : align === 'right' ? x - measureDigitStr(num, h, gap) : x;
  for (const d of String(num)) {
    const img = assets['num_' + d];
    if (img?.naturalWidth) { const dw = Math.round(h * img.naturalWidth / img.naturalHeight); ctx.drawImage(img, Math.round(cx), y, dw, h); cx += dw + gap; }
    else { ctx.save(); ctx.font = `bold ${h}px monospace`; ctx.fillStyle = '#ffd700'; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText(d, Math.round(cx), y); cx += Math.round(h * 0.7) + gap; ctx.restore(); }
  }
}

function drawBG(tintAlpha = 0) {
  if (assets.bg?.naturalWidth) ctx.drawImage(assets.bg, 0, 0, W, H);
  else { ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, W, H); }
  if (assets.floor?.naturalWidth) ctx.drawImage(assets.floor, 0, 0, W, H);
  if (tintAlpha) { ctx.fillStyle = `rgba(0,0,0,${tintAlpha})`; ctx.fillRect(0, 0, W, H); }
}

function drawBorder() { ctx.fillStyle = '#0088cc'; ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2); }

function scanlines() { for (let y = 0; y < H; y += 4) { ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, y, W, 2); } }

function plankW(key) { const img = assets[key]; return img?.naturalWidth ? Math.round(plankH * img.naturalWidth / img.naturalHeight) : 120; }

const platforms = [
  { x: 0, y: 481, h: 69, plank: null },
  { x: 73, y: 381, h: plankH, plank: 'plank1' },
  { x: 440, y: 381, h: plankH, plank: 'plank3' },
  { x: 825, y: 381, h: plankH, plank: 'plank5' },
  { x: 165, y: 289, h: plankH, plank: 'plank2' },
  { x: 477, y: 284, h: plankH, plank: 'plank4' },
  { x: 798, y: 284, h: plankH, plank: 'plank1' },
  { x: 46, y: 193, h: plankH, plank: 'plank3' },
  { x: 404, y: 188, h: plankH, plank: 'plank5' },
  { x: 844, y: 193, h: plankH, plank: 'plank2' },
  { x: 238, y: 106, h: plankH, plank: 'plank4' },
  { x: 679, y: 106, h: plankH, plank: 'plank3' },
];

function drawLedges() {
  for (let i = 1; i < platforms.length; i++) {
    const p = platforms[i], img = assets[p.plank], w = plankW(p.plank);
    if (img?.naturalWidth) { ctx.drawImage(img, p.x, p.y, w, p.h); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(p.x, p.y + p.h - 2, w, 3); }
    else { ctx.fillStyle = '#5c3d1e'; ctx.fillRect(p.x, p.y, w, p.h); }
  }
}

const exitFloor = 481, exitTop = exitFloor - 100;

function drawExit() {
  ctx.fillStyle = 'rgba(220,40,40,0.85)';
  ctx.fillRect(W - 4, exitTop, 4, exitFloor - exitTop);
  const img = assets.exit;
  if (img?.naturalWidth) {
    ctx.globalAlpha = exitSignOpacity;
    ctx.drawImage(img, W - img.naturalWidth - exitSignOffset, exitTop - img.naturalHeight - exitAboveFloor, img.naturalWidth, img.naturalHeight);
    ctx.globalAlpha = 1;
  }
}

const spawnY = 481 - 66;
const player = { x: 537, y: spawnY, w: 42, h: 66, vx: 0, vy: 0, onGround: false, facing: 1, dropThrough: 0 };

function resetPlayer() {
  Object.assign(player, { x: 537, y: spawnY, vx: 0, vy: 0, onGround: false, facing: 1, dropThrough: 0 });
  wizFrame = 0; wizTick = 0; evilMode = false;
}

const keys = {};
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Enter'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (gameState === 'start' && e.code === 'Enter') goToInstructions();
  else if (gameState === 'instructions' && e.code === 'Enter') startGame();
  if (gameState === 'playing' && e.code === 'Space') toggleEvilMode();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

const spawnMs = 1600, maxNumbers = 5, maxScore = 100;
let score = 0, gameActive = false, gameState = 'start', evilMode = false;
let numbers = [], spawnID = null, rafID = null, lastTime = 0;
const minSpawnDist = collectSize * 2;

function spawnNumber() {
  if (numbers.length >= maxNumbers) return;
  for (let attempt = 0; attempt < 10; attempt++) {
    const p = platforms[Math.floor(Math.random() * platforms.length)];
    const pw = p.plank ? plankW(p.plank) : W;
    const nx = p.x + 20 + Math.random() * (pw - 40), ny = p.y - 22;
    if (!numbers.some(n => Math.abs(n.x - nx) < minSpawnDist && Math.abs(n.y - ny) < minSpawnDist)) {
      numbers.push({ x: nx, y: ny, value: Math.floor(Math.random() * 9) + 1, bob: Math.random() * Math.PI * 2 });
      return;
    }
  }
}

function drawNumbers(now) {
  const glowColor = evilMode ? '#4fc3f7' : '#ffd700';
  for (const n of numbers) {
    const by = Math.sin(now + n.bob) * 5, img = assets['num_' + n.value];
    const dx = Math.round(n.x - collectSize / 2), dy = Math.round(n.y + by - collectSize / 2);
    ctx.save();
    ctx.shadowColor = glowColor; ctx.shadowBlur = 20;
    if (img?.naturalWidth) ctx.drawImage(img, dx, dy, collectSize, collectSize);
    else { ctx.fillStyle = glowColor; ctx.font = `bold ${collectSize}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n.value, n.x, n.y + by); }
    ctx.restore();
  }
}

const music = document.getElementById('bg-music');
const evilMusic = document.getElementById('evil-music');
let musicMuted = false;

function startMusic() { if (!musicMuted) { music.volume = 0.4; music.play().catch(() => { }); } }

function stopAllMusic() { music.pause(); music.currentTime = 0; evilMusic.pause(); evilMusic.currentTime = 0; }

function toggleEvilMode() {
  evilMode = !evilMode;
  if (musicMuted) return;
  if (evilMode) { music.pause(); evilMusic.currentTime = 0; evilMusic.volume = 0.4; evilMusic.play().catch(() => { }); }
  else { evilMusic.pause(); music.play().catch(() => { }); }
}

const mbtnSize = 44;
const musicBtnRect = { x: W - mbtnSize - 10, y: H - mbtnSize - 10, w: mbtnSize, h: mbtnSize };
const submitBtnW = 134, submitBtnH = 48, btnGap = 45;

canvas.addEventListener('click', e => {
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (W / r.width), my = (e.clientY - r.top) * (H / r.height);
  if (mx >= musicBtnRect.x && mx <= musicBtnRect.x + musicBtnRect.w && my >= musicBtnRect.y && my <= musicBtnRect.y + musicBtnRect.h) {
    musicMuted = !musicMuted;
    if (musicMuted) { music.pause(); evilMusic.pause(); }
    else if (evilMode) { evilMusic.volume = 0.4; evilMusic.play().catch(() => { }); }
    else { music.volume = 0.4; music.play().catch(() => { }); }
  }
  if (gameState === 'gameover') {
    const by = submitBtnY(), rowW = submitBtnW * 2 + btnGap, rx = Math.round(W / 2 - rowW / 2);
    const inRow = my >= by && my <= by + submitBtnH;
    if (inRow && mx >= rx && mx <= rx + submitBtnW) replayGame();
    if (inRow && mx >= rx + submitBtnW + btnGap && mx <= rx + rowW) alert('Your volume is ' + score);
  }
});

function drawMusicBtn() {
  ctx.globalAlpha = musicMuted ? 0.35 : 0.85;
  const mb = assets.musicBtn;
  if (mb?.naturalWidth) ctx.drawImage(mb, musicBtnRect.x, musicBtnRect.y, musicBtnRect.w, musicBtnRect.h);
  else {
    ctx.fillStyle = musicMuted ? '#334' : '#4fc3f7'; ctx.fillRect(musicBtnRect.x, musicBtnRect.y, musicBtnRect.w, musicBtnRect.h);
    ctx.fillStyle = '#fff'; ctx.font = '18px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(musicMuted ? '🔇' : '♪', musicBtnRect.x + musicBtnRect.w / 2, musicBtnRect.y + musicBtnRect.h / 2);
  }
  ctx.globalAlpha = 1;
}

function update(dt = 1) {
  const gL = keys['ArrowLeft'] || keys['KeyA'];
  const gR = keys['ArrowRight'] || keys['KeyD'];
  const gD = keys['ArrowDown'] || keys['KeyS'];
  player.vx = gL ? -playerSpeed * dt : gR ? playerSpeed * dt : 0;
  if (gL) player.facing = -1; if (gR) player.facing = 1;
  player.x = Math.max(0, Math.min(W - player.w, player.x + player.vx));
  if (gD && player.onGround && player.dropThrough === 0) player.dropThrough = 12;
  if (player.dropThrough > 0) player.dropThrough--;
  player.vy += gravity * dt;
  const prevBot = player.y + player.h;
  player.y += player.vy * dt;
  player.onGround = false;
  for (const p of platforms) {
    const pw = p.plank ? plankW(p.plank) : W, curBot = player.y + player.h;
    if (player.dropThrough > 0 && p.plank !== null) continue;
    if (player.vy >= 0 && prevBot <= p.y + 1 && curBot >= p.y && player.x + player.w > p.x + 2 && player.x < p.x + pw - 2) {
      player.y = p.y - player.h; player.vy = 0; player.onGround = true;
    }
  }
  if ((keys['ArrowUp'] || keys['KeyW']) && player.onGround) { player.vy = jumpForce; player.onGround = false; }
  if (player.y > H + 80) resetPlayer();
  if (player.x + player.w >= W - 2 && player.y + player.h > exitTop && player.y < exitFloor) endGame();
  tickWizard(!player.onGround ? 'jump' : (gL || gR) ? 'walk' : 'idle');
  const hr = collectSize / 2 + 6;
  numbers = numbers.filter(n => {
    if (player.x < n.x + hr && player.x + player.w > n.x - hr && player.y < n.y + hr && player.y + player.h > n.y - hr) {
      score = evilMode ? Math.max(0, score - n.value) : Math.min(score + n.value, maxScore);
      if (score >= maxScore) endGame(); return false;
    }
    return true;
  });
}

function drawHUD() {
  ctx.shadowBlur = 0;
  drawStr(12, 8, 'SCORE', hudLabelH, 'left');
  drawDigitStr(12 + measureStr('SCORE', hudLabelH) + 8, 8 + Math.round((hudLabelH - hudNumH) / 2), score, hudNumH, 'left');
  drawMusicBtn();
}

function drawStartScreen() {
  drawBG(menuOverlay); scanlines(); drawBorder();
  drawStr(W / 2, Math.round(H * 0.35 - startTitle / 2), 'AUDIOMANCER', startTitle, 'center');
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() * 0.004);
  drawStr(W / 2, H - 80, 'PRESS ENTER', startPrompt, 'center');
  ctx.globalAlpha = 1;
}

function drawInstructionsScreen() {
  drawBG(menuOverlay); scanlines(); drawBorder();
  const lineGap = instructLine + 30, topY = Math.round(H * 0.15);
  drawStr(W / 2, topY, 'ARROW KEYS TO MOVE', instructLine, 'center');
  drawStr(W / 2, topY + lineGap, 'COLLECT AS MANY VOLUME SPELLS', instructLine, 'center');
  drawStr(W / 2, topY + lineGap * 2, 'AS YOU WANT THEN EXIT', instructLine, 'center');
  drawStr(W / 2, topY + lineGap * 3, 'PRESS SPACE TO ENTER EVIL SUBTRACT MODE', instructLine, 'center');
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() * 0.004);
  drawStr(W / 2, H - 80, 'PRESS ENTER TO START', instructPrompt, 'center');
  ctx.globalAlpha = 1;
}

function submitBtnY() { return 32 + endGameover * 2 + 30 + endTraveler + 14 + endScore + submitGap; }

function drawGameOverScreen() {
  drawBG(menuOverlay); scanlines(); drawBorder();
  const gy = 32;
  drawStr(W / 2, gy, 'GAME', endGameover, 'center');
  drawStr(W / 2, gy + endGameover + 10, 'OVER', endGameover, 'center');
  const sy = gy + endGameover * 2 + 30;
  drawStr(W / 2, sy, 'TRAVELER YOUR VOLUME IS', endTraveler, 'center');
  drawDigitStr(W / 2, sy + endTraveler + 27, score, endScore, 'center');
  const by = submitBtnY(), rowW = submitBtnW * 2 + btnGap, rx = Math.round(W / 2 - rowW / 2);
  if (assets.replayBtn?.naturalWidth) ctx.drawImage(assets.replayBtn, rx, by, submitBtnW, submitBtnH);
  if (assets.submitBtn?.naturalWidth) ctx.drawImage(assets.submitBtn, rx + submitBtnW + btnGap, by, submitBtnW, submitBtnH);
}

function drawGame(t) {
  const now = t ? t * 0.002 : Date.now() * 0.002;
  drawBG(gameOverlay); drawLedges(); drawExit(); drawNumbers(now); drawWizard(); drawHUD();
}

function goToInstructions() { cancelAnimationFrame(rafID); gameState = 'instructions'; rafID = requestAnimationFrame(menuLoop); }

function replayGame() { stopAllMusic(); musicMuted = false; startGame(); }

function startGame() {
  cancelAnimationFrame(rafID); clearInterval(spawnID);
  score = 0; numbers = []; gameState = 'playing'; gameActive = true; lastTime = 0;
  resetPlayer(); spawnNumber(); startMusic();
  spawnID = setInterval(spawnNumber, spawnMs);
  rafID = requestAnimationFrame(gameLoop);
}

function endGame() {
  if (!gameActive) return;
  gameActive = false; gameState = 'gameover';
  evilMusic.pause(); music.pause();
  clearInterval(spawnID); cancelAnimationFrame(rafID);
  rafID = requestAnimationFrame(menuLoop);
}

function gameLoop(t) {
  if (!gameActive) return;
  const dt = lastTime ? Math.min((t - lastTime) / (1000 / 60), 3) : 1;
  lastTime = t;
  update(dt); drawGame(t);
  rafID = requestAnimationFrame(gameLoop);
}

function menuLoop() {
  if (gameState === 'start') drawStartScreen();
  if (gameState === 'instructions') drawInstructionsScreen();
  if (gameState === 'gameover') drawGameOverScreen();
  rafID = requestAnimationFrame(menuLoop);
}

document.addEventListener('DOMContentLoaded', () => { const btn = document.getElementById('music-btn'); if (btn) btn.style.display = 'none'; });

function fitCanvas() {
  const wrap = document.getElementById('game-wrap');
  const scale = Math.min(1.0, (window.innerWidth - 64) / 1100, (window.innerHeight - 64) / 550);
  wrap.style.width = Math.round(1100 * scale) + 'px';
  wrap.style.height = Math.round(550 * scale) + 'px';
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

loadAssets(() => { rafID = requestAnimationFrame(menuLoop); });