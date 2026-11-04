
// Client: renders server state and sends commands.
// No game logic here.

// ==========================================
// 1. CANVAS SETUP
// ==========================================

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');

// ==========================================
// 2. LOAD TOWER SPRITES
// ==========================================

const blueTower = new Image();
blueTower.src = '/assets/blue_tower.png';

const redTower = new Image();
redTower.src = '/assets/red_tower.png';

const greyTower = new Image();
greyTower.src = '/assets/grey_tower.png';

// ==========================================
// 3. LOAD GRASS BACKGROUND
// ==========================================

const bg = new Image();
bg.src = '/assets/grass_bg.png';

bg.onload = () => {
    console.log('Grass background loaded!');
};

bg.onerror = () => {
    console.error('Could not load grass_bg.png');
};

// ==========================================
// 4. GAME CONSTANTS
// ==========================================

const COLORS = ['#3b82f6', '#ef4444'];
const COLORS_DARK = ['#1d4ed8', '#b91c1c'];

const NEUTRAL = '#9ca3af';
const NEUTRAL_DARK = '#6b7280';

const R = 30;

const TOWER_WIDTH = 96;
const TOWER_HEIGHT = 96;

let me = -1;
let state = null;
let clockOffset = 0;
let selected = null;
let fraction = 0.5;

// ==========================================
// 5. WEBSOCKET CONNECTION
// ==========================================

const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${location.host}`);

ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);

    if (m.t === 'welcome') {
        me = m.you;
    }

    else if (m.t === 'state') {
        clockOffset = m.now - Date.now();
        state = m;
    }
};

ws.onclose = () => {
    hud.textContent = 'Disconnected from server.';
};

function send(obj) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
    }
}

// ==========================================
// 6. INPUT HANDLING
// ==========================================

function worldPos(ev) {
    const r = canvas.getBoundingClientRect();
    const p = ev.touches ? ev.touches[0] : ev;

    return {
        x: ((p.clientX - r.left) / r.width) * canvas.width,
        y: ((p.clientY - r.top) / r.height) * canvas.height
    };
}

function buildingAt(p) {
    if (!state) return null;

    for (const b of state.buildings) {

        const left = b.x - TOWER_WIDTH / 2;
        const right = b.x + TOWER_WIDTH / 2;
        const top = b.y + R - TOWER_HEIGHT;
        const bottom = b.y + R;

        if (
            p.x >= left &&
            p.x <= right &&
            p.y >= top &&
            p.y <= bottom
        ) {
            return b;
        }
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

        if (b.owner === me) {
            selected = b.id;
        }

    } else if (b.id === selected) {

        selected = null;

    } else {

        send({
            t: 'send',
            from: selected,
            to: b.id,
            fraction
        });

        selected = null;
    }
});

// ==========================================
// 7. KEYBOARD CONTROLS
// ==========================================

window.addEventListener('keydown', (ev) => {

    if (ev.key === '1') fraction = 0.25;
    if (ev.key === '2') fraction = 0.5;
    if (ev.key === '3') fraction = 0.75;
    if (ev.key === '4') fraction = 1;

    if (ev.key === 'Escape') {
        selected = null;
    }

    if (
        (ev.key === 'r' || ev.key === 'R') &&
        state &&
        state.winner !== null
    ) {
        send({ t: 'restart' });
    }
});

// ==========================================
// 8. COLOR HELPERS
// ==========================================

function colorOf(owner) {
    return owner === -1 ? NEUTRAL : COLORS[owner];
}

function darkColorOf(owner) {
    return owner === -1 ? NEUTRAL_DARK : COLORS_DARK[owner];
}

// ==========================================
// 9. TERRITORY INDICATORS
// ==========================================

function drawTerritoryMarker(b, isMine, t) {

    let markerColor;

    if (b.owner === 0) {
        markerColor = 'rgba(35, 110, 255, 0.28)';
    }

    else if (b.owner === 1) {
        markerColor = 'rgba(235, 55, 55, 0.28)';
    }

    else {
        markerColor = 'rgba(180, 180, 180, 0.25)';
    }

    const pulse = isMine
        ? 1 + 0.04 * Math.sin(t / 180)
        : 1;

    ctx.save();

    // Coloured ground platform
    ctx.beginPath();

    ctx.ellipse(
        b.x,
        b.y + 25,
        39 * pulse,
        15 * pulse,
        0,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = markerColor;
    ctx.fill();

    // Platform border
    ctx.lineWidth = isMine ? 3 : 2;

    if (b.owner === 0) {
        ctx.strokeStyle = 'rgba(45, 130, 255, 0.85)';
    }

    else if (b.owner === 1) {
        ctx.strokeStyle = 'rgba(255, 75, 75, 0.85)';
    }

    else {
        ctx.strokeStyle = 'rgba(210, 210, 210, 0.65)';
    }

    ctx.stroke();

    ctx.restore();
}

// ==========================================
// 10. DRAW BUILDINGS
// ==========================================

function drawBuilding(b, t) {

    const isMine = b.id === selected;

    const base = colorOf(b.owner);
    const dark = darkColorOf(b.owner);

    // Draw territory indicator first
    drawTerritoryMarker(b, isMine, t);

    // Ground shadow
    ctx.beginPath();

    ctx.ellipse(
        b.x,
        b.y + R * 0.6,
        R * 0.9,
        R * 0.35,
        0,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fill();

    // Choose tower according to ownership
    let tower = null;

    if (b.owner === 0) {
        tower = blueTower;
    }

    else if (b.owner === 1) {
        tower = redTower;
    }

    else if (b.owner === -1) {
        tower = greyTower;
    }

    // Draw tower PNG
    if (
        tower &&
        tower.complete &&
        tower.naturalWidth > 0
    ) {

        ctx.save();

        // Golden selection glow
        if (isMine) {
            ctx.shadowColor = '#ffd54a';
            ctx.shadowBlur = 18;
        }

        ctx.drawImage(
            tower,
            b.x - TOWER_WIDTH / 2,
            b.y + R - TOWER_HEIGHT,
            TOWER_WIDTH,
            TOWER_HEIGHT
        );

        ctx.restore();

    } else {

        // Fallback circle if sprite hasn't loaded
        const pulse = isMine
            ? 1 + 0.06 * Math.sin(t / 180)
            : 1;

        const radius = R * pulse;

        const grad = ctx.createRadialGradient(
            b.x - radius * 0.3,
            b.y - radius * 0.35,
            radius * 0.15,
            b.x,
            b.y,
            radius
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

        ctx.strokeStyle = isMine
            ? '#ffd54a'
            : 'rgba(0,0,0,.4)';

        ctx.stroke();
    }

    // Troop count
    ctx.fillStyle = '#fff';

    ctx.font = 'bold 22px system-ui';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = 'rgba(0,0,0,.8)';
    ctx.shadowBlur = 5;

    ctx.fillText(b.troops, b.x, b.y);

    ctx.shadowBlur = 0;
}

// ==========================================
// 11. DRAW MOVING TROOPS
// ==========================================

function drawGroup(g, serverNow) {

    const from = state.buildings[g.from];
    const to = state.buildings[g.to];

    const t = Math.min(
        1,
        Math.max(
            0,
            (serverNow - g.launch) / (g.arrive - g.launch)
        )
    );

    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;

    // Faint movement path
    ctx.beginPath();

    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);

    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 2;

    ctx.setLineDash([6, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Glow trail
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);

    ctx.fillStyle = colorOf(g.owner) + '33';
    ctx.fill();

    // Moving troop group
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);

    ctx.fillStyle = colorOf(g.owner);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();

    // Troop count
    ctx.fillStyle = '#fff';

    ctx.font = 'bold 13px system-ui';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(g.count, x, y);
}

// ==========================================
// 12. DRAW GRASS BACKGROUND
// ==========================================

function drawBackground() {

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    if (bg.complete && bg.naturalWidth > 0) {

        ctx.save();

        // Reduce the intense green saturation
        ctx.filter = 'saturate(0.55) brightness(0.78)';

        ctx.drawImage(
            bg,
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.restore();

        // Subtle dark green overlay
        ctx.fillStyle = 'rgba(35, 55, 20, 0.15)';

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        // Soft vignette at the edges
        const vignette = ctx.createRadialGradient(
            canvas.width / 2,
            canvas.height / 2,
            canvas.height * 0.25,
            canvas.width / 2,
            canvas.height / 2,
            canvas.height * 0.8
        );

        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.18)');

        ctx.fillStyle = vignette;

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

    } else {

        // Fallback while grass image loads
        ctx.fillStyle = '#788d43';

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );
    }
}

// ==========================================
// 13. MAIN GAME LOOP
// ==========================================

function frame(t) {

    // Draw background
    drawBackground();

    if (state) {

        const serverNow = Date.now() + clockOffset;

        // Draw troop groups first
        for (const g of state.groups) {
            drawGroup(g, serverNow);
        }

        // Draw buildings
        for (const b of state.buildings) {
            drawBuilding(b, t || 0);
        }

        // Winner screen
        if (state.winner !== null) {

            ctx.fillStyle = 'rgba(0,0,0,.6)';

            ctx.fillRect(
                0,
                0,
                canvas.width,
                canvas.height
            );

            ctx.fillStyle = '#fff';

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.font = 'bold 56px system-ui';

            ctx.shadowColor = colorOf(state.winner);
            ctx.shadowBlur = 25;

            const msg =
                me === -1
                    ? `Player ${state.winner + 1} wins`
                    : state.winner === me
                        ? 'You win!'
                        : 'You lose';

            ctx.fillText(
                msg,
                canvas.width / 2,
                canvas.height / 2 - 20
            );

            ctx.shadowBlur = 0;

            ctx.font = '24px system-ui';

            ctx.fillText(
                'Press R to play again',
                canvas.width / 2,
                canvas.height / 2 + 35
            );
        }

        // HUD
        const role =
            me === -1
                ? 'Spectating'
                : `You are <b style="color:${COLORS[me]}">${me === 0 ? 'Blue' : 'Red'}</b>`;

        const opp = state.players.every(Boolean)
            ? ''
            : ' &middot; waiting for second player...';

        hud.innerHTML =
            `${role}${opp} &middot; click your building, then a target &middot; send <b>${fraction * 100}%</b> (keys 1-4)`;
    }

    requestAnimationFrame(frame);
}

// ==========================================
// 14. START GAME
// ==========================================

requestAnimationFrame(frame);
