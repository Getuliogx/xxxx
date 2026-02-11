const tmi = require('tmi.js');
const WebSocket = require('ws');
const joinedChannels = new Set(); // Armazena canais joined para evitar duplicatas

/* WebSocket Server */
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  console.log('✅ Overlay conectada ao WebSocket');

  // Torna bidirecional: Recebe mensagens da overlay (ex: join)
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.action === 'join' && data.channel) {
        const chan = data.channel.toLowerCase();
        if (!joinedChannels.has(chan)) {
          client.join(chan).then(() => {
            joinedChannels.add(chan);
            console.log(`✅ Joined canal: ${chan}`);
          }).catch(err => console.error(`Erro ao join ${chan}:`, err));
        }
      }
    } catch (err) {
      console.error('Erro ao parsear mensagem do WS:', err);
    }
  });
});

// Ping para manter WS vivo
const interval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

/* Twitch Client */
const client = new tmi.Client({
  options: { debug: true },
  connection: {
    secure: true, // Adicionado para conexões seguras
    reconnect: true,
    maxReconnectAttempts: Infinity,
    reconnectInterval: 1000,
    maxReconnectInterval: 30000,
    reconnectDecay: 1.5
  },
  identity: {
    username: 'lc_another', // Certifique-se de que a conta está ativa
    password: 'oauth:o731um0ljm4od6av2hp0ohoa1t8v32' // Cole o novo token aqui
  },
  channels: [icarolinaporto] // Joins dinâmicos
});

client.connect().catch(console.error);

client.on('disconnected', (reason) => {
  console.log(`❌ Disconnected da Twitch: ${reason}. Reconectando automaticamente...`);
});

client.on('reconnect', () => {
  console.log('🔄 Reconectando à Twitch...');
  // Re-join todos os canais ao reconectar
  joinedChannels.forEach(chan => {
    client.join(chan).catch(err => console.error(`Erro re-join ${chan}:`, err));
  });
});

client.on('message', (channel, tags, message, self) => {
  if (self) return;
  console.log(`Mensagem no ${channel} de ${tags.username}: ${message}`);
  console.log('Badges:', tags.badges);
  const isMod = tags.mod || tags.badges?.broadcaster === '1';
  if (!isMod) return;
  console.log('✅ É mod/streamer! Enviando broadcast.');
  broadcast({ user: tags['display-name'], message });
});

console.log('Servidor rodando na porta 8080');
