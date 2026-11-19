const http = require('http');
const { WebSocketServer } = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('TikTok Bridge is running');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  let uniqueId = '';
  try {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    uniqueId = (reqUrl.searchParams.get('uniqueId') || '').replace(/^@/, '').trim();
  } catch (e) {
    uniqueId = '';
  }

  if (!uniqueId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Thiếu ID TikTok Live (uniqueId)' }));
    ws.close();
    return;
  }

  ws.send(JSON.stringify({ type: 'status', message: `Đang kết nối tới @${uniqueId}...` }));

  const tiktokConnection = new WebcastPushConnection(uniqueId, {
    enableExtendedGiftInfo: true,
    processInitialGifts: false
  });

  tiktokConnection
    .connect()
    .then((state) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'connected',
          roomId: state.roomId || '',
          message: `Đã kết nối LIVE @${uniqueId}`
        }));
      }
    })
    .catch((err) => {
      if (ws.readyState === ws.OPEN) {
        const msg = err && err.message ? err.message : String(err);
        ws.send(JSON.stringify({
          type: 'error',
          message: `Không vào được phòng @${uniqueId}: ${msg}`
        }));
      }
    });

  tiktokConnection.on('chat', (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'chat',
        nickname: data.nickname || data.uniqueId || 'Khán giả',
        comment: data.comment || ''
      }));
    }
  });

  tiktokConnection.on('gift', (data) => {
    if (ws.readyState === ws.OPEN) {
      const repeatCount = Number(data.repeatCount) || 1;
      const diamondCount = Number(data.diamondCount) || 1;
      const isStreakEnding = data.giftType === 1 ? Boolean(data.repeatEnd) : true;

      if (isStreakEnding) {
        ws.send(JSON.stringify({
          type: 'gift',
          nickname: data.nickname || data.uniqueId || 'Khán giả',
          giftName: data.giftName || 'Quà tặng',
          repeatCount,
          coins: diamondCount * repeatCount
        }));
      }
    }
  });

  tiktokConnection.on('streamEnd', () => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        message: `Phiên LIVE của @${uniqueId} đã kết thúc.`
      }));
    }
  });

  tiktokConnection.on('error', (err) => {
    if (ws.readyState === ws.OPEN) {
      const msg = err && err.message ? err.message : String(err);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Lỗi kết nối TikTok (@${uniqueId}): ${msg}`
      }));
    }
  });

  const cleanup = () => {
    try {
      tiktokConnection.disconnect();
    } catch (e) {}
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

server.listen(PORT, () => {
  console.log(`Bridge running on ${PORT}`);
});
