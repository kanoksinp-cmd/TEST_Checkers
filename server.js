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

// ให้บริการไฟล์ Static จากโฟลเดอร์ปัจจุบัน
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// เก็บข้อมูลผู้เล่นที่ออนไลน์: { socketId: { username, targetRoom, role } }
let onlinePlayers = {};

io.on('connection', (socket) => {
    console.log(`🔌 มีผู้ใช้งานเชื่อมต่อเข้ามา: ${socket.id}`);

    // 1. ลงทะเบียนผู้เล่นเข้าสู่ระบบออนไลน์
    socket.on('registerPlayer', (username) => {
        if (!username) return;
        
        // บันทึกชื่อและรีเซ็ตสถานะห้อง/สี
        onlinePlayers[socket.id] = {
            username: username,
            targetRoom: null,
            role: null
        };
        console.log(`👤 ผู้เล่น [${username}] ลงทะเบียนเรียบร้อย (ID: ${socket.id})`);
        
        // ส่งรายชื่ออัปเดตกลับไปให้ผู้เล่นทุกคนบนเซิร์ฟเวอร์
        broadcastOnlineUsers();
    });

    // 2. เมื่อผู้เล่นส่งคำท้าดวล (Challenge)
    socket.on('challengePlayer', (data) => {
        // ค้นหา Socket ID ของคู่แข่งจากชื่อ username
        const targetSocketId = findSocketIdByUsername(data.target);
        
        if (targetSocketId) {
            // บันทึกสีที่ระบบสุ่มให้ฝั่งผู้ท้าชิงเก็บไว้ชั่วคราว
            if (onlinePlayers[socket.id]) {
                onlinePlayers[socket.id].role = data.challengerColor; 
            }

            // ส่ง Event ไปยังเป้าหมายเพื่อให้แสดงผลหน้าต่างตอบรับ (Confirm Modal)
            io.to(targetSocketId).emit('incomingChallenge', {
                challenger: data.challenger,
                challengerColor: data.challengerColor // 'red' หรือ 'green'
            });
            console.log(`⚔️ [${data.challenger}] ส่งคำท้าหา [${data.target}] สุ่มฝั่งเป็น: ${data.challengerColor}`);
        }
    });

    // 3. เมื่อผู้รับคำท้ากดตอบรับคำท้า (Accept Challenge)
    socket.on('acceptChallenge', (data) => {
        const challengerSocketId = findSocketIdByUsername(data.target);
        
        if (challengerSocketId) {
            const responderColor = data.responderColor; // ฝั่งสีที่เหลืออยู่ตรงข้ามกับผู้ท้าชิง
            
            // อัปเดตสถานะของผู้รับคำท้าบนเซิร์ฟเวอร์
            if (onlinePlayers[socket.id]) {
                onlinePlayers[socket.id].role = responderColor;
                onlinePlayers[socket.id].targetRoom = challengerSocketId;
            }
            
            // อัปเดตห้องอ้างอิงให้ฝั่งผู้ท้าชิงด้วย
            if (onlinePlayers[challengerSocketId]) {
                onlinePlayers[challengerSocketId].targetRoom = socket.id;
            }

            // ส่งสัญญาณแจ้งฝั่งผู้ท้าชิงว่าเริ่มเกมได้ และยืนยันข้อมูลฝั่งผู้รับ
            io.to(challengerSocketId).emit('challengeAccepted', {
                responder: data.responder,
                responderColor: responderColor
            });
            
            console.log(`🎉 [${data.responder}] ยอมรับคำท้าจากห้องจับคู่สำเร็จ ได้เล่นฝั่ง: ${responderColor}`);
        }
    });

    // 4. บรอดแคสต์ตำแหน่งการเดินหมากแบบ Real-time
    socket.on('movePiece', (data) => {
        const targetSocketId = findSocketIdByUsername(data.target);
        if (targetSocketId) {
            // ส่งต่อข้อมูลพิกัดการเดินและผลลัพธ์การกินหมากไปยังคู่แข่งในคู่นั้นทันที
            io.to(targetSocketId).emit('pieceMoved', {
                sR: data.sR,
                sC: data.sC,
                eR: data.eR,
                eC: data.eC,
                result: data.result
            });
        }
    });

    // 5. จัดการเมื่อผู้เล่นตัดการเชื่อมต่อ
    socket.on('disconnect', () => {
        if (onlinePlayers[socket.id]) {
            console.log(`❌ ผู้เล่น [${onlinePlayers[socket.id].username}] ออกจากระบบ`);
            
            // แจ้งเตือนคู่แข่งที่กำลังประลองอยู่ (ถ้ามี)
            const targetRoomId = onlinePlayers[socket.id].targetRoom;
            if (targetRoomId && onlinePlayers[targetRoomId]) {
                io.to(targetRoomId).emit('opponentDisconnected', {
                    message: "🚨 คู่แข่งของคุณขาดการเชื่อมต่อจากเซิร์ฟเวอร์"
                });
                // รีเซ็ตคู่แข่งให้อยู่ในสถานะว่าง
                onlinePlayers[targetRoomId].targetRoom = null;
                onlinePlayers[targetRoomId].role = null;
            }

            delete onlinePlayers[socket.id];
        }
        broadcastOnlineUsers();
    });
});

// ฟังก์ชันภายใน: ส่งรายชื่อผู้เล่นที่ออนไลน์ทั้งหมดกลับไปยังหน้าจอ Client
function broadcastOnlineUsers() {
    const usersList = Object.keys(onlinePlayers).map(id => ({
        username: onlinePlayers[id].username
    }));
    io.emit('updatePlayers', usersList);
    io.emit('online-users', usersList);
}

// ฟังก์ชันภายใน: ค้นหา ID ของ Socket จากชื่อผู้ใช้งาน
function findSocketIdByUsername(username) {
    for (const id in onlinePlayers) {
        if (onlinePlayers[id].username === username) {
            return id;
        }
    }
    return null;
}

http.listen(PORT, () => {
    console.log(`🚀 เซิร์ฟเวอร์หมากฮอสไทย 3D ทำงานที่พอร์ต: http://localhost:${PORT}`);
});
