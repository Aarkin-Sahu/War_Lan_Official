// Client: renders server state and sends commands. No game logic here.

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');

const COLORS = ['#3b82f6', '#ef4444']; // player 0 blue, player 1 red
const COLORS_DARK = ['#1d4ed8', '#b91c1c'];
const NEUTRAL = '#9ca3af';
const NEUTRAL_DARK = '#6b7280';
const R = 30; // building radius

let me = -1;
let state = null;
let clockOffset = 0;      // serverNow - clientNow
let selected = null;      // building id
let fraction = 0.5;

const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${location.host}`);

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.t === 'welcome') {
    me = m.you;
  } else if (m.t === 'state') {
    clockOffset = m.now - Date.now();
    state = m;
  }
};
ws.onclose = () => (hud.textContent = 'Disconnected from server.');

function send(obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// ---------- Input ----------
function worldPos(ev) {
  const r = canvas.getBoundingClientRect();
  const p = ev.touches ? ev.touches[0] : ev;
  return {
    x: ((p.clientX - r.left) / r.width) * canvas.width,
    y: ((p.clientY - r.top) / r.height) * canvas.height,
  };
}

function buildingAt(p) {
  if (!state) return null;
  for (const b of state.buildings) {
    if (Math.hypot(b.x - p.x, b.y - p.y) <= R + 6) return b;
  }
  return null;
}

canvas.addEventListener('pointerdown', (ev) => {
  if (!state || me === -1) return;
  const b = buildingAt(worldPos(ev));
  if (!b) {
    selected = null;
    return;
  }
  if (selected === null) {
    if (b.owner === me) selected = b.id;
  } else if (b.id === selected) {
    selected = null;
  } else {
    send({ t: 'send', from: selected, to: b.id, fraction });
    selected = null;
  }
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === '1') fraction = 0.25;
  if (ev.key === '2') fraction = 0.5;
  if (ev.key === '3') fraction = 0.75;
  if (ev.key === '4') fraction = 1;
  if (ev.key === 'Escape') selected = null;
  if (ev.key === 'r' && state && state.winner !== null) send({ t: 'restart' });
});

// ---------- Color helpers ----------
function colorOf(owner) {
  return owner === -1 ? NEUTRAL : COLORS[owner];
}
function darkColorOf(owner) {
  return owner === -1 ? NEUTRAL_DARK : COLORS_DARK[owner];
}

// ---------- Background (drawn once to an offscreen canvas) ----------
const bg = document.createElement('canvas');
bg.width = canvas.width;
bg.height = canvas.height;
(function paintBackground() {
  const bctx = bg.getContext('2d');
  const g = bctx.createLinearGradient(0, 0, 0, bg.height);
  g.addColorStop(0, '#6b7a3a');
  g.addColorStop(1, '#4e5b29');
  bctx.fillStyle = g;
  bctx.fillRect(0, 0, bg.width, bg.height);

  // soft vignette toward the edges
  const vg = bctx.createRadialGradient(
    bg.width / 2, bg.height / 2, bg.height * 0.25,
    bg.width / 2, bg.height / 2, bg.height * 0.75
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.25)');
  bctx.fillStyle = vg;
  bctx.fillRect(0, 0, bg.width, bg.height);

  // scattered dots for a bit of texture, deterministic (same seed-ish pattern every load)
  bctx.fillStyle = 'rgba(255,255,255,.04)';
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 160; i++) {
    const x = rand() * bg.width;
    const y = rand() * bg.height;
    const r = 1 + rand() * 2;
    bctx.beginPath();
    bctx.arc(x, y, r, 0, Math.PI * 2);
    bctx.fill();
  }
})();

// ---------- Drawing ----------
function drawBuilding(b, t) {
  const isMine = b.id === selected;
  const base = colorOf(b.owner);
  const dark = darkColorOf(b.owner);

  // soft ground shadow
  ctx.beginPath();
  ctx.ellipse(b.x, b.y + R * 0.6, R * 0.9, R * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fill();

  // gentle pulse when selected
  const pulse = isMine ? 1 + 0.06 * Math.sin(t / 180) : 1;
  const radius = R * pulse;

  const grad = ctx.createRadialGradient(
    b.x - radius * 0.3, b.y - radius * 0.35, radius * 0.15,
    b.x, b.y, radius
  );
  grad.addColorStop(0, base);
  grad.addColorStop(1, dark);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = isMine ? 4 : 2.5;
  ctx.strokeStyle = isMine ? '#ffd54a' : 'rgba(0,0,0,.4)';
  ctx.stroke();


  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.6)';
  ctx.shadowBlur = 4;
  ctx.fillText(b.troops, b.x, b.y);
  ctx.shadowBlur = 0;
}

function drawGroup(g, serverNow) {
  const from = state.buildings[g.from];
  const to = state.buildings[g.to];
  const t = Math.min(1, Math.max(0, (serverNow - g.launch) / (g.arrive - g.launch)));
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;

  // faint path line
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  // small glow trail behind the group
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fillStyle = colorOf(g.owner) + '33'; // add alpha
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fillStyle = colorOf(g.owner);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(g.count, x, y);
}

function frame(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bg, 0, 0);

  if (state) {
    const serverNow = Date.now() + clockOffset;
    for (const g of state.groups) drawGroup(g, serverNow);
    for (const b of state.buildings) drawBuilding(b, t || 0);

    if (state.winner !== null) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 56px system-ui';
      ctx.shadowColor = colorOf(state.winner);
      ctx.shadowBlur = 25;
      const msg = me === -1 ? `Player ${state.winner + 1} wins` : state.winner === me ? 'You win!' : 'You lose';
      ctx.fillText(msg, canvas.width / 2, canvas.height / 2 - 20);
      ctx.shadowBlur = 0;
      ctx.font = '24px system-ui';
      ctx.fillText('Press R to play again', canvas.width / 2, canvas.height / 2 + 35);
    }

    const role = me === -1 ? 'Spectating' : `You are <b style="color:${COLORS[me]}">${me === 0 ? 'Blue' : 'Red'}</b>`;
    const opp = state.players.every(Boolean) ? '' : ' &middot; waiting for second player...';
    hud.innerHTML = `${role}${opp} &middot; click your building, then a target &middot; send <b>${fraction * 100}%</b> (keys 1-4)`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);