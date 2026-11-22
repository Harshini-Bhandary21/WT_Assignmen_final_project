require('dotenv').config();
const http = require('http');
const express = require('express');
const realtime = require('./realtime');
const cors = require('cors');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Route imports
const authRoutes = require('./routes/authRoutes');
const challengeRoutes = require('./routes/challengeRoutes');
const taskRoutes = require('./routes/taskRoutes');
const habitRoutes = require('./routes/habitRoutes');
const vocabularyRoutes = require('./routes/vocabularyRoutes');
const grammarRoutes = require('./routes/grammarRoutes');
const progressRoutes = require('./routes/progressRoutes');
const achievementRoutes = require('./routes/achievementRoutes');
const thoughtRoutes = require('./routes/thoughtRoutes');
const extraRoutes = require('./routes/extraRoutes');

const app = express();

// Connect to Database
connectDB();

// Ensure the demo account exists (creates only this one user if missing)
require('mongoose').connection.once('open', async () => {
  const User = require('./models/User');
  const bcrypt = require('bcryptjs');
  if (!(await User.exists({ email: 'demo@levelup.app' }))) {
    await User.create({
      name: 'Alex Mercer', email: 'demo@levelup.app',
      password: await bcrypt.hash('LevelUp@2026', 10),
      totalPoints: 450, level: 'Explorer', currentStreak: 7, longestStreak: 14
    });
    console.log('[Demo] Created demo@levelup.app');
  }
});

// Core Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Realtime: after any successful write, push a 'sync' to the user's open tabs
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && !/payments\/create-order|\/coach/.test(req.originalUrl)) res.on('finish', () => res.statusCode < 400 && req.user && realtime.notify(req.user._id));
  next();
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'LevelUp Backend API',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/vocabulary', vocabularyRoutes);
app.use('/api/grammar', grammarRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/thoughts', thoughtRoutes);
app.use('/api', extraRoutes);

// Production: serve the built React app from the same service
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  const dist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(dist));
  app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
realtime.init(server);
server.listen(PORT, () => {
  console.log(`[LevelUp Server] Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = { app, server };
