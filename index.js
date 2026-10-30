const mineflayer = require('mineflayer');
const express = require('express');

// ---------- CONFIG (set these as Environment Variables on Render) ----------
const HOST = process.env.MC_HOST || 'yourserver.aternos.me';
const PORT = parseInt(process.env.MC_PORT || '25565', 10);
const VERSION = process.env.MC_VERSION || false; // e.g. "1.20.4" or leave empty to auto-detect
const RECONNECT_DELAY = parseInt(process.env.RECONNECT_DELAY || '30000', 10); // ms

const BOTS = [
  { username: process.env.ADMIN_NAME || 'AdminBot', role: 'admin', joinDelay: 0 },
  { username: process.env.PLAYER_NAME || 'PlayerBot', role: 'player', joinDelay: 8000 },
];
// --------------------------------------------------------------------------

const status = {}; // used by the web page so you can see what's going on

function log(name, msg) {
  console.log(`[${new Date().toISOString()}] [${name}] ${msg}`);
}

function startAntiAfk(bot, name) {
  const actions = [
    () => bot.setControlState('jump', true),
    () => bot.setControlState('sneak', true),
    () => bot.setControlState('forward', true),
    () => bot.setControlState('back', true),
  ];

  const interval = setInterval(() => {
    if (!bot.entity) return;

    // look in a random direction
    const yaw = Math.random() * Math.PI * 2;
    const pitch = (Math.random() - 0.5) * 0.8;
    bot.look(yaw, pitch, false).catch(() => {});

    // do a random small action for a moment
    bot.clearControlStates();
    actions[Math.floor(Math.random() * actions.length)]();
    setTimeout(() => {
      try { bot.clearControlStates(); } catch (_) {}
    }, 600);
  }, 20000);

  bot.once('end', () => clearInterval(interval));
}

function createBot(cfg) {
  const { username, role } = cfg;
  status[username] = { role, state: 'connecting' };
  log(username, `Connecting to ${HOST}:${PORT} ...`);

  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username,
    version: VERSION || undefined,
    auth: 'offline', // Aternos cracked / offline-mode server
    hideErrors: true,
  });

  bot.once('spawn', () => {
    status[username].state = 'online';
    log(username, 'Spawned in the world.');
    startAntiAfk(bot, username);

    if (role === 'admin') {
      // Only works if you /op this bot in the Aternos console.
      setTimeout(() => {
        bot.chat('/gamemode creative');
      }, 3000);
    }
  });

  bot.on('message', (jsonMsg) => {
    // Uncomment to see server chat in the Render logs:
    // log(username, jsonMsg.toString());
  });

  bot.on('kicked', (reason) => {
    let text = reason;
    try { text = JSON.stringify(reason); } catch (_) {}
    log(username, `Kicked: ${text}`);
  });

  bot.on('error', (err) => {
    log(username, `Error: ${err.message}`);
  });

  bot.once('end', (reason) => {
    status[username].state = 'offline';
    log(username, `Disconnected (${reason}). Reconnecting in ${RECONNECT_DELAY / 1000}s...`);
    setTimeout(() => createBot(cfg), RECONNECT_DELAY);
  });

  return bot;
}

// Start each bot with a delay so they don't join at the exact same moment
BOTS.forEach((cfg) => {
  setTimeout(() => createBot(cfg), cfg.joinDelay);
});

// ---------- Tiny web server so Render + uptime bot can keep this alive ----------
const app = express();

app.get('/', (req, res) => {
  res.json({ server: `${HOST}:${PORT}`, bots: status, time: new Date().toISOString() });
});

app.get('/health', (req, res) => res.send('OK'));

const WEB_PORT = process.env.PORT || 3000; // Render provides PORT automatically
app.listen(WEB_PORT, () => console.log(`Web server listening on port ${WEB_PORT}`));

// Don't let a random crash kill the whole process
process.on('uncaughtException', (err) => console.log('Uncaught exception:', err.message));
process.on('unhandledRejection', (err) => console.log('Unhandled rejection:', err && err.message));
