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
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
      console.log('Broadcast enviado:', data); // Debug: confirma envio
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
    username: 'xyzgx', // Certifique-se de que a conta está ativa
    password: 'oauth:itx0xlse3oyv9op04ha8xpadi3yfua' // Cole o novo token aqui
  },
  channels: ['icarolinaporto'] // Corrigi: aspas no nome do canal
});

client.connect().then(() => {
  console.log('✅ Conectado à Twitch com sucesso!'); // Debug: confirma conexão inicial
}).catch(err => {
  console.error('Erro ao conectar à Twitch:', err); // Debug: erro na conexão
});

client.on('disconnected', (reason) => {
  console.log(`❌ Disconnected da Twitch: ${reason}. Reconectando automaticamente...`);
});

client.on('reconnect', () => {
  console.log('🔄 Reconectando à Twitch...');
  // Re-join todos os canais ao reconectar
  joinedChannels.forEach(chan => {
    console.log(`Tentando re-join no canal: ${chan}`); // Debug: re-join
    client.join(chan).catch(err => console.error(`Erro re-join ${chan}:`, err));
  });
});

client.on('message', (channel, tags, message, self) => {
  if (self) return;
  console.log(`Mensagem no ${channel} de ${tags.username}: ${message}`);
  console.log('Badges:', tags.badges);
  const isMod = tags.mod || tags.badges?.broadcaster === '1';
  if (!isMod) {
    console.log('Ignorando mensagem - não é mod/streamer'); // Debug: restrição
    return;
  }
  console.log('✅ É mod/streamer! Enviando broadcast.');
  broadcast({ user: tags['display-name'], message });
});

console.log('Servidor rodando na porta 8080');
