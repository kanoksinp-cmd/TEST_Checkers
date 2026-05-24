const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// แก้ไขตรงนี้: ชี้ไปที่โฟลเดอร์ /src ที่คุณเก็บ index.html ไว้
app.use(express.static(path.join(__dirname, 'src')));

io.on('connection', (socket) => {
    console.log('a user connected');
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
