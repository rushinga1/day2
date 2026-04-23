<script setup>
import { ArrowLeft, ArrowRight, ArrowUp } from 'lucide-vue-next';

const emit = defineEmits(['input']);

const handleStart = (key) => emit('input', { key, pressed: true });
const handleEnd = (key) => emit('input', { key, pressed: false });
</script>

<template>
  <div class="touch-controls">
    <div class="d-pad">
      <button 
        class="touch-btn" 
        @touchstart.prevent="handleStart('KeyA')" 
        @touchend.prevent="handleEnd('KeyA')"
        @mousedown="handleStart('KeyA')"
        @mouseup="handleEnd('KeyA')"
      >
        <ArrowLeft :size="32" />
      </button>
      <button 
        class="touch-btn" 
        @touchstart.prevent="handleStart('KeyD')" 
        @touchend.prevent="handleEnd('KeyD')"
        @mousedown="handleStart('KeyD')"
        @mouseup="handleEnd('KeyD')"
      >
        <ArrowRight :size="32" />
      </button>
    </div>
    <div class="action-pad">
      <button 
        class="touch-btn jump-btn" 
        @touchstart.prevent="handleStart('KeyW')" 
        @touchend.prevent="handleEnd('KeyW')"
        @mousedown="handleStart('KeyW')"
        @mouseup="handleEnd('KeyW')"
      >
        <ArrowUp :size="40" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.touch-controls {
  position: fixed;
  bottom: 30px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 0 30px;
  pointer-events: none;
  z-index: 1000;
}

.d-pad, .action-pad {
  display: flex;
  gap: 20px;
  pointer-events: auto;
}

.touch-btn {
  width: 70px;
  height: 70px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  touch-action: none;
  transition: transform 0.1s, background 0.1s;
}

.touch-btn:active {
  transform: scale(0.9);
  background: rgba(255, 255, 255, 0.3);
}

.jump-btn {
  width: 90px;
  height: 90px;
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.5);
}

@media (min-width: 1024px) {
  .touch-controls {
    display: none;
  }
}
</style>
