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
      console.log('Mensagem recebida da overlay:', data); // Debug: mostra o que a overlay enviou
      if (data.action === 'join' && data.channel) {
        const chan = data.channel.toLowerCase();
        if (!joinedChannels.has(chan)) {
          console.log(`Tentando join no canal: ${chan}`); // Debug: antes do join
          client.join(chan).then(() => {
            joinedChannels.add(chan);
            console.log(`✅ Joined canal: ${chan}`);
          }).catch(err => console.error(`Erro ao join ${chan}:`, err));
        } else {
          console.log(`Canal ${chan} já joined. Ignorando.`); // Debug: duplicata
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
  console.log('Preparando broadcast:', data); // Debug: antes de enviar
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
      console.log('Broadcast enviado para cliente'); // Debug: confirma envio
    } else {
      console.log('Cliente não aberto - ignorando'); // Debug: cliente desconectado
    }
  });
}

/* Twitch Client */
const client = new tmi.Client({
  options: { debug: true },
  connection: {
    secure: true,
    reconnect: true,
    maxReconnectAttempts: Infinity,
    reconnectInterval: 1000,
    maxReconnectInterval: 30000,
    reconnectDecay: 1.5
  },
  identity: {
    username: 'xyzgx',
    password: 'o731um0ljm4od6av2hp0ohoa1t8v32' // Novo token
  },
  channels: ['icarolinaporto'] // Fixo pra join auto
});

client.connect().catch(console.error);

client.on('disconnected', (reason) => {
  console.log(`❌ Disconnected da Twitch: ${reason}. Reconectando automaticamente...`);
});

client.on('reconnect', () => {
  console.log('🔄 Reconectando à Twitch...');
  joinedChannels.forEach(chan => {
    client.join(chan).catch(err => console.error(`Erro re-join ${chan}:`, err));
  });
});

client.on('message', (channel, tags, message, self) => {
  if (self) return;
  console.log(`Mensagem no ${channel} de ${tags.username}: ${message}`); // Debug: mensagem recebida
  console.log('Badges:', tags.badges); // Debug: badges
  const isMod = tags.mod || tags.badges?.broadcaster === '1';
  if (!isMod) {
    console.log('Ignorando - não é mod/streamer'); // Debug: restrição
    return;
  }
  console.log('✅ É mod/streamer! Enviando broadcast.');
  broadcast({ user: tags['display-name'], message });
});

console.log('Servidor rodando na porta 8080');
