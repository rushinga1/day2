<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import GameCanvas from './components/GameCanvas.vue';
import SplashScreen from './components/SplashScreen.vue';
import AuthOverlay from './components/AuthOverlay.vue';
import { generateLevel, getAllLevelMeta, WORLDS } from './engine/LevelGenerator.js';
import { Trophy, Play, RefreshCw, Skull, Home, ChevronRight, Lock, Star, Moon, Sun, User as UserIcon, LogOut, Cloud } from 'lucide-vue-next';
import confetti from 'canvas-confetti';

const API_URL = import.meta.env.VITE_API_URL || 'https://mrdevgame-server-gnwr.onrender.com';

// ── State ─────────────────────────────────────────────────────────────────────
const showSplash  = ref(true);
const screen      = ref('worlds');   // worlds | levels | stages | playing | won
const playerName  = ref(localStorage.getItem('mrdev_name') || 'Player 1');
const userToken   = ref(localStorage.getItem('mrdev_token') || null);
const showAuth    = ref(false);

const selectedWorld   = ref(null);
const selectedLevel   = ref(null);
const selectedStage   = ref(null);
const currentLevelObj = ref(null);
const multiplayer     = ref(false);   // local 2P
const isNetworkGame   = ref(false);   // online 2P
const roomId          = ref('');
const winnerNum       = ref(null);    // 1 or 2

// Progress: key = "W-L-S", value = best time in ms
const progress = ref(JSON.parse(localStorage.getItem('mrdev_progress') || '{}'));

const startTime   = ref(null);
const p1Deaths    = ref(0);
const p2Deaths    = ref(0);
const apiOnline   = ref(false);

const isLightMode = ref(localStorage.getItem('mrdev_theme') === 'light');

// ── Authentication ────────────────────────────────────────────────────────────
function handleAuthSuccess(data) {
  userToken.value = data.token;
  playerName.value = data.username;
  localStorage.setItem('mrdev_token', data.token);
  localStorage.setItem('mrdev_name', data.username);
  
  if (data.progress) {
    // Merge server progress with local progress (keep best times)
    Object.keys(data.progress).forEach(key => {
      if (!progress.value[key] || data.progress[key] < progress.value[key]) {
        progress.value[key] = data.progress[key];
      }
    });
    localStorage.setItem('mrdev_progress', JSON.stringify(progress.value));
  }
  
  showAuth.value = false;
  syncProgressToServer();
}

function handleLogout() {
  userToken.value = null;
  localStorage.removeItem('mrdev_token');
  // Optional: keep playerName or clear it
}

async function syncProgressToServer() {
  if (!userToken.value) return;
  try {
    await axios.post(`${API_URL}/api/progress`, { progress: progress.value }, {
      headers: { Authorization: `Bearer ${userToken.value}` }
    });
  } catch (err) { console.error('Sync failed', err); }
}

// ── Theme ─────────────────────────────────────────────────────────────────────
watch(isLightMode, (val) => {
  if (val) document.body.classList.add('light-theme');
  else document.body.classList.remove('light-theme');
}, { immediate: true });

function toggleTheme() {
  isLightMode.value = !isLightMode.value;
  localStorage.setItem('mrdev_theme', isLightMode.value ? 'light' : 'dark');
}

// ── Computed ──────────────────────────────────────────────────────────────────
const worldLevels = computed(() => {
  if (!selectedWorld.value) return [];
  return Array.from({ length: 10 }, (_, i) => {
    const l = i + 1;
    const stagesCleared = Array.from({ length: 10 }, (_, j) => {
      return progress.value[`${selectedWorld.value.id}-${l}-${j + 1}`] !== undefined;
    }).filter(Boolean).length;
    return { level: l, stagesCleared, unlocked: l === 1 || isLevelUnlocked(selectedWorld.value.id, l) };
  });
});

const stagesForLevel = computed(() => {
  if (!selectedWorld.value || !selectedLevel.value) return [];
  return Array.from({ length: 10 }, (_, i) => {
    const s = i + 1;
    const key = `${selectedWorld.value.id}-${selectedLevel.value}-${s}`;
    const best = progress.value[key];
    const unlocked = s === 1 || progress.value[`${selectedWorld.value.id}-${selectedLevel.value}-${s - 1}`] !== undefined;
    return { stage: s, best, unlocked, cleared: best !== undefined };
  });
});

const totalCleared = computed(() => Object.keys(progress.value).length);
const totalStages  = computed(() => 1000);

function isLevelUnlocked(worldId, level) {
  if (level <= 1) return true;
  return stagesCleared(worldId, level - 1) > 0;
}

function stagesCleared(worldId, level) {
  return Array.from({ length: 10 }, (_, j) => {
    return progress.value[`${worldId}-${level}-${j + 1}`] !== undefined;
  }).filter(Boolean).length;
}

function worldProgress(worldId) {
  const total = 100;
  const cleared = Object.keys(progress.value)
    .filter(k => k.startsWith(`${worldId}-`)).length;
  return Math.round((cleared / total) * 100);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function selectWorld(world) {
  selectedWorld.value = world;
  screen.value = 'levels';
}

function selectLevel(meta) {
  if (!meta.unlocked) return;
  selectedLevel.value = meta.level;
  screen.value = 'stages';
}

function selectStage(meta) {
  if (!meta.unlocked) return;
  selectedStage.value = meta.stage;
  currentLevelObj.value = generateLevel(selectedWorld.value.id, selectedLevel.value, meta.stage);
  screen.value = 'playing';
  startTime.value = Date.now();
  p1Deaths.value = 0;
  p2Deaths.value = 0;
  winnerNum.value = null;
}

function startOnlineGame(rid) {
  if (!rid) return;
  roomId.value = rid;
  isNetworkGame.value = true;
  multiplayer.value = false; // Disable local 2P
  
  // Start at world 1, level 1, stage 1 for simplicity or let host choose
  selectedWorld.value = WORLDS[0];
  selectedLevel.value = 1;
  selectedStage.value = 1;
  currentLevelObj.value = generateLevel(1, 1, 1);
  screen.value = 'playing';
}

function onRoomFull() {
  alert('Room is full!');
  goHome();
}

function goHome() { screen.value = 'worlds'; }
function goWorlds() { screen.value = 'worlds'; }
function goLevels() { screen.value = 'levels'; }
function goStages() { screen.value = 'stages'; }

// ── Game events ───────────────────────────────────────────────────────────────
function onDie(playerNum) {
  if (playerNum === 2) p2Deaths.value++;
  else p1Deaths.value++;
}

async function onWin(playerNum) {
  const duration = Date.now() - (startTime.value ?? Date.now());
  winnerNum.value = playerNum ?? 1;
  screen.value = 'won';
  const key = `${selectedWorld.value.id}-${selectedLevel.value}-${selectedStage.value}`;

  if (!progress.value[key] || duration < progress.value[key]) {
    progress.value[key] = duration;
    localStorage.setItem('mrdev_progress', JSON.stringify(progress.value));
    syncProgressToServer(); // Sync immediately on win
  }

  confetti({
    particleCount: 200, spread: 90, origin: { y: 0.6 },
    colors: winnerNum.value === 1 ? ['#3b82f6','#60a5fa'] : ['#f97316','#fb923c']
  });

  try {
    await axios.post(`${API_URL}/api/scores`, {
      level_id:    `${selectedWorld.value.id}-${selectedLevel.value}`,
      player_name: multiplayer.value ? `P${winnerNum.value}: ${playerName.value}` : playerName.value,
      time_ms:     duration
    }, { timeout: 2000 });
  } catch { /* offline */ }
}

function playNext() {
  const nextStage = selectedStage.value + 1;
  const nextLevel = selectedLevel.value + 1;
  if (nextStage <= 10) {
    selectedStage.value = nextStage;
    currentLevelObj.value = generateLevel(selectedWorld.value.id, selectedLevel.value, nextStage);
  } else if (nextLevel <= 10) {
    selectedLevel.value = nextLevel;
    selectedStage.value = 1;
    currentLevelObj.value = generateLevel(selectedWorld.value.id, nextLevel, 1);
  } else {
    screen.value = 'worlds';
    return;
  }
  screen.value = 'playing';
  startTime.value = Date.now();
  p1Deaths.value = 0;
  p2Deaths.value = 0;
  winnerNum.value = null;
}

function retryStage() {
  if (!currentLevelObj.value) return;
  screen.value = 'playing';
  startTime.value = Date.now();
  p1Deaths.value = 0;
  p2Deaths.value = 0;
  winnerNum.value = null;
}

function savePlayerName() {
  localStorage.setItem('mrdev_name', playerName.value);
}

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    await axios.get(`${API_URL}/api/levels`, { timeout: 2000 });
    apiOnline.value = true;
    
    // If logged in, fetch cloud progress
    if (userToken.value) {
      const res = await axios.get(`${API_URL}/api/progress`, {
        headers: { Authorization: `Bearer ${userToken.value}` }
      });
      if (res.data) {
        Object.keys(res.data).forEach(key => {
          if (!progress.value[key] || res.data[key] < progress.value[key]) {
            progress.value[key] = res.data[key];
          }
        });
        localStorage.setItem('mrdev_progress', JSON.stringify(progress.value));
      }
    }
  } catch { apiOnline.value = false; }
});
</script>

<template>
  <div class="app">

    <!-- ── Splash Screen ─────────────────────────────────────────────── -->
    <Transition name="fade">
      <SplashScreen v-if="showSplash" @done="showSplash = false" />
    </Transition>

    <!-- ── Persistent Header ──────────────────────────────────────────────── -->
    <header class="topbar">
      <div class="topbar-left">
        <button v-if="screen !== 'worlds'" class="icon-btn" @click="goHome" title="Home">
          <Home :size="20" />
        </button>
        <h1 class="logo">Mr<span>dev</span>game</h1>
      </div>
      <div class="topbar-right">
        <div class="progress-pill">
          <Star :size="14" /> {{ totalCleared }} / {{ totalStages }}
        </div>
        
        <button v-if="!userToken" class="auth-btn" @click="showAuth = true">
          <UserIcon :size="16" /> <span>Sync</span>
        </button>
        <button v-else class="auth-btn logged-in" @click="handleLogout" title="Logout">
          <Cloud :size="16" class="cloud-icon" /> <span>{{ playerName }}</span>
        </button>

        <div v-if="!apiOnline" class="offline-dot" title="Backend offline — progress saved locally">⚫</div>
      </div>
    </header>

    <AuthOverlay 
      v-if="showAuth" 
      :api-url="API_URL" 
      @auth-success="handleAuthSuccess" 
      @close="showAuth = false" 
    />

    <!-- ── World Map ──────────────────────────────────────────────────────── -->
    <main v-if="screen === 'worlds'" class="screen">
      <div class="screen-header">
        <h2>Choose Your World</h2>
        <div class="name-input">
          <input v-model="playerName" @change="savePlayerName" type="text" placeholder="Your name" maxlength="20" />
        </div>
        
        <div class="main-toggles">
          <button
            class="mp-toggle"
            :class="{ active: multiplayer }"
            @click="multiplayer = !multiplayer"
          >
            {{ multiplayer ? '👥 2P Mode ON' : '🎮 1P Mode' }}
          </button>
          
          <button class="mp-toggle" @click="toggleTheme">
            {{ isLightMode ? '🌙 Dark Mode' : '☀️ Light Mode' }}
          </button>
        </div>

        <div class="online-rooms">
          <h3>🔗 Play with Friends</h3>
          <div class="room-actions">
            <input v-model="roomId" type="text" placeholder="Room ID" />
            <button @click="startOnlineGame(roomId)">Join Room</button>
            <button @click="startOnlineGame(Math.random().toString(36).substring(7))">Create New Room</button>
          </div>
        </div>
      </div>
      <div class="world-grid">
        <div
          v-for="world in WORLDS"
          :key="world.id"
          class="world-card"
          :style="{ '--accent': world.accentColor, '--bg': world.bgColor }"
          @click="selectWorld(world)"
        >
          <div class="world-emoji">{{ world.emoji }}</div>
          <div class="world-name">{{ world.name }}</div>
          <div class="world-meta">World {{ world.id }}</div>
          <div class="world-progress-bar">
            <div class="world-progress-fill" :style="{ width: worldProgress(world.id) + '%' }"></div>
          </div>
          <div class="world-progress-text">{{ worldProgress(world.id) }}% cleared</div>
        </div>
      </div>
    </main>

    <!-- ── Level Select ────────────────────────────────────────────────────── -->
    <main v-else-if="screen === 'levels'" class="screen">
      <div class="screen-header">
        <button class="back-btn" @click="goWorlds">← Worlds</button>
        <h2>{{ selectedWorld.emoji }} {{ selectedWorld.name }}</h2>
        <p class="sub">Select a level (10 stages each)</p>
      </div>
      <div class="level-grid">
        <div
          v-for="meta in worldLevels"
          :key="meta.level"
          class="level-card"
          :class="{ locked: !meta.unlocked, done: meta.stagesCleared === 10 }"
          :style="{ '--accent': selectedWorld.accentColor }"
          @click="selectLevel(meta)"
        >
          <div class="lc-number">{{ meta.level }}</div>
          <div class="lc-stars">
            <span v-for="i in 10" :key="i" :class="{ lit: i <= meta.stagesCleared }">★</span>
          </div>
          <div class="lc-lock" v-if="!meta.unlocked"><Lock :size="16" /></div>
        </div>
      </div>
    </main>

    <!-- ── Stage Select ────────────────────────────────────────────────────── -->
    <main v-else-if="screen === 'stages'" class="screen">
      <div class="screen-header">
        <button class="back-btn" @click="goLevels">← Levels</button>
        <h2>{{ selectedWorld.emoji }} Level {{ selectedLevel }}</h2>
        <p class="sub">Choose a stage</p>
      </div>
      <div class="stage-grid">
        <div
          v-for="meta in stagesForLevel"
          :key="meta.stage"
          class="stage-card"
          :class="{ locked: !meta.unlocked, cleared: meta.cleared }"
          :style="{ '--accent': selectedWorld.accentColor }"
          @click="selectStage(meta)"
        >
          <div class="sc-number">{{ meta.stage }}</div>
          <div class="sc-best" v-if="meta.best">{{ (meta.best / 1000).toFixed(1) }}s</div>
          <div class="sc-lock" v-else-if="!meta.unlocked"><Lock :size="14" /></div>
        </div>
      </div>
    </main>

    <!-- ── Game ───────────────────────────────────────────────────────────── -->
    <main v-else-if="screen === 'playing' && currentLevelObj" class="screen game-screen">
      <div class="game-hud">
        <div class="hud-left">
          <span class="p1-tag">P1</span>
          <Skull :size="14" />
          <span>{{ p1Deaths }}</span>
          <template v-if="multiplayer || isNetworkGame">
            &nbsp;|&nbsp;
            <span class="p2-tag">P2</span>
            <Skull :size="14" />
            <span>{{ p2Deaths }}</span>
          </template>
        </div>
        <div class="hud-center">
          {{ currentLevelObj.name }}
          <div v-if="isNetworkGame" class="room-id-badge">Room: {{ roomId }}</div>
        </div>
        <div class="hud-right">
          <span v-if="multiplayer" class="mp-badge">👥 Local 2P</span>
          <span v-if="isNetworkGame" class="mp-badge">🌐 Online</span>
          <button class="icon-btn" @click="goHome" title="Exit level">
            <RefreshCw :size="18" />
          </button>
        </div>
      </div>

      <GameCanvas
        :key="currentLevelObj.id + '-' + multiplayer + '-' + isNetworkGame"
        :level="currentLevelObj"
        :multiplayer="multiplayer"
        :isNetworkGame="isNetworkGame"
        :roomId="roomId"
        :playerName="playerName"
        @win="onWin"
        @die="onDie"
        @room-full="onRoomFull"
      />

      <p class="hint">A/D or ← → to move &nbsp;|&nbsp; W / Space / ↑ to jump &nbsp;|&nbsp; reach the glowing door!</p>
    </main>

    <!-- ── Win Screen ─────────────────────────────────────────────────────── -->
    <main v-else-if="screen === 'won' && currentLevelObj" class="screen win-screen">
      <div class="win-card">
        <div class="win-trophy"><Trophy :size="72" color="#f59e0b" /></div>

        <!-- Multiplayer winner banner -->
        <div v-if="multiplayer" class="winner-banner" :class="winnerNum === 1 ? 'p1-win' : 'p2-win'">
          {{ winnerNum === 1 ? '🔵 Player 1 Wins!' : '🟠 Player 2 Wins!' }}
        </div>

        <h2>Stage Clear! 🎉</h2>
        <p class="win-sub">{{ currentLevelObj.name }}</p>
        <div class="win-stats">
          <div class="stat-box" v-if="multiplayer">
            <div class="stat-label" style="color:#3b82f6">P1 Deaths</div>
            <div class="stat-value" style="color:#3b82f6">{{ p1Deaths }}</div>
          </div>
          <div class="stat-box" v-if="multiplayer">
            <div class="stat-label" style="color:#f97316">P2 Deaths</div>
            <div class="stat-value" style="color:#f97316">{{ p2Deaths }}</div>
          </div>
          <div class="stat-box" v-if="!multiplayer">
            <div class="stat-label">Deaths</div>
            <div class="stat-value" style="color:#ef4444">{{ p1Deaths }}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Total</div>
            <div class="stat-value" style="color:#10b981">{{ totalCleared }}/1000</div>
          </div>
        </div>
        <div class="win-actions">
          <button class="btn btn-ghost" @click="retryStage">Retry</button>
          <button class="btn btn-ghost" @click="goStages">Stages</button>
          <button class="btn btn-primary" @click="playNext">
            Next Stage <ChevronRight :size="18" />
          </button>
        </div>
      </div>
    </main>

  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #080c14;
  --surface:  #111827;
  --border:   rgba(255,255,255,0.07);
  --text:     #f1f5f9;
  --muted:    #64748b;
  --primary:  #3b82f6;
  --danger:   #ef4444;
  --success:  #10b981;
  --gold:     #f59e0b;
}

body.light-theme {
  --bg:       #f8fafc;
  --surface:  #ffffff;
  --border:   rgba(0,0,0,0.12);
  --text:     #0f172a;
  --primary:  #2563eb;
}

html, body {
  min-height: 100vh;
  font-family: 'Outfit', sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

/* ── Topbar ──────────────────────────────────────────────────────────────── */
.topbar {
  position: sticky; top: 0; z-index: 100;
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 24px;
  background: var(--bg);
  opacity: 0.95;
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
}
.topbar-left { display: flex; align-items: center; gap: 12px; }
.topbar-right { display: flex; align-items: center; gap: 12px; }

.logo {
  font-size: 1.5rem; font-weight: 800;
  letter-spacing: -1px; text-transform: uppercase;
}
.logo span { color: var(--primary); text-shadow: 0 0 16px rgba(59,130,246,.5); }

.progress-pill {
  display: flex; align-items: center; gap: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 6px 14px; border-radius: 999px;
  font-size: .85rem; font-weight: 600; color: var(--gold);
}
.offline-dot { font-size: 1.1rem; opacity: .5; cursor: help; }

.icon-btn {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text); border-radius: 10px;
  padding: 8px; display: flex;
  align-items: center; justify-content: center;
  cursor: pointer; transition: all .2s;
}
.icon-btn:hover { background: var(--bg); filter: brightness(0.9); }
body:not(.light-theme) .icon-btn:hover { filter: brightness(1.2); }

.auth-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 14px;
  border-radius: 999px;
  font-family: inherit;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.auth-btn:hover {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

.auth-btn.logged-in {
  border-color: var(--success);
  color: var(--success);
}

.auth-btn.logged-in:hover {
  background: rgba(16, 185, 129, 0.1);
}

.cloud-icon {
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

/* ── Screens ─────────────────────────────────────────────────────────────── */
.screen {
  max-width: 1100px; margin: 0 auto;
  padding: 32px 24px 64px;
}
.screen-header { text-align: center; margin-bottom: 36px; }
.screen-header h2 { font-size: 2rem; font-weight: 800; margin-bottom: 6px; }
.screen-header .sub { color: var(--muted); font-weight: 300; }
.back-btn {
  background: none; border: none; color: var(--muted);
  font-family: inherit; font-size: 1rem; cursor: pointer;
  margin-bottom: 10px; transition: color .2s;
}
.back-btn:hover { color: var(--text); }

/* ── Name input ──────────────────────────────────────────────────────────── */
.name-input { margin-top: 16px; display: inline-block; }
.name-input input {
  padding: 10px 18px; border-radius: 999px;
  background: var(--surface); border: 1px solid var(--border);
  color: var(--text); font-family: inherit; font-size: 1rem;
  text-align: center; transition: border-color .2s;
}
.name-input input:focus { outline: none; border-color: var(--primary); }

/* ── World grid ──────────────────────────────────────────────────────────── */
.world-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.world-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 28px 20px 20px;
  cursor: pointer;
  transition: transform .2s, box-shadow .2s;
  position: relative; overflow: hidden;
  text-align: center;
}
.world-card::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(circle at 50% 0%, var(--accent), transparent 70%);
  opacity: .12; pointer-events: none;
  transition: opacity .2s;
}
.world-card:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(0,0,0,.4); }
.world-card:hover::before { opacity: .22; }

.world-emoji { font-size: 2.8rem; margin-bottom: 8px; }
.world-name  { font-size: 1.05rem; font-weight: 700; margin-bottom: 2px; }
.world-meta  { font-size: .8rem; color: var(--muted); margin-bottom: 14px; }

.world-progress-bar {
  height: 5px; background: var(--border);
  border-radius: 999px; overflow: hidden; margin-bottom: 6px;
}
.world-progress-fill {
  height: 100%; background: var(--accent);
  border-radius: 999px; transition: width .4s;
}
.world-progress-text { font-size: .78rem; color: var(--muted); }

/* ── Level grid ──────────────────────────────────────────────────────────── */
.level-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 14px;
}
.level-card {
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: 16px; padding: 20px 12px;
  cursor: pointer; text-align: center;
  transition: all .2s; position: relative;
}
.level-card:hover:not(.locked) { border-color: var(--accent); transform: scale(1.04); }
.level-card.done { border-color: var(--gold); }
.level-card.locked { opacity: .35; cursor: not-allowed; }

.lc-number { font-size: 2rem; font-weight: 800; margin-bottom: 8px; }
.lc-stars span { font-size: .75rem; color: rgba(255,255,255,.2); }
.lc-stars span.lit { color: var(--gold); }
.lc-lock { position: absolute; top: 8px; right: 8px; color: var(--muted); }

/* ── Stage grid ──────────────────────────────────────────────────────────── */
.stage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}
.stage-card {
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: 14px; padding: 18px 10px;
  cursor: pointer; text-align: center;
  transition: all .2s; position: relative;
  min-height: 90px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
}
.stage-card:hover:not(.locked) { border-color: var(--accent); transform: scale(1.06); }
.stage-card.cleared { border-color: var(--success); }
.stage-card.locked { opacity: .3; cursor: not-allowed; }

.sc-number { font-size: 1.6rem; font-weight: 800; }
.sc-best { font-size: .75rem; color: var(--success); margin-top: 4px; font-weight: 600; }
.sc-lock { color: var(--muted); margin-top: 4px; }

/* ── Game screen ─────────────────────────────────────────────────────────── */
.game-screen { padding: 16px 16px 32px; max-width: 900px; }
.game-hud {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px; padding: 0 4px;
}
.hud-left { display: flex; align-items: center; gap: 8px; color: var(--danger); font-weight: 700; }
.hud-center { font-weight: 600; color: var(--muted); font-size: .9rem; }
.hint {
  margin-top: 10px; text-align: center;
  font-size: .82rem; color: var(--muted);
}

/* ── Win screen ──────────────────────────────────────────────────────────── */
.win-screen {
  display: flex; align-items: center; justify-content: center;
  min-height: calc(100vh - 70px);
}
.win-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 28px; padding: 48px 40px;
  max-width: 480px; width: 100%;
  text-align: center;
  box-shadow: 0 32px 64px rgba(0,0,0,.5);
}
.win-trophy { margin-bottom: 16px; animation: bounce 1s ease-in-out infinite alternate; }
@keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-12px); } }
.win-card h2 { font-size: 2rem; font-weight: 800; margin-bottom: 4px; }
.win-sub { color: var(--muted); margin-bottom: 28px; }

.win-stats { display: flex; gap: 16px; justify-content: center; margin-bottom: 32px; }
.stat-box {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px; padding: 16px 20px; flex: 1;
}
.stat-label { font-size: .78rem; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .5px; }
.stat-value { font-size: 1.6rem; font-weight: 800; }

.win-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn {
  flex: 1; padding: 13px 18px;
  border-radius: 12px; font-family: inherit;
  font-size: .95rem; font-weight: 700;
  cursor: pointer; border: none;
  transition: all .2s;
  display: inline-flex; align-items: center;
  justify-content: center; gap: 6px;
}
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { filter: brightness(1.12); transform: translateY(-2px); }
.btn-ghost {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}
.btn-ghost:hover { background: var(--bg); filter: brightness(0.9); }
body:not(.light-theme) .btn-ghost:hover { filter: brightness(1.2); }

/* ── App wrapper ─────────────────────────────────────────────────────────── */
.app { min-height: 100vh; }

/* ── Main Toggles ────────────────────────────────────────────────────────── */
.main-toggles {
  display: flex; gap: 12px; justify-content: center; margin-top: 20px; flex-wrap: wrap;
}
.mp-toggle {
  padding: 10px 22px;
  border-radius: 999px;
  border: 2px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-family: inherit; font-size: .95rem; font-weight: 700;
  cursor: pointer; transition: all .25s;
}
.mp-toggle:hover { filter: brightness(0.9); }
body:not(.light-theme) .mp-toggle:hover { filter: brightness(1.2); }
.mp-toggle.active {
  background: rgba(59,130,246,.18);
  border-color: var(--primary);
  color: var(--primary);
  box-shadow: 0 0 16px rgba(59,130,246,.3);
}

/* ── Player tags in HUD ──────────────────────────────────────────────────── */
.p1-tag {
  font-size: .75rem; font-weight: 800;
  background: #3b82f6; color: white;
  padding: 2px 7px; border-radius: 6px;
}
.p2-tag {
  font-size: .75rem; font-weight: 800;
  background: #f97316; color: white;
  padding: 2px 7px; border-radius: 6px;
}
.mp-badge {
  font-size: .78rem; font-weight: 700;
  background: rgba(59,130,246,.2);
  border: 1px solid rgba(59,130,246,.4);
  color: #93c5fd;
  padding: 4px 10px; border-radius: 8px;
}
.hud-right { display: flex; align-items: center; gap: 10px; }

/* ── Winner banner ───────────────────────────────────────────────────────── */
.winner-banner {
  font-size: 1.5rem; font-weight: 800;
  padding: 14px 28px; border-radius: 14px;
  margin-bottom: 16px;
  animation: pulse 1s ease-in-out infinite alternate;
}
@keyframes pulse {
  from { transform: scale(1);    opacity: .95; }
  to   { transform: scale(1.04); opacity: 1;   }
}
.p1-win {
  background: rgba(59,130,246,.2);
  border: 2px solid rgba(59,130,246,.5);
  color: #93c5fd;
}
.p2-win {
  background: rgba(249,115,22,.2);
  border: 2px solid rgba(249,115,22,.5);
  color: #fdba74;
}

/* ── Online Rooms ────────────────────────────────────────────────────────── */
.online-rooms {
  margin-top: 24px;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  text-align: center;
}
.online-rooms h3 {
  font-size: 1.2rem;
  margin-bottom: 16px;
}
.room-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.room-actions input {
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-family: inherit;
}
.room-actions button {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: white;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.2s;
}
.room-actions button:hover {
  filter: brightness(1.1);
}
.room-id-badge {
  font-size: 0.75rem;
  background: rgba(255,255,255,0.1);
  padding: 2px 8px;
  border-radius: 12px;
  margin-top: 4px;
  display: inline-block;
}

/* ── Controls hint ───────────────────────────────────────────────────────── */
.controls-row {
  display: flex; justify-content: center; gap: 32px;
  flex-wrap: wrap; margin-top: 10px;
}
.ctrl-group {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px; padding: 8px 16px;
  font-size: .8rem; color: var(--muted);
  display: flex; align-items: center; gap: 8px;
}
.ctrl-group strong { color: var(--text); }

/* ── Splash transition ──────────────────────────────────────────────────── */
.fade-leave-active { transition: opacity 0.6s ease, transform 0.6s ease; }
.fade-leave-to     { opacity: 0; transform: scale(1.04); }

/* ── Mobile Responsiveness ──────────────────────────────────────────────── */
@media (max-width: 768px) {
  .topbar {
    padding: 10px 16px;
  }
  
  .logo { font-size: 1.2rem; }
  .auth-btn span { display: none; }
  .auth-btn { padding: 8px; }
  
  .screen { padding: 20px 16px 120px; }
  .screen-header h2 { font-size: 1.5rem; }
  
  .world-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  
  .level-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  }
  
  .stage-grid {
    grid-template-columns: repeat(auto-fill, minmax(65px, 1fr));
  }
  
  .game-hud {
    font-size: 0.8rem;
  }
  
  .game-screen {
    padding: 8px;
  }
  
  .canvas-wrap {
    border-radius: 10px;
    border-width: 1px;
  }
  
  .win-card {
    padding: 32px 24px;
    margin: 16px;
  }
  
  .win-stats {
    flex-direction: column;
    gap: 8px;
  }
  
  .stat-box {
    padding: 12px;
  }
  
  .stat-value { font-size: 1.3rem; }
}

@media (max-width: 480px) {
  .level-grid {
    grid-template-columns: repeat(5, 1fr);
  }
  
  .stage-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
