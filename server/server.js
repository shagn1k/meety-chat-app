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
app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ============================================================
// IN-MEMORY ONLINE STATE
// onlineUsers: Map<socketId, { userId, username, field, status: 'free'|'busy', chatPartner: socketId|null }>
// socketsByUsername: Map<username, socketId>
// ============================================================
const onlineUsers = new Map();
const socketsByUsername = new Map();

function broadcastOnlineUsers() {
  const list = Array.from(onlineUsers.values()).map((u) => ({
    userId: u.userId,
    username: u.username,
    field: u.field,
    status: u.status
  }));
  io.emit('online_users', list);
}

function releaseChat(socketIdA, socketIdB, reason) {
  const userA = onlineUsers.get(socketIdA);
  const userB = onlineUsers.get(socketIdB);

  if (userA) {
    userA.status = 'free';
    userA.chatPartner = null;
  }
  if (userB) {
    userB.status = 'free';
    userB.chatPartner = null;
  }

  if (socketIdA && io.sockets.sockets.get(socketIdA)) {
    io.to(socketIdA).emit('chat_ended', { reason });
  }
  if (socketIdB && io.sockets.sockets.get(socketIdB)) {
    io.to(socketIdB).emit('chat_ended', { reason });
  }

  broadcastOnlineUsers();
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

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

      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        socket.emit('login_result', {
          success: false,
          message: 'Username or password is incorrect'
        });
        return;
      }

      // Clean up previous session for this username if any
      const prevSocketId = socketsByUsername.get(username);
      if (prevSocketId && prevSocketId !== socket.id) {
        const prevUser = onlineUsers.get(prevSocketId);
        if (prevUser && prevUser.chatPartner) {
          releaseChat(prevSocketId, prevUser.chatPartner, 'User reconnected from another session');
        }
        onlineUsers.delete(prevSocketId);
        socketsByUsername.delete(username);
      }

      // Register in memory
      onlineUsers.set(socket.id, {
        userId: user._id.toString(),
        username: user.username,
        field: user.field || '',
        status: 'free',
        chatPartner: null
      });
      socketsByUsername.set(username, socket.id);

      console.log(username + ' logged in');

      socket.emit('login_result', {
        success: true,
        username: user.username,
        field: user.field || ''
      });

      broadcastOnlineUsers();
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
    const userData = onlineUsers.get(socket.id);

    if (!userData) return;

    if (userData.chatPartner) {
      releaseChat(socket.id, userData.chatPartner, 'Your chat partner logged out');
    }

    onlineUsers.delete(socket.id);
    socketsByUsername.delete(userData.username);

    console.log(userData.username + ' logged out');

    broadcastOnlineUsers();
  });

  // =========================
  // SET FIELD
  // =========================
  socket.on('set_field', async ({ username, field }) => {
    try {
      const trimmedField = (field || '').trim();
      if (!trimmedField) return;

      await User.findOneAndUpdate({ username }, { field: trimmedField });

      const userData = onlineUsers.get(socket.id);
      if (userData) {
        userData.field = trimmedField;
      }

      socket.emit('field_saved', { field: trimmedField });
      broadcastOnlineUsers();

      console.log(username + ' set field: ' + trimmedField);
    } catch (error) {
      console.error('Set field error:', error);
    }
  });

  // =========================
  // REFRESH ONLINE USERS
  // =========================
  socket.on('refresh_online_users', () => {
    const list = Array.from(onlineUsers.values()).map((u) => ({
      userId: u.userId,
      username: u.username,
      field: u.field,
      status: u.status
    }));
    socket.emit('online_users', list);
  });

  // =========================
  // REQUEST CHAT
  // =========================
  socket.on('request_chat', ({ fromUsername, toUsername }) => {
    const senderData = onlineUsers.get(socket.id);
    const targetSocketId = socketsByUsername.get(toUsername);
    const targetData = targetSocketId ? onlineUsers.get(targetSocketId) : null;

    // Validate both users are free and online
    if (!senderData || senderData.status !== 'free') {
      socket.emit('chat_request_failed', { reason: 'You are already in a chat' });
      return;
    }

    if (!targetData || targetData.status !== 'free') {
      socket.emit('chat_request_failed', {
        reason: targetData
          ? `${toUsername} is currently busy`
          : `${toUsername} is no longer online`
      });
      return;
    }

    // Mark sender as pending (still free but waiting)
    senderData.pendingRequestTo = targetSocketId;
    targetData.pendingRequestFrom = socket.id;

    // Notify the target
    io.to(targetSocketId).emit('chat_request_received', {
      fromUsername: senderData.username,
      fromField: senderData.field,
      fromSocketId: socket.id
    });

    // Notify sender that request was sent
    socket.emit('chat_request_sent', { toUsername });

    console.log(`${fromUsername} requested chat with ${toUsername}`);
  });

  // =========================
  // ACCEPT CHAT
  // =========================
  socket.on('accept_chat', ({ fromSocketId }) => {
    const acceptorData = onlineUsers.get(socket.id);
    const requesterData = onlineUsers.get(fromSocketId);

    if (!acceptorData || !requesterData) {
      socket.emit('chat_request_failed', { reason: 'User no longer available' });
      return;
    }

    // Atomic check: both must still be free
    if (acceptorData.status !== 'free' || requesterData.status !== 'free') {
      socket.emit('chat_request_failed', { reason: 'Chat no longer available' });
      return;
    }

    // Mark both as busy
    acceptorData.status = 'busy';
    acceptorData.chatPartner = fromSocketId;
    acceptorData.pendingRequestFrom = null;

    requesterData.status = 'busy';
    requesterData.chatPartner = socket.id;
    requesterData.pendingRequestTo = null;

    // Notify both
    io.to(fromSocketId).emit('chat_accepted', {
      withUsername: acceptorData.username,
      withField: acceptorData.field,
      withSocketId: socket.id
    });

    socket.emit('chat_accepted', {
      withUsername: requesterData.username,
      withField: requesterData.field,
      withSocketId: fromSocketId
    });

    broadcastOnlineUsers();

    console.log(`${requesterData.username} <-> ${acceptorData.username} chat started`);
  });

  // =========================
  // REJECT CHAT
  // =========================
  socket.on('reject_chat', ({ fromSocketId }) => {
    const rejectorData = onlineUsers.get(socket.id);
    const requesterData = onlineUsers.get(fromSocketId);

    if (rejectorData) {
      rejectorData.pendingRequestFrom = null;
    }
    if (requesterData) {
      requesterData.pendingRequestTo = null;
    }

    if (fromSocketId && io.sockets.sockets.get(fromSocketId)) {
      io.to(fromSocketId).emit('chat_rejected', {
        byUsername: rejectorData ? rejectorData.username : 'Unknown'
      });
    }

    console.log(`Chat request rejected`);
  });

  // =========================
  // END CHAT
  // =========================
  socket.on('end_chat', () => {
    const userData = onlineUsers.get(socket.id);
    if (!userData || !userData.chatPartner) return;

    const partnerSocketId = userData.chatPartner;
    releaseChat(socket.id, partnerSocketId, 'Chat ended by participant');

    console.log(`${userData.username} ended the chat`);
  });

  // =========================
  // PRIVATE MESSAGE
  // =========================
  socket.on('private_message', async ({ to, from, message }) => {
    const senderData = onlineUsers.get(socket.id);
    const targetSocketId = socketsByUsername.get(to);
    const targetData = targetSocketId ? onlineUsers.get(targetSocketId) : null;

    // Only allow messaging between active chat partners
    if (
      !senderData ||
      senderData.status !== 'busy' ||
      senderData.chatPartner !== targetSocketId
    ) {
      return;
    }

    const msg = {
      from,
      to,
      message,
      time: new Date()
    };

    try {
      const savedMessage = await Message.create(msg);

      // Send to recipient only
      if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
        io.to(targetSocketId).emit('receive_private_message', savedMessage);
      }

      // Echo back to sender
      socket.emit('receive_private_message', savedMessage);

      console.log(`${from} -> ${to}: ${message}`);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  // =========================
  // GET CONVERSATION HISTORY
  // =========================
  socket.on('get_conversation', async ({ user1, user2 }) => {
    try {
      const messages = await Message.find({
        $or: [
          { from: user1, to: user2 },
          { from: user2, to: user1 }
        ]
      }).sort({ time: 1 });

      socket.emit('conversation_history', messages);
    } catch (error) {
      console.error('Error fetching conversation:', error);
    }
  });

  // =========================
  // WHITEBOARD DRAW
  // =========================
  socket.on('whiteboard_draw', (data) => {
    const userData = onlineUsers.get(socket.id);
    if (!userData || !userData.chatPartner) return;

    const partnerSocketId = userData.chatPartner;
    if (io.sockets.sockets.get(partnerSocketId)) {
      io.to(partnerSocketId).emit('whiteboard_draw', data);
    }
  });

  // =========================
  // WHITEBOARD CLEAR
  // =========================
  socket.on('whiteboard_clear', () => {
    const userData = onlineUsers.get(socket.id);
    if (!userData || !userData.chatPartner) return;

    const partnerSocketId = userData.chatPartner;
    if (io.sockets.sockets.get(partnerSocketId)) {
      io.to(partnerSocketId).emit('whiteboard_clear');
    }
  });

  // =========================
  // DISCONNECT
  // =========================
  socket.on('disconnect', () => {
    const userData = onlineUsers.get(socket.id);

    if (userData) {
      console.log(userData.username + ' disconnected');

      if (userData.chatPartner) {
        const partnerSocketId = userData.chatPartner;
        const partnerData = onlineUsers.get(partnerSocketId);

        if (partnerData) {
          partnerData.status = 'free';
          partnerData.chatPartner = null;
        }

        if (partnerSocketId && io.sockets.sockets.get(partnerSocketId)) {
          io.to(partnerSocketId).emit('chat_ended', {
            reason: 'Your chat partner disconnected'
          });
        }
      }

      onlineUsers.delete(socket.id);
      socketsByUsername.delete(userData.username);

      broadcastOnlineUsers();
    }
  });
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 5273;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});