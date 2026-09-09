import { io } from 'socket.io-client';

const socket = io('http://localhost:5273', {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000
});

export default socket;
