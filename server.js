const http = require('http');
const { WebSocketServer } = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('TikTok Live Bridge dang hoat dong!');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let uniqueId = (url.searchParams.get('uniqueId') || url.searchParams.get('id') || '').replace(/^@+/, '');
  let tiktokConn = null;

  const startTikTok = (id) => {
    if (!id) return;
    if (tiktokConn) {
      try {
        tiktokConn.disconnect();
      } catch (e) {}
    }

    tiktokConn = new WebcastPushConnection(id, { processInitialData: false });

    tiktokConn.connect()
      .then(() => {
        ws.send(JSON.stringify({ type: 'join', user: `@${id}` }));
      })
      .catch((err) => {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      });

    tiktokConn.on('gift', (data) => {
      if (data.giftType === 1 && !data.repeatEnd) return;
      const count = data.repeatCount || 1;
      const totalCoins = (data.diamondCount || 1) * count;
      ws.send(JSON.stringify({
        type: 'gift',
        user: data.nickname || data.uniqueId || 'Khán giả',
        giftName: data.giftName || 'Quà TikTok',
        coins: totalCoins
      }));
    });

    tiktokConn.on('chat', (data) => {
      ws.send(JSON.stringify({
        type: 'comment',
        user: data.nickname || data.uniqueId || 'Khán giả',
        comment: data.comment || ''
      }));
    });
  };

  if (uniqueId) startTikTok(uniqueId);

  ws.on('message', (msg) => {
    try {
      const payload = JSON.parse(msg.toString());
      if (payload.uniqueId) {
        startTikTok(String(payload.uniqueId).replace(/^@+/, ''));
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    if (tiktokConn) {
      try {
        tiktokConn.disconnect();
      } catch (e) {}
    }
  });
});

server.listen(PORT, () => {
  console.log(`Bridge running on ${PORT}`);
});
