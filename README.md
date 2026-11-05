# WarLAN

A real-time strategy game where troops take actual time to march between buildings. Capture every building on the map before your opponent captures yours.

Built as a multiplayer prototype inspired by *War Masters: Tactical Strategy* — same core idea, built from scratch.

## How it works

- Each building produces troops over time.
- Click one of your buildings, then click a target to send troops there.
- Troops travel at a fixed speed and can't be redirected once sent.
- Troops don't fight mid-flight — combat only happens the instant they arrive.
- Capture every building on the map to win.

## Running it locally

**Requirements:** [Node.js](https://nodejs.org) (LTS version)

```bash
git clone https://github.com/Aarkin-Sahu/War_Lan_Official.git
cd War_Lan_Official
npm install
node server.js
```

Then open **http://localhost:3000** in your browser. On Windows, you can also just double-click `start.bat`, which handles the install and launch for you.

## Playing with a friend

**Same Wi-Fi / LAN:** the server prints a `LAN:` address in the console — share that with your friend, and they open it in their own browser.

**Different networks:** tunnel your local server with [ngrok](https://ngrok.com):
```bash
ngrok http 3000
```
Share the `https://....ngrok-free.dev` link it gives you.

The first person to connect plays Blue, the second plays Red. Anyone after that only spectates.

## Controls

| Key | Action |
|---|---|
| Click your building, then a target | Send troops |
| `1` / `2` / `3` / `4` | Send 25% / 50% / 75% / 100% of troops |
| `Esc` | Cancel a selection |
| `R` | Restart after a game ends |

## Project structure

```
warlan/
├── server.js          # Authoritative game server (Node.js + WebSocket)
├── public/
│   ├── index.html      # Page shell
│   └── game.js          # Client rendering + input
├── package.json
└── start.bat            # One-click setup + launch (Windows)
```

## Built with

- [Node.js](https://nodejs.org) — server runtime
- [ws](https://github.com/websockets/ws) — WebSocket library
- HTML5 Canvas — client-side rendering, no frameworks

## Status

A personal project, still evolving — not affiliated with Poki or hg-studio.
