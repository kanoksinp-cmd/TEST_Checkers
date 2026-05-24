const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// เสิร์ฟไฟล์จากโฟลเดอร์ปัจจุบัน (ที่เก็บ index.html ไว้)
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('a user connected');
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
