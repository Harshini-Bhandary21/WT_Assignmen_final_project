const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

let io;
const board = async () =>
  User.find().sort({ totalPoints: -1 }).limit(10).select('name totalPoints level currentStreak isPremium').lean();

const init = (server) => {
  io = new Server(server, { cors: { origin: '*' } });
  io.use((s, next) => {
    try {
      s.userId = jwt.verify(s.handshake.auth.token, process.env.JWT_SECRET || 'levelup_jwt_secret_dev_key_change_in_production').id;
      next();
    } catch { next(new Error('unauthorized')); }
  });
  io.on('connection', async (s) => {
    s.join(`u:${s.userId}`);
    io.emit('presence', io.engine.clientsCount);
    s.emit('leaderboard', await board());
    s.on('disconnect', () => io.emit('presence', io.engine.clientsCount));
  });
};

// Tell the user's open tabs to refetch, and refresh everyone's leaderboard
const notify = async (userId, event = 'sync') => {
  if (!io) return;
  io.to(`u:${userId}`).emit(event, { at: Date.now() });
  io.emit('leaderboard', await board());
};

module.exports = { init, notify };
