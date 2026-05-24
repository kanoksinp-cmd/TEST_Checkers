const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ส่งไฟล์สแตติก (HTML, CSS, JS) จากโฟลเดอร์ 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Fallback ส่งไฟล์ index.html สำหรับคำขออื่น ๆ ทั้งหมด
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Map สำหรับติดตามผู้เล่นที่ออนไลน์: socketId -> username
const activePlayers = new Map();

// ฟังก์ชันช่วยค้นหา Socket ID จากชื่อผู้เล่น
function getSocketIdByUsername(username) {
  for (const [id, name] of activePlayers.entries()) {
    if (name.toLowerCase() === username.toLowerCase()) {
      return id;
    }
  }
  return null;
}

// ฟังก์ชันประกาศรายชื่อผู้เล่นออนไลน์ทั้งหมดให้ทุกคนทราบ
function broadcastOnlinePlayers() {
  const playersList = [];
  activePlayers.forEach((username) => {
    playersList.push({ username });
  });

  // ส่งเหตุการณ์ไปยัง Client ทุกคนเพื่ออัปเดตรายชื่อ
  io.emit('online-users', playersList);
  io.emit('updatePlayers', playersList);
  console.log(`[Server] Current online players:`, playersList.map(p => p.username));
}

io.on('connection', (socket) => {
  console.log(`[Server] Socket connected: ${socket.id}`);

  // 1. ลงทะเบียนชื่อผู้เล่น
  socket.on('registerPlayer', (username) => {
    if (!username) return;
    
    // ตรวจสอบกรณีชื่อซ้ำซ้อน
    const existingSocketId = getSocketIdByUsername(username);
    if (existingSocketId && existingSocketId !== socket.id) {
      console.log(`[Server] Username collision: '${username}' already registered. Overwriting with new connection.`);
      activePlayers.delete(existingSocketId);
    }

    activePlayers.set(socket.id, username);
    console.log(`[Server] Registered: '${username}' for socket ${socket.id}`);
    
    // ประกาศรายชื่อใหม่
    broadcastOnlinePlayers();
  });

  // 2. ส่งคำท้าผู้เล่นคนอื่น
  socket.on('challengePlayer', (data) => {
    const { target, challenger, challengerColor } = data;
    console.log(`[Server] Challenge: '${challenger}' challenged '${target}' as color: ${challengerColor}`);
    
    const targetSocketId = getSocketIdByUsername(target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('incomingChallenge', {
        challenger,
        challengerColor
      });
    } else {
      console.log(`[Server] Challenge target '${target}' not found online.`);
      socket.emit('playerOffline', { username: target });
    }
  });

  // 3. ตอบรับคำท้าดวล
  socket.on('acceptChallenge', (data) => {
    const { target, responder, responderColor } = data;
    console.log(`[Server] Challenge Accepted: '${responder}' accepted challenge from '${target}' as color: ${responderColor}`);
    
    const targetSocketId = getSocketIdByUsername(target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('challengeAccepted', {
        responder,
        responderColor
      });
    }
  });

  // 4. ส่งผ่านข้อมูลการเดินหมากระหว่างคู่ต่อสู้
  socket.on('movePiece', (data) => {
    const { target, sR, sC, eR, eC, result } = data;
    
    const targetSocketId = getSocketIdByUsername(target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('pieceMoved', {
        sR, sC, eR, eC, result
      });
      console.log(`[Server] Move relayed from ${activePlayers.get(socket.id)} to ${target}: (${sR},${sC}) -> (${eR},${eC})`);
    } else {
      console.log(`[Server] Failed to relay move: Opponent '${target}' is offline.`);
    }
  });

  // 5. จัดการเมื่อผู้เล่นหลุดหรือตัดการเชื่อมต่อ
  socket.on('disconnect', () => {
    const username = activePlayers.get(socket.id);
    if (username) {
      console.log(`[Server] Socket disconnected: ${socket.id} (username: '${username}')`);
      activePlayers.delete(socket.id);
      
      // แจ้งให้ผู้เล่นอื่นทราบว่าผู้เล่นนี้ออฟไลน์แล้ว
      io.emit('playerDisconnected', { username });
      broadcastOnlinePlayers();
    } else {
      console.log(`[Server] Unregistered socket disconnected: ${socket.id}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Server] Thai Checkers 3D Server running on http://localhost:${PORT}`);
});
