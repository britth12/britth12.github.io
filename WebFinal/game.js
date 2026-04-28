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
const gravity = 0.65;
const jumpForce = -12;
const playerSpeed = 6;
const lgapBase = 3;
const lspcBase = 10;
const exitAboveFloor = 10;
const exitSignOffset = 10;
const exitSignOpacity = 0.99;
const submitGap = 40;

const assets = {};
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const numNames = {
  0: 'Zero', 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine'
};

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
  ...alphabet.split('').map(l => ({ key: 'lc_' + l, src: 'Letters/' + l + '.png' })),
  ...Object.entries(numNames).map(([d, n]) => ({ key: 'num_' + d, src: 'Numbers/' + n + '.png' })),
];

function loadAssets(onDone) {
  let loaded = 0;
  const total = assetList.length;

  function onLoad() {
    loaded++;
    if (loaded >= total) {
      buildWizSheet(assets.wizRaw, 'wizCellW', 'wizCellH', 'wiz');
      buildWizSheet(assets.evilWizRaw, 'evilWizCellW', 'evilWizCellH', 'evilWiz');
      computeLetterAspectRatios();
      onDone();
    }
  }

  for (const item of assetList) {
    const img = new Image();
    img.onload = onLoad;
    img.onerror = onLoad;
    img.src = item.src;
    assets[item.key] = img;
  }
}

const wizFrameRegions = [
  [9, 81],
  [93, 165],
  [177, 249],
  [261, 333],
  [345, 417],
];

function buildWizSheet(raw, cellWKey, cellHKey, sheetKey) {
  if (!raw || !raw.naturalWidth) {
    assets[sheetKey] = null;
    return;
  }

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = raw.naturalWidth;
  tempCanvas.height = raw.naturalHeight;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(raw, 0, 0);

  const IW = tempCanvas.width;
  const IH = tempCanvas.height;

  const TH = wizTargetH;
  const PAD = 5;

  const frameCvsList = [];

  for (const [rx1, rx2] of wizFrameRegions) {
    const fw = rx2 - rx1;
    const TW = Math.round(fw / IH * TH);
    const CW = TW + PAD * 2;
    const CH = TH + PAD;

    const fc = document.createElement('canvas');
    fc.width = CW;
    fc.height = CH;
    const fx = fc.getContext('2d');
    fx.imageSmoothingEnabled = false;
    fx.drawImage(tempCanvas, rx1, 0, fw, IH, PAD, PAD, TW, TH);

    frameCvsList.push({ fc, CW, CH });
  }

  const CW = frameCvsList[0].CW;
  const CH = frameCvsList[0].CH;
  assets[cellWKey] = CW;
  assets[cellHKey] = CH;

  const sheet = document.createElement('canvas');
  sheet.width = CW * frameCvsList.length;
  sheet.height = CH;
  const sx = sheet.getContext('2d');
  sx.imageSmoothingEnabled = false;

  for (let i = 0; i < frameCvsList.length; i++) {
    sx.drawImage(frameCvsList[i].fc, i * CW, 0);
  }

  assets[sheetKey] = sheet;
}
function computeLetterAspectRatios() {
  for (const letter of alphabet.split('')) {
    const img = assets['lc_' + letter];
    if (img && img.naturalWidth && img.naturalHeight) {
      img._ar = img.naturalWidth / img.naturalHeight;
    }
  }
}

const wizFrames = 5;
const wizIdleDly = 80;
const wizWalkDly = 80;
let wizFrame = 0;
let wizLastTime = 0;

function tickWizard(state, t) {
  if (state === 'jump') {
    wizFrame = 2;
    return;
  }

  const delay = state === 'walk' ? wizWalkDly : wizIdleDly;
  if (wizLastTime === 0) {
    wizLastTime = t;
    return;
  }
  if (t - wizLastTime >= delay) {
    wizLastTime = t;
    wizFrame = (wizFrame + 1) % wizFrames;
  }
}

function drawWizard() {
  const sheet = evilMode ? assets.evilWiz : assets.wiz;
  const CW = evilMode ? assets.evilWizCellW : assets.wizCellW;
  const CH = evilMode ? assets.evilWizCellH : assets.wizCellH;

  if (!sheet) {
    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    return;
  }

  const dx = Math.round(player.x - (CW - player.w) / 2);
  const dy = Math.round(player.y + player.h - CH);

  ctx.save();
  if (player.facing === 1) {
    ctx.translate(dx + CW / 2, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(dx + CW / 2), 0);
  }
  ctx.drawImage(sheet, wizFrame * CW, 0, CW, CH, dx, dy, CW, CH);
  ctx.restore();
}

const lgap = h => Math.round(lgapBase * h / 16);
const lspc = h => Math.round(lspcBase * h / 16);

function measureStr(str, h) {
  let totalWidth = 0;

  for (const ch of str.toUpperCase()) {
    if (ch === ' ') {
      totalWidth += lspc(h);
      continue;
    }
    const img = assets['lc_' + ch];
    if (img && img._ar) {
      totalWidth += Math.round(h * img._ar) + lgap(h);
    }
  }

  return Math.max(0, totalWidth - lgap(h));
}

function drawStr(x, y, str, h, align = 'left') {
  const totalWidth = measureStr(str, h);

  let cx;
  if (align === 'center') {
    cx = x - totalWidth / 2;
  } else if (align === 'right') {
    cx = x - totalWidth;
  } else {
    cx = x;
  }

  for (const ch of str.toUpperCase()) {
    if (ch === ' ') {
      cx += lspc(h);
      continue;
    }
    const img = assets['lc_' + ch];
    if (!img || !img._ar) continue;

    const dw = Math.round(h * img._ar);
    ctx.drawImage(img, 0, 0, img.width, img.height, Math.round(cx), y, dw, h);
    cx += dw + lgap(h);
  }
}

function measureDigitStr(num, h, gap = 4) {
  let totalWidth = 0;

  for (const d of String(num)) {
    const img = assets['num_' + d];
    if (img && img.naturalWidth) {
      totalWidth += Math.round(h * img.naturalWidth / img.naturalHeight) + gap;
    } else {
      totalWidth += Math.round(h * 0.7) + gap;
    }
  }

  return Math.max(0, totalWidth - gap);
}

function drawDigitStr(x, y, num, h, align = 'left', gap = 4) {
  const totalWidth = measureDigitStr(num, h, gap);

  let cx;
  if (align === 'center') {
    cx = x - totalWidth / 2;
  } else if (align === 'right') {
    cx = x - totalWidth;
  } else {
    cx = x;
  }

  for (const d of String(num)) {
    const img = assets['num_' + d];
    if (img && img.naturalWidth) {
      const dw = Math.round(h * img.naturalWidth / img.naturalHeight);
      ctx.drawImage(img, Math.round(cx), y, dw, h);
      cx += dw + gap;
    } else {
      ctx.save();
      ctx.font = `bold ${h}px monospace`;
      ctx.fillStyle = '#ffd700';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(d, Math.round(cx), y);
      ctx.restore();
      cx += Math.round(h * 0.7) + gap;
    }
  }
}

function drawBG(tintAlpha = 0) {
  if (assets.bg && assets.bg.naturalWidth) {
    ctx.drawImage(assets.bg, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);
  }

  if (assets.floor && assets.floor.naturalWidth) {
    ctx.drawImage(assets.floor, 0, 0, W, H);
  }

  if (tintAlpha) {
    ctx.fillStyle = `rgba(0,0,0,${tintAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBorder() {
  ctx.fillStyle = '#0088cc';
  ctx.fillRect(0, 0, W, 2);
  ctx.fillRect(0, H - 2, W, 2);
}

function scanlines() {
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, W, 2);
  }
}

function plankW(key) {
  const img = assets[key];
  if (img && img.naturalWidth) {
    return Math.round(plankH * img.naturalWidth / img.naturalHeight);
  }
  return 120;
}

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
    const p = platforms[i];
    const img = assets[p.plank];
    const w = plankW(p.plank);

    if (img && img.naturalWidth) {
      ctx.drawImage(img, p.x, p.y, w, p.h);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(p.x, p.y + p.h - 2, w, 3);
    } else {
      ctx.fillStyle = '#5c3d1e';
      ctx.fillRect(p.x, p.y, w, p.h);
    }
  }
}

const exitFloor = 481;
const exitTop = exitFloor - 100;

function drawExit() {
  ctx.fillStyle = 'rgba(220,40,40,0.85)';
  ctx.fillRect(W - 4, exitTop, 4, exitFloor - exitTop);

  const img = assets.exit;
  if (img && img.naturalWidth) {
    ctx.globalAlpha = exitSignOpacity;
    ctx.drawImage(
      img,
      W - img.naturalWidth - exitSignOffset,
      exitTop - img.naturalHeight - exitAboveFloor,
      img.naturalWidth,
      img.naturalHeight
    );
    ctx.globalAlpha = 1;
  }
}

const spawnY = 481 - 66;
const player = {
  x: 537, y: spawnY,
  w: 42, h: 66,
  vx: 0, vy: 0,
  onGround: false,
  facing: 1,
  dropThrough: 0
};

function resetPlayer() {
  player.x = 537;
  player.y = spawnY;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.facing = 1;
  player.dropThrough = 0;
  wizFrame = 0;
  wizLastTime = 0;
  evilMode = false;
}

const keys = {};

window.addEventListener('keydown', e => {
  const handled = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Enter'];
  if (handled.includes(e.code)) e.preventDefault();
  keys[e.code] = true;

  if (gameState === 'start' && e.code === 'Enter') {
    goToInstructions();
  } else if (gameState === 'instructions' && e.code === 'Enter') {
    startGame();
  }

  if (gameState === 'playing' && e.code === 'Space') {
    toggleEvilMode();
  }
});

window.addEventListener('keyup', e => {
  keys[e.code] = false;
});

const spawnMs = 1600;
const maxNumbers = 5;
const maxScore = 100;
let score = 0;
let gameActive = false;
let gameState = 'start';
let evilMode = false;
let numbers = [];
let spawnID = null;
let rafID = null;
let lastTime = 0;

const minSpawnDist = collectSize * 2;

function spawnNumber() {
  if (numbers.length >= maxNumbers) return;

  for (let attempt = 0; attempt < 10; attempt++) {
    const p = platforms[Math.floor(Math.random() * platforms.length)];
    const pw = p.plank ? plankW(p.plank) : W;
    const nx = p.x + 20 + Math.random() * (pw - 40);
    const ny = p.y - 22;

    let tooClose = false;
    for (const existing of numbers) {
      if (Math.abs(existing.x - nx) < minSpawnDist && Math.abs(existing.y - ny) < minSpawnDist) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) {
      numbers.push({ x: nx, y: ny, value: Math.floor(Math.random() * 9) + 1, bob: Math.random() * Math.PI * 2 });
      return;
    }
  }
}

function drawNumbers(now) {
  const glowColor = evilMode ? '#4fc3f7' : '#ffd700';

  for (const n of numbers) {
    const by = Math.sin(now + n.bob) * 5;
    const img = assets['num_' + n.value];
    const dx = Math.round(n.x - collectSize / 2);
    const dy = Math.round(n.y + by - collectSize / 2);

    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 20;

    if (img && img.naturalWidth) {
      ctx.drawImage(img, dx, dy, collectSize, collectSize);
    } else {
      ctx.fillStyle = glowColor;
      ctx.font = `bold ${collectSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.value, n.x, n.y + by);
    }

    ctx.restore();
  }
}

const music = document.getElementById('bg-music');
const evilMusic = document.getElementById('evil-music');
let musicMuted = false;

function startMusic() {
  if (!musicMuted) {
    music.volume = 0.4;
    music.play().catch(() => { });
  }
}

function stopAllMusic() {
  music.pause();
  music.currentTime = 0;
  evilMusic.pause();
  evilMusic.currentTime = 0;
}

function toggleEvilMode() {
  evilMode = !evilMode;

  if (musicMuted) return;

  if (evilMode) {
    music.pause();
    evilMusic.currentTime = 0;
    evilMusic.volume = 0.4;
    evilMusic.play().catch(() => { });
  } else {
    evilMusic.pause();
    music.play().catch(() => { });
  }
}

const mbtnSize = 44;
const musicBtnRect = { x: W - mbtnSize - 10, y: H - mbtnSize - 10, w: mbtnSize, h: mbtnSize };
const submitBtnW = 134;
const submitBtnH = 48;
const btnGap = 45;

canvas.addEventListener('click', e => {
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (W / r.width);
  const my = (e.clientY - r.top) * (H / r.height);

  const mb = musicBtnRect;
  if (mx >= mb.x && mx <= mb.x + mb.w && my >= mb.y && my <= mb.y + mb.h) {
    musicMuted = !musicMuted;
    if (musicMuted) {
      music.pause();
      evilMusic.pause();
    } else if (evilMode) {
      evilMusic.volume = 0.4;
      evilMusic.play().catch(() => { });
    } else {
      music.volume = 0.4;
      music.play().catch(() => { });
    }
    return;
  }

  if (gameState === 'gameover') {
    const by = submitBtnY();
    const rowW = submitBtnW * 2 + btnGap;
    const rx = Math.round(W / 2 - rowW / 2);
    const inRow = my >= by && my <= by + submitBtnH;

    if (inRow && mx >= rx && mx <= rx + submitBtnW) {
      replayGame();
    }
    if (inRow && mx >= rx + submitBtnW + btnGap && mx <= rx + rowW) {
      alert('Your volume is ' + score);
    }
  }
});

function drawMusicBtn() {
  ctx.globalAlpha = musicMuted ? 0.35 : 0.85;

  const mb = assets.musicBtn;
  if (mb && mb.naturalWidth) {
    ctx.drawImage(mb, musicBtnRect.x, musicBtnRect.y, musicBtnRect.w, musicBtnRect.h);
  } else {
    ctx.fillStyle = musicMuted ? '#334' : '#4fc3f7';
    ctx.fillRect(musicBtnRect.x, musicBtnRect.y, musicBtnRect.w, musicBtnRect.h);
    ctx.fillStyle = '#fff';
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      musicMuted ? '🔇' : '♪',
      musicBtnRect.x + musicBtnRect.w / 2,
      musicBtnRect.y + musicBtnRect.h / 2
    );
  }

  ctx.globalAlpha = 1;
}

function update(dt = 1, t=0) {
  const goingLeft = keys['ArrowLeft'] || keys['KeyA'];
  const goingRight = keys['ArrowRight'] || keys['KeyD'];
  const goingDown = keys['ArrowDown'] || keys['KeyS'];

  if (goingLeft) {
    player.vx = -playerSpeed * dt;
    player.facing = -1;
  } else if (goingRight) {
    player.vx = playerSpeed * dt;
    player.facing = 1;
  } else {
    player.vx = 0;
  }

  player.x = Math.max(0, Math.min(W - player.w, player.x + player.vx));

  if (goingDown && player.onGround && player.dropThrough === 0) {
    player.dropThrough = 12;
  }
  if (player.dropThrough > 0) {
    player.dropThrough--;
  }

  player.vy += gravity * dt;
  const prevBottom = player.y + player.h;
  player.y += player.vy * dt;
  player.onGround = false;

  for (const p of platforms) {
    const pw = p.plank ? plankW(p.plank) : W;
    const curBottom = player.y + player.h;

    if (player.dropThrough > 0 && p.plank !== null) continue;

    const wasAbove = prevBottom <= p.y + 1;
    const nowBelow = curBottom >= p.y;
    const fallingDown = player.vy >= 0;
    const overlapX = player.x + player.w > p.x + 2 && player.x < p.x + pw - 2;

    if (fallingDown && wasAbove && nowBelow && overlapX) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  }

  const jumpPressed = keys['ArrowUp'] || keys['KeyW'];
  if (jumpPressed && player.onGround) {
    player.vy = jumpForce;
    player.onGround = false;
  }

  if (player.y > H + 80) {
    resetPlayer();
  }

  if (player.x + player.w >= W - 2 && player.y + player.h > exitTop && player.y < exitFloor) {
    endGame();
  }

  const wizState = !player.onGround ? 'jump' : (goingLeft || goingRight) ? 'walk' : 'idle';
  tickWizard(wizState, t);

  const hr = collectSize / 2 + 6;
  const remaining = [];

  for (const n of numbers) {
    const touchX = player.x < n.x + hr && player.x + player.w > n.x - hr;
    const touchY = player.y < n.y + hr && player.y + player.h > n.y - hr;

    if (touchX && touchY) {
      if (evilMode) {
        score = Math.max(0, score - n.value);
      } else {
        score = Math.min(score + n.value, maxScore);
      }
      if (score >= maxScore) {
        endGame();
        return;
      }
    } else {
      remaining.push(n);
    }
  }

  numbers = remaining;
}

function drawHUD() {
  ctx.shadowBlur = 0;
  drawStr(12, 8, 'SCORE', hudLabelH, 'left');
  const scoreLabelWidth = measureStr('SCORE', hudLabelH);
  const scoreNumY = 8 + Math.round((hudLabelH - hudNumH) / 2);
  drawDigitStr(12 + scoreLabelWidth + 8, scoreNumY, score, hudNumH, 'left');
  drawMusicBtn();
}

function drawStartScreen() {
  drawBG(menuOverlay);
  scanlines();
  drawBorder();
  drawStr(W / 2, Math.round(H * 0.35 - startTitle / 2), 'AUDIOMANCER', startTitle, 'center');
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() * 0.004);
  drawStr(W / 2, H - 80, 'PRESS ENTER', startPrompt, 'center');
  ctx.globalAlpha = 1;
}

function drawInstructionsScreen() {
  drawBG(menuOverlay);
  scanlines();
  drawBorder();

  const lineGap = instructLine + 30;
  const topY = Math.round(H * 0.15);

  drawStr(W / 2, topY, 'ARROW KEYS TO MOVE', instructLine, 'center');
  drawStr(W / 2, topY + lineGap, 'COLLECT AS MANY VOLUME SPELLS', instructLine, 'center');
  drawStr(W / 2, topY + lineGap * 2, 'AS YOU WANT THEN EXIT', instructLine, 'center');
  drawStr(W / 2, topY + lineGap * 3, 'PRESS SPACE TO ENTER EVIL SUBTRACT MODE', instructLine, 'center');

  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() * 0.004);
  drawStr(W / 2, H - 80, 'PRESS ENTER TO START', instructPrompt, 'center');
  ctx.globalAlpha = 1;
}

function submitBtnY() {
  return 32 + endGameover * 2 + 30 + endTraveler + 14 + endScore + submitGap;
}

function drawGameOverScreen() {
  drawBG(menuOverlay);
  scanlines();
  drawBorder();

  const gy = 32;
  drawStr(W / 2, gy, 'GAME', endGameover, 'center');
  drawStr(W / 2, gy + endGameover + 10, 'OVER', endGameover, 'center');

  const sy = gy + endGameover * 2 + 30;
  drawStr(W / 2, sy, 'TRAVELER YOUR VOLUME IS', endTraveler, 'center');
  drawDigitStr(W / 2, sy + endTraveler + 27, score, endScore, 'center');

  const by = submitBtnY();
  const rowW = submitBtnW * 2 + btnGap;
  const rx = Math.round(W / 2 - rowW / 2);

  if (assets.replayBtn && assets.replayBtn.naturalWidth) {
    ctx.drawImage(assets.replayBtn, rx, by, submitBtnW, submitBtnH);
  }
  if (assets.submitBtn && assets.submitBtn.naturalWidth) {
    ctx.drawImage(assets.submitBtn, rx + submitBtnW + btnGap, by, submitBtnW, submitBtnH);
  }
}

function drawGame(t) {
  const now = t ? t * 0.002 : Date.now() * 0.002;
  drawBG(gameOverlay);
  drawLedges();
  drawExit();
  drawNumbers(now);
  drawWizard();
  drawHUD();
}

function goToInstructions() {
  cancelAnimationFrame(rafID);
  gameState = 'instructions';
  rafID = requestAnimationFrame(menuLoop);
}

function replayGame() {
  stopAllMusic();
  musicMuted = false;
  startGame();
}

function startGame() {
  cancelAnimationFrame(rafID);
  clearInterval(spawnID);
  score = 0;
  numbers = [];
  gameState = 'playing';
  gameActive = true;
  lastTime = 0;
  resetPlayer();
  spawnNumber();
  startMusic();
  spawnID = setInterval(spawnNumber, spawnMs);
  rafID = requestAnimationFrame(gameLoop);
}

function endGame() {
  if (!gameActive) return;
  gameActive = false;
  gameState = 'gameover';
  evilMusic.pause();
  music.pause();
  clearInterval(spawnID);
  cancelAnimationFrame(rafID);
  rafID = requestAnimationFrame(menuLoop);
}

function gameLoop(t) {
  if (!gameActive) return;
  const dt = lastTime ? Math.min((t - lastTime) / (1000 / 60), 3) : 1;
  lastTime = t;
  update(dt, t);
  drawGame(t);
  rafID = requestAnimationFrame(gameLoop);
}

function menuLoop() {
  if (gameState === 'start') drawStartScreen();
  if (gameState === 'instructions') drawInstructionsScreen();
  if (gameState === 'gameover') drawGameOverScreen();
  rafID = requestAnimationFrame(menuLoop);
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('music-btn');
  if (btn) btn.style.display = 'none';
});

function fitCanvas() {
  const wrap = document.getElementById('game-wrap');
  const scaleX = (window.innerWidth - 64) / 1100;
  const scaleY = (window.innerHeight - 64) / 550;
  const scale = Math.min(1.0, scaleX, scaleY);
  wrap.style.width = Math.round(1100 * scale) + 'px';
  wrap.style.height = Math.round(550 * scale) + 'px';
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

loadAssets(() => {
  rafID = requestAnimationFrame(menuLoop);
});