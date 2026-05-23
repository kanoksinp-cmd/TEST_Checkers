const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors({ origin: "*" }));
// ดึงไฟล์ index.html อัตโนมัติเมื่อเปิดพอร์ต 3000
app.use(express.static(path.join(__dirname, './')));

const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*", methods: ["GET", "POST"] } });

let onlineUsers = {}; 

io.on('connection', (socket) => {
    socket.on('registerPlayer', (username) => {
        if (!username) return;
        onlineUsers[socket.id] = username;
        sendUpdatedUserList();
    });

    socket.on('challengePlayer', (data) => {
        const targetId = Object.keys(onlineUsers).find(k => onlineUsers[k] === data.target);
        if (targetId) io.to(targetId).emit('incomingChallenge', { challenger: data.challenger });
    });

    socket.on('acceptChallenge', (data) => {
        const targetId = Object.keys(onlineUsers).find(k => onlineUsers[k] === data.target);
        if (targetId) io.to(targetId).emit('challengeAccepted', { responder: data.responder });
    });

    socket.on('movePiece', (data) => {
        const targetId = Object.keys(onlineUsers).find(k => onlineUsers[k] === data.target);
        if (targetId) io.to(targetId).emit('pieceMoved', data);
    });

    socket.on('disconnect', () => {
        if (onlineUsers[socket.id]) { delete onlineUsers[socket.id]; sendUpdatedUserList(); }
    });
});

function sendUpdatedUserList() {
    const list = Object.values(onlineUsers).map(name => ({ username: name }));
    io.emit('online-users', list);
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 เซิร์ฟเวอร์หมากฮอสแบบไฟล์เดี่ยว รันที่ลิงก์นี้ครับพี่: http://localhost:${PORT}`);
});
