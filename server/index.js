import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'mrdev-secret-123';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Server is running');
});

// Database setup
let db;

// Socket.io Room Logic
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, playerName }) => {
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { players: [] });
    }
    
    const room = rooms.get(roomId);
    const playerNum = room.players.length + 1;
    
    if (playerNum > 2) {
      socket.emit('room-full');
      return;
    }

    const playerData = { id: socket.id, name: playerName, num: playerNum };
    room.players.push(playerData);
    
    socket.emit('player-assigned', playerNum);
    io.to(roomId).emit('room-update', room.players);
    
    console.log(`Player ${playerName} joined room ${roomId} as P${playerNum}`);
  });

  socket.on('player-update', ({ roomId, playerNum, x, y, boosted }) => {
    socket.to(roomId).emit('opponent-update', { playerNum, x, y, boosted });
  });

  socket.on('player-die', ({ roomId, playerNum }) => {
    io.to(roomId).emit('opponent-die', playerNum);
  });

  socket.on('player-win', ({ roomId, playerNum, playerName }) => {
    io.to(roomId).emit('game-over', { winnerNum: playerNum, winnerName: playerName });
  });

  socket.on('disconnect', () => {
    rooms.forEach((room, roomId) => {
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        io.to(roomId).emit('room-update', room.players);
        if (room.players.length === 0) rooms.delete(roomId);
      }
    });
    console.log('User disconnected:', socket.id);
  });
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// API Endpoints
app.post('/api/auth/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

  try {
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) return res.status(400).json({ error: 'Username taken' });

    const hash = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
    
    const token = jwt.sign({ id: result.lastID, username }, JWT_SECRET);
    res.json({ token, username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(400).json({ error: 'User not found' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(400).json({ error: 'Wrong password' });

    const token = jwt.sign({ id: user.id, username }, JWT_SECRET);
    res.json({ token, username, progress: JSON.parse(user.progress_json || '{}') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/progress', authenticateToken, async (req, res) => {
  const user = await db.get('SELECT progress_json FROM users WHERE id = ?', [req.user.id]);
  res.json(JSON.parse(user.progress_json || '{}'));
});

app.post('/api/progress', authenticateToken, async (req, res) => {
  const { progress } = req.body;
  await db.run('UPDATE users SET progress_json = ? WHERE id = ?', [JSON.stringify(progress), req.user.id]);
  res.json({ success: true });
});

app.get('/api/levels', async (req, res) => {
  if (!db) return res.status(503).send('Database not ready');
  const levels = await db.all('SELECT * FROM levels');
  res.json(levels);
});

app.post('/api/scores', async (req, res) => {
  if (!db) return res.status(503).send('Database not ready');
  const { level_id, player_name, time_ms } = req.body;
  if (!level_id || !player_name || !time_ms) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  await db.run(
    'INSERT INTO scores (level_id, player_name, time_ms) VALUES (?, ?, ?)',
    [level_id, player_name, time_ms]
  );
  res.json({ success: true });
});

app.get('/api/leaderboard/:levelId', async (req, res) => {
  if (!db) return res.status(503).send('Database not ready');
  const { levelId } = req.params;
  const scores = await db.all(
    'SELECT player_name, time_ms, created_at FROM scores WHERE level_id = ? ORDER BY time_ms ASC LIMIT 10',
    [levelId]
  );
  res.json(scores);
});

(async () => {
  db = await open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      progress_json TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      config TEXT
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level_id INTEGER,
      player_name TEXT,
      time_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed initial levels if empty
  const levelsCount = await db.get('SELECT COUNT(*) as count FROM levels');
  if (levelsCount.count === 0) {
    const initialLevels = [
      { 
        name: 'Introduction', 
        config: JSON.stringify({ 
          gravity: 0.5, 
          speed: 5, 
          jump: -10,
          platforms: [
            { x: 0, y: 400, width: 800, height: 50 },
            { x: 200, y: 300, width: 100, height: 20 }
          ],
          traps: [],
          exit: { x: 750, y: 340, width: 40, height: 60 }
        }) 
      },
      { 
        name: 'The Floor is Lies', 
        config: JSON.stringify({ 
          gravity: 0.5, 
          speed: 5, 
          jump: -10,
          platforms: [
            { x: 0, y: 400, width: 300, height: 50 },
            { x: 500, y: 400, width: 300, height: 50 }
          ],
          traps: [
            { 
              x: 300, y: 400, width: 200, height: 50, 
              color: '#475569', // Looks like a platform
              active: true,
              visible: true
            }
          ],
          exit: { x: 750, y: 340, width: 40, height: 60 }
        }) 
      },
      { 
        name: 'The Runner', 
        config: JSON.stringify({ 
          gravity: 0.5, 
          speed: 5, 
          jump: -10,
          platforms: [
            { x: 0, y: 400, width: 800, height: 50 },
          ],
          traps: [
            { 
              x: 400, y: 400, width: 20, height: 20, 
              color: '#ef4444', 
              active: true,
              visible: true,
              trigger: { x: 300, y: 0, width: 100, height: 400 },
              onTrigger: (t) => { t.y -= 5; } // Fake trap
            }
          ],
          exit: { 
            x: 700, y: 340, width: 40, height: 60,
            type: 'troll'
          }
        }) 
      }
    ];
    for (const level of initialLevels) {
      await db.run('INSERT INTO levels (name, config) VALUES (?, ?)', [level.name, level.config]);
    }
  }

  console.log('Database initialized.');

  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
})().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
