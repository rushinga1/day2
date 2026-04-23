<script setup>
import { ref, onMounted } from 'vue';

const emit = defineEmits(['done']);

const progress   = ref(0);
const phase      = ref('loading'); // loading | ready
const showButton = ref(false);

onMounted(() => {
  // Animate progress bar to 100% over ~2.5 seconds
  const duration = 2500;
  const start    = performance.now();

  const tick = (now) => {
    const elapsed = now - start;
    progress.value = Math.min(100, (elapsed / duration) * 100);
    if (elapsed < duration) {
      requestAnimationFrame(tick);
    } else {
      progress.value = 100;
      setTimeout(() => {
        phase.value     = 'ready';
        showButton.value = true;
      }, 400);
    }
  };
  requestAnimationFrame(tick);
});
</script>

<template>
  <div class="splash">
    <!-- Particle stars -->
    <div v-for="i in 40" :key="i" class="star" :style="{
      left:  (Math.random() * 100) + '%',
      top:   (Math.random() * 100) + '%',
      animationDelay: (Math.random() * 4) + 's',
      animationDuration: (2 + Math.random() * 3) + 's',
      width:  (1 + Math.random() * 2) + 'px',
      height: (1 + Math.random() * 2) + 'px',
    }"></div>

    <div class="splash-content">
      <!-- Logo -->
      <div class="splash-logo">
        <span class="logo-mr">Mr</span><span class="logo-dev">dev</span><span class="logo-game">game</span>
      </div>

      <p class="splash-tagline">The troll platformer that hates you.</p>

      <!-- Badges -->
      <div class="splash-badges">
        <span class="badge">🌍 10 Worlds</span>
        <span class="badge">🎮 1,000 Stages</span>
        <span class="badge">👥 2P Multiplayer</span>
        <span class="badge">⚡ Superpowers</span>
      </div>

      <!-- Loading bar -->
      <div class="loader-wrap" v-if="phase === 'loading'">
        <div class="loader-bar">
          <div class="loader-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <p class="loader-text">
          {{ progress < 30 ? 'Spawning traps…'
           : progress < 60 ? 'Generating 1,000 levels…'
           : progress < 90 ? 'Loading superpowers…'
           : 'Ready!' }}
        </p>
      </div>

      <!-- Play button (after loading) -->
      <Transition name="pop">
        <button
          v-if="showButton"
          class="play-btn"
          @click="emit('done')"
        >
          ▶ &nbsp; Play Now
        </button>
      </Transition>
    </div>

    <!-- Bottom version label -->
    <div class="splash-version">v1.0 · Made with Vue 3 + ❤️</div>
  </div>
</template>

<style scoped>
.splash {
  position: fixed; inset: 0; z-index: 9999;
  background: #060a12;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  font-family: 'Outfit', sans-serif;
}

/* ── Twinkling stars ─────────────────────────────────────────────────────── */
.star {
  position: absolute;
  background: white;
  border-radius: 50%;
  opacity: 0;
  animation: twinkle linear infinite;
}
@keyframes twinkle {
  0%,100% { opacity: 0; transform: scale(0.5); }
  50%      { opacity: 0.7; transform: scale(1); }
}

/* ── Content ─────────────────────────────────────────────────────────────── */
.splash-content {
  text-align: center;
  display: flex; flex-direction: column;
  align-items: center; gap: 24px;
  z-index: 1;
}

/* ── Logo ────────────────────────────────────────────────────────────────── */
.splash-logo {
  font-size: clamp(3rem, 10vw, 6rem);
  font-weight: 800;
  letter-spacing: -3px;
  text-transform: uppercase;
  line-height: 1;
  animation: logoPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes logoPop {
  from { transform: scale(0.4) rotate(-6deg); opacity: 0; }
  to   { transform: scale(1)   rotate(0deg);  opacity: 1; }
}

.logo-mr   { color: #f1f5f9; }
.logo-dev  { color: #3b82f6; text-shadow: 0 0 32px rgba(59,130,246,.7); }
.logo-game { color: #f1f5f9; }

/* ── Tagline ─────────────────────────────────────────────────────────────── */
.splash-tagline {
  color: #64748b; font-size: 1.1rem; font-weight: 300;
  animation: fadeUp 0.6s 0.4s both;
}

/* ── Badges ──────────────────────────────────────────────────────────────── */
.splash-badges {
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
  animation: fadeUp 0.6s 0.7s both;
}
.badge {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  padding: 7px 16px; border-radius: 999px;
  font-size: .85rem; color: #cbd5e1; font-weight: 600;
}

/* ── Loader ──────────────────────────────────────────────────────────────── */
.loader-wrap {
  width: 320px;
  animation: fadeUp 0.6s 1s both;
}
.loader-bar {
  height: 8px;
  background: rgba(255,255,255,.08);
  border-radius: 999px; overflow: hidden;
  margin-bottom: 10px;
}
.loader-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899);
  border-radius: 999px;
  transition: width 0.1s linear;
  box-shadow: 0 0 12px rgba(139,92,246,.6);
}
.loader-text {
  color: #64748b; font-size: .85rem;
}

/* ── Play button ─────────────────────────────────────────────────────────── */
.play-btn {
  padding: 18px 56px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: white;
  font-family: inherit; font-size: 1.3rem; font-weight: 800;
  border: none; border-radius: 16px;
  cursor: pointer;
  box-shadow: 0 0 32px rgba(139,92,246,.5);
  transition: transform .15s, filter .15s;
  letter-spacing: 1px;
}
.play-btn:hover { transform: scale(1.06); filter: brightness(1.15); }
.play-btn:active { transform: scale(0.97); }

/* Pop transition */
.pop-enter-active { animation: pop .5s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes pop {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

/* ── Version ─────────────────────────────────────────────────────────────── */
.splash-version {
  position: absolute; bottom: 20px;
  color: #334155; font-size: .8rem;
}

/* ── Shared fade up ──────────────────────────────────────────────────────── */
@keyframes fadeUp {
  from { transform: translateY(20px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
</style>
