// Test de fumée : démarre le backend CONSTRUIT (dist/server.js) avec des variables factices,
// puis vérifie robots.txt, le refus de l'admin sans mot de passe et la création d'un salon par socket.io.
// Usage : npm run build && node scripts/smoke.mjs   (aucune dépendance : fetch et WebSocket natifs de Node 22)
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = process.env.SMOKE_PORT || '5055';
const base = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['dist/server.js'], {
  env: {
    ...process.env,
    PORT,
    NODE_ENV: 'production',
    FRONTEND_URL: 'http://localhost:8080',
    ADMIN_PASSWORD: 'mot-de-passe-factice-de-ci', // scan:ok valeur factice de test
    SPOTIFY_CLIENT_ID: 'factice',
    SPOTIFY_CLIENT_SECRET: 'factice',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const stop = () => server.kill();
const timer = setTimeout(() => { console.error('ÉCHEC : délai de 30 s dépassé'); stop(); process.exit(1); }, 30_000);

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`le serveur s'est arrêté (code ${server.exitCode})`);
    try { return await fetch(`${base}/robots.txt`); } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error('le serveur ne répond pas');
}

/** Crée un salon via le protocole engine.io v4 / socket.io sur WebSocket ; rend l'événement room_joined. */
function createRoom() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/socket.io/?EIO=4&transport=websocket`);
    ws.onerror = () => reject(new Error('connexion WebSocket impossible'));
    ws.onmessage = ({ data }) => {
      const msg = String(data);
      if (msg.startsWith('0')) ws.send('40');
      else if (msg === '2') ws.send('3');
      else if (msg.startsWith('44')) reject(new Error(`connexion socket.io refusée : ${msg}`));
      else if (msg.startsWith('40')) ws.send('42' + JSON.stringify(['create_room', { roomName: 'Fumée', playerName: 'CI' }]));
      else if (msg.startsWith('42')) {
        const [name, payload] = JSON.parse(msg.slice(2));
        if (name === 'room_error') reject(new Error(`room_error : ${payload?.message}`));
        if (name === 'room_joined') { ws.close(); resolve(payload); }
      }
    };
  });
}

try {
  const robots = await waitReady();
  assert.equal(robots.status, 200, 'GET /robots.txt');
  console.log('OK  /robots.txt -> 200');

  const admin = await fetch(`${base}/admin/rooms`);
  assert.equal(admin.status, 401, 'GET /admin/rooms sans mot de passe');
  console.log('OK  /admin/rooms sans mot de passe -> 401');

  const room = await createRoom();
  assert.ok(room.code && room.isHost, `room_joined inattendu : ${JSON.stringify(room)}`);
  console.log(`OK  socket.io create_room -> salon ${room.code}`);
} catch (err) {
  console.error('ÉCHEC :', err.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  stop();
}
