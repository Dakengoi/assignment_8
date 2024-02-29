const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// PostgreSQL database connection configuration
const pool = new Pool({
    user: "postgres",
    host: "127.0.0.1",
    database: "messenger",
    password: "asdfghjkl;'",
    port: 5432,
});
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/social-media.html");
  });
// Socket.IO event handling
io.on('connection', (socket) => {
  console.log('New client connected');

  // Handle new messages
  socket.on('newMessage', async (data) => {
    try {
      // Insert message into the database
      const { userId, message } = data;
      await pool.query('INSERT INTO messages (user_id, message) VALUES ($1, $2)', [userId, message]);
      
      // Broadcast the new message to all connected clients
      io.emit('newMessage', data);
    } catch (error) {
      console.error('Error inserting message into the database:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
