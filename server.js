const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// เก็บข้อมูลผู้เล่นออนไลน์ { socketId: { username, targetRoom, role } }
let onlinePlayers = {};

io.on('connection', (socket) => {
    console.log(`🔌 Connected: ${socket.id}`);

    socket.on('registerPlayer', (username) => {
        if (!username) return;
        onlinePlayers[socket.id] = {
            username: username,
            targetRoom: null,
            role: null
        };
        console.log(`👤 ผู้เล่น [${username}] ลงทะเบียนแล้ว`);
        broadcastOnlineUsers();
    });

    socket.on('challengePlayer', (data) => {
        const targetSocketId = findSocketIdByUsername(data.target);
        if (targetSocketId) {
            if (onlinePlayers[socket.id]) {
                onlinePlayers[socket.id].role = data.challengerColor; 
            }
            // ส่งคำท้าไปให้คู่แข่งปลายทาง
            io.to(targetSocketId).emit('incomingChallenge', {
                challenger: data.challenger,
                challengerColor: data.challengerColor // 'red' หรือ 'green'
            });
        }
    });

    socket.on('acceptChallenge', (data) => {
        const challengerSocketId = findSocketIdByUsername(data.target);
        if (challengerSocketId) {
            const responderColor = data.responderColor;
            
            if (onlinePlayers[socket.id]) {
                onlinePlayers[socket.id].role = responderColor;
                onlinePlayers[socket.id].targetRoom = challengerSocketId;
            }
            if (onlinePlayers[challengerSocketId]) {
                onlinePlayers[challengerSocketId].targetRoom = socket.id;
            }

            // แจ้งผู้ท้าชิงว่าตกลงรับคำท้าแล้ว
            io.to(challengerSocketId).emit('challengeAccepted', {
                responder: data.responder,
                responderColor: responderColor
            });
        }
    });

    socket.on('movePiece', (data) => {
        const targetSocketId = findSocketIdByUsername(data.target);
        if (targetSocketId) {
            io.to(targetSocketId).emit('pieceMoved', {
                sR: data.sR,
                sC: data.sC,
                eR: data.eR,
                eC: data.eC,
                result: data.result
            });
        }
    });

    socket.on('disconnect', () => {
        if (onlinePlayers[socket.id]) {
            const targetRoomId = onlinePlayers[socket.id].targetRoom;
            if (targetRoomId && onlinePlayers[targetRoomId]) {
                io.to(targetRoomId).emit('opponentDisconnected', {
                    message: "🚨 คู่แข่งของคุณขาดการเชื่อมต่อจากเซิร์ฟเวอร์"
                });
                onlinePlayers[targetRoomId].targetRoom = null;
                onlinePlayers[targetRoomId].role = null;
            }
            delete onlinePlayers[socket.id];
        }
        broadcastOnlineUsers();
    });
});

function broadcastOnlineUsers() {
    const usersList = Object.keys(onlinePlayers).map(id => ({
        username: onlinePlayers[id].username
    }));
    io.emit('updatePlayers', usersList);
    io.emit('online-users', usersList);
}

function findSocketIdByUsername(username) {
    for (const id in onlinePlayers) {
        if (onlinePlayers[id].username === username) return id;
    }
    return null;
}

http.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
