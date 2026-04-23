import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Server is running');
});

// Database setup
let db;

// API Endpoints
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

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
})().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
