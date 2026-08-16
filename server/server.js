require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Message = require('./models/Message');
const User = require('./models/User');

const app = express();
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5174',
    methods: ['GET', 'POST']
  }
});

// socket.id -> username
const users = {};

// username -> socket.id
const sockets = {};

// conversationId -> messages


io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // =========================
  // LOGIN
  // =========================
  // =========================
// REGISTER
// =========================
socket.on('register', async ({ username, password }) => {
  try {
    const existingUser = await User.findOne({ username });

    if (existingUser) {
      socket.emit('register_result', {
        success: false,
        message: 'Username already exists'
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      username,
      password: hashedPassword
    });

    socket.emit('register_result', {
      success: true,
      message: 'Account created successfully'
    });

    console.log(username + ' registered');
  } catch (error) {
    console.error('Registration error:', error);

    socket.emit('register_result', {
      success: false,
      message: 'Registration failed'
    });
  }
});

// =========================
// LOGIN
// =========================
socket.on('login', async ({ username, password }) => {
  try {
    const user = await User.findOne({ username });

    if (!user) {
      socket.emit('login_result', {
        success: false,
        message: 'Username or password is incorrect'
      });
      return;
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      socket.emit('login_result', {
        success: false,
        message: 'Username or password is incorrect'
      });
      return;
    }
    // Remove any previous login on this socket
const previousUsername = users[socket.id];

if (previousUsername) {
  delete sockets[previousUsername];
  delete users[socket.id];
}

    users[socket.id] = username;
    sockets[username] = socket.id;

    console.log(username + ' logged in');

    socket.emit('login_result', {
      success: true,
      username
    });

    io.emit('users_list', Object.values(users));
  } catch (error) {
    console.error('Login error:', error);

    socket.emit('login_result', {
      success: false,
      message: 'Login failed'
    });
  }
});
// =========================
// LOGOUT
// =========================
socket.on('logout', () => {
  const username = users[socket.id];

  if (!username) {
    return;
  }

  delete users[socket.id];
  delete sockets[username];

  console.log(username + ' logged out');

  io.emit('users_list', Object.values(users));
});

  // =========================
  // PRIVATE MESSAGE
  // =========================
socket.on('private_message', async ({ to, from, message }) => {
  const targetSocket = sockets[to];

  const msg = {
    from,
    to,
    message,
    time: new Date()
  };

  try {
    // Save message to MongoDB
    const savedMessage = await Message.create(msg);

    // Send saved message to recipient
    if (targetSocket) {
      io.to(targetSocket).emit(
        'receive_private_message',
        savedMessage
      );
    }

    // Send saved message back to sender
    socket.emit(
      'receive_private_message',
      savedMessage
    );

    console.log(
      `${from} -> ${to}: ${message}`
    );
  } catch (error) {
    console.error('Error saving message:', error);
  }
});

  // =========================
  // GET CONVERSATION HISTORY
  // =========================
  socket.on(
  'get_conversation',
  async ({ user1, user2 }) => {
    try {
      const messages = await Message.find({
        $or: [
          {
            from: user1,
            to: user2
          },
          {
            from: user2,
            to: user1
          }
        ]
      }).sort({ time: 1 });

      socket.emit(
        'conversation_history',
        messages
      );
    } catch (error) {
      console.error(
        'Error fetching conversation:',
        error
      );
    }
  }
);

  // =========================
  // DISCONNECT
  // =========================
  socket.on('disconnect', () => {
    const username = users[socket.id];

    if (username) {
      delete users[socket.id];
      delete sockets[username];

      console.log(username + ' disconnected');

      // Update everyone else's online users
      io.emit('users_list', Object.values(users));
    }
  });
});

// =========================
// START SERVER
// =========================
server.listen(5001, () => {
  console.log('Server running on port 5001');
});