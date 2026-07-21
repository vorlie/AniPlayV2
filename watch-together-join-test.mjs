import { WebSocket } from 'ws';
import fetch from 'node-fetch';

const endpoint = 'https://watch-together.vorlie.pl';

async function main() {
  const createResp = await fetch(${endpoint}/v1/rooms, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: { provider: 'test', showId: '1', animeName: 'Test', episode: '1', translationType: 'sub' },
      playback: { position: 0, paused: true, revision: 0 },
      participant: { name: 'Host', avatar: null, hostToken: 'host-token' }
    }),
  });

  console.log('create status', createResp.status);
  const createData = await createResp.json();
  console.log('create data', createData);
  if (!createResp.ok) return;
  const code = createData.code;
  const wsUrl = new URL(${endpoint.replace(/\/$/, '')}/v1/rooms//ws);
  wsUrl.protocol = 'wss:';
  console.log('ws url', wsUrl.toString());

  const host = new WebSocket(wsUrl.toString());
  host.on('open', () => {
    console.log('host open');
    host.send(JSON.stringify({ type: 'hello', version: 1, participant: { name: 'Host', avatar: null }, hostToken: 'host-token', role: 'host' }));
  });
  host.on('message', (data) => console.log('host msg', data.toString()));
  host.on('close', (code, reason) => console.log('host close', code, reason.toString()));
  host.on('error', (err) => console.error('host err', err.message));

  await new Promise((resolve) => host.once('open', resolve));

  const guest = new WebSocket(wsUrl.toString());
  guest.on('open', () => {
    console.log('guest open');
    guest.send(JSON.stringify({ type: 'hello', version: 1, participant: { name: 'Guest', avatar: null }, role: 'guest' }));
  });
  guest.on('message', (data) => console.log('guest msg', data.toString()));
  guest.on('close', (code, reason) => console.log('guest close', code, reason.toString()));
  guest.on('error', (err) => console.error('guest err', err.message));

  await new Promise((resolve) => guest.once('open', resolve));

  setTimeout(() => {
    console.log('done');
    host.close();
    guest.close();
    resolve();
  }, 5000);
}

await main();
