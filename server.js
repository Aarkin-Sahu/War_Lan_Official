// Authoritative game server: HTTP (serves /public) + WebSocket (game).
// Clients only send commands; the server owns all game state.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const TICK_MS = 100;          // 10 ticks per second
const TROOP_SPEED = 120;      // world units per second (same for everyone)
const PRODUCE_EVERY_MS = 1000; // owned buildings gain  1 troop per second
const MAX_TROOPS = 99;        // production stops at this cap


// ---------- Map ----------
function makeBuildings() {
  // id, x, y, owner (-1 = neutral), troops
  // let rand = Math.floor(Math.random()*10)+1
  const b = [
    [0, 120, 300, 0, 50],
    [1, 880, 300, 1, 50],
    [2, 500, 120, -1, 20],
    [3, 500, 480, -1, 20],
    [4, 320, 300, -1, Math.floor(Math.random()*16)+20],
    [5, 680, 300, -1, Math.floor(Math.random()*16)+20],
    [6, 250, 100, -1, Math.floor(Math.random()*16)+20],
    [7, 750, 500, -1, Math.floor(Math.random()*16)+20],
    [8, 250, 500, -1, Math.floor(Math.random()*16)+20],
    [9, 750, 100, -1, Math.floor(Math.random()*16)+20],
  ];
  return b.map(([id, x, y, owner, troops]) => ({ id, x, y, owner, troops, maxTroops : troops, start_owner : owner }));
}

// ---------- Game state (single room) ----------
let game = newGame();

function newGame() {
  return {
    buildings: makeBuildings(),
    groups: [],            // { id, owner, from, to, count, launch, arrive }
    nextGroupId: 1,
    lastProduce: Date.now(),
    winner: null,
  };
}

const players = [null, null]; // ws for player 0 and 1

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sendTroops(playerId, fromId, toId, fraction) {
  if (game.winner !== null) return;
  const from = game.buildings[fromId];
  const to = game.buildings[toId];
  if (!from || !to || from === to) return;
  if (from.owner !== playerId) return;
  fraction = Math.min(1, Math.max(0.05, Number(fraction) || 0.5));
  const count = Math.floor(from.troops * fraction);
  if (count < 1) return;
  from.troops -= count;
  const now = Date.now();
  const travelMs = (dist(from, to) / TROOP_SPEED) * 1000;
  game.groups.push({
    id: game.nextGroupId++,
    owner: playerId,
    from: fromId,
    to: toId,
    count,
    launch: now,
    arrive: now + travelMs,
  });
}

function resolveArrival(g) {
  const b = game.buildings[g.to];
  if (b.owner === g.owner) {
    b.troops += g.count;
  } else {
    b.troops -= g.count;
    if (b.troops < 0) {
      b.owner = g.owner;
      b.troops = -b.troops;
    }
    // exactly 0 troops: defender keeps the building
    if(b.troops == 0 && b.start_owner == -1) b.owner = -1;
  }
}

function checkWinner() {
  const owners = new Set();
  for (const b of game.buildings) if (b.owner !== -1) owners.add(b.owner);
  for (const g of game.groups) owners.add(g.owner);
  if (owners.size === 1) game.winner = [...owners][0];
}

function tick() {
  const now = Date.now();

  // Production
  while (now - game.lastProduce >= PRODUCE_EVERY_MS) {
    game.lastProduce += PRODUCE_EVERY_MS;
    if (game.winner === null) {
            for (const b of game.buildings) {
        if (b.owner !== -1 && b.troops < MAX_TROOPS) b.troops += 1;
      }
    }
  }

  // Arrivals (no fighting in the middle; only on arrival)
  const arrived = game.groups.filter((g) => g.arrive <= now);
  if (arrived.length) {
    arrived.sort((a, b) => a.arrive - b.arrive);
    for (const g of arrived) resolveArrival(g);
    game.groups = game.groups.filter((g) => g.arrive > now);
    checkWinner();
  }

  broadcast();
}

function snapshot() {
  return {
    t: 'state',
    now: Date.now(),
    winner: game.winner,
    players: players.map((p) => p !== null),
    buildings: game.buildings,
    groups: game.groups,
  };
}

function broadcast() {
  const msg = JSON.stringify(snapshot());
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}

// ---------- HTTP static ----------
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let slot = players.indexOf(null);
  if (slot === -1) slot = -1; // spectator
  else players[slot] = ws;
  ws.playerId = slot;

  ws.send(JSON.stringify({ t: 'welcome', you: slot, speed: TROOP_SPEED }));
  console.log(`client joined as ${slot === -1 ? 'spectator' : 'player ' + slot}`);

  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.t === 'send' && ws.playerId !== -1) {
      sendTroops(ws.playerId, m.from | 0, m.to | 0, m.fraction);
    } else if (m.t === 'restart' && game.winner !== null && ws.playerId !== -1) {
      game = newGame();
    }
  });

  ws.on('close', () => {
    if (ws.playerId !== -1 && players[ws.playerId] === ws) players[ws.playerId] = null;
    console.log(`player ${ws.playerId} left`);
  });
});

setInterval(tick, TICK_MS);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name]) {
      if (n.family === 'IPv4' && !n.internal) {
        console.log(`  LAN: http://${n.address}:${PORT}`);
      }
    }
  }
  console.log(`  Local: http://localhost:${PORT}`);
});
