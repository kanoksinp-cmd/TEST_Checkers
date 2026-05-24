const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// ตั้งค่า CORS ให้ยืดหยุ่นเพื่อให้รองรับการเชื่อมต่อแบบ WebSocket บน Render
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const path = require('path');

// เสิร์ฟไฟล์โฟลเดอร์สาธารณะ (ถ้ามีไฟล์ CSS/JS แยก)
app.use(express.static(path.join(__dirname, 'public')));

// เมื่อเรียกหน้าแรก ให้ส่งไฟล์ index.html ออกไป
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// เก็บข้อมูลผู้เล่นที่ออนไลน์อยู่
let onlinePlayers = {};

io.on('connection', (socket) => {
    console.log(`🔌 มีผู้เล่นเชื่อมต่อ: ${socket.id}`);

    // ลงทะเบียนชื่อผู้เล่น
    socket.on('registerPlayer', (username) => {
        socket.username = username;
        onlinePlayers[username] = socket.id;
        console.log(`👤 ผู้เล่น [${username}] ลงทะเบียนสำเร็จ`);
        sendOnlineUsers();
    });

    // ส่งคำท้าไปหาผู้เล่นคนอื่น
    socket.on('challengePlayer', (data) => {
        const targetSocketId = onlinePlayers[data.target];
        if (targetSocketId) {
            io.to(targetSocketId).emit('incomingChallenge', {
                challenger: data.challenger,
                challengerColor: data.challengerColor
            });
        }
    });

    // กดยอมรับคำท้าดวล
    socket.on('acceptChallenge', (data) => {
        const targetSocketId = onlinePlayers[data.target];
        if (targetSocketId) {
            io.to(targetSocketId).emit('challengeAccepted', {
                responder: data.responder,
                responderColor: data.responderColor
            });
        }
    });

    // ส่งข้อมูลการขยับหมากเรียลไทม์
    socket.on('movePiece', (data) => {
        const targetSocketId = onlinePlayers[data.target];
        if (targetSocketId) {
            io.to(targetSocketId).emit('pieceMoved', data);
        }
    });

    // เมื่อผู้เล่นออกจากการเชื่อมต่อ
    socket.on('disconnect', () => {
        console.log(`❌ ผู้เล่นขาดการเชื่อมต่อ: ${socket.id}`);
        if (socket.username) {
            delete onlinePlayers[socket.username];
        }
        sendOnlineUsers();
    });
});

// ฟังก์ชันส่งรายชื่อผู้เล่นที่ออนไลน์อัปเดตไปให้ทุกคน
function sendOnlineUsers() {
    const usersList = Object.keys(onlinePlayers).map(name => ({ username: name }));
    io.emit('online-users', usersList);
    io.emit('updatePlayers', usersList);
}

// 🛠 [แก้ไขหัวใจสำคัญ] เปลี่ยนพอร์ตให้ดึงจาก Render (Environment Variable)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 เซิร์ฟเวอร์หมากฮอสทำงานสำเร็จบนพอร์ต: ${PORT}`);
});
