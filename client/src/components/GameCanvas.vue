<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { GameEngine } from '../engine/GameEngine';

const props = defineProps({
  level:       { type: Object,  required: true  },
  multiplayer: { type: Boolean, default: false  }
});
const emit = defineEmits(['win', 'die']);

const canvasRef = ref(null);
let engine = null;

const initEngine = () => {
  if (engine) engine.stop();
  if (!canvasRef.value || !props.level?.config) return;

  const cfg = {
    ...props.level.config,
    worldTheme: props.level.worldTheme || null
  };

  engine = new GameEngine(canvasRef.value, cfg, props.multiplayer);
  engine.onWin = (winnerNum) => emit('win', winnerNum);
  engine.onDie = (playerNum) => emit('die', playerNum);
  engine.start();
};

onMounted(initEngine);
onUnmounted(() => { if (engine) engine.stop(); });
watch(() => [props.level, props.multiplayer], initEngine, { deep: false });
</script>

<template>
  <div class="canvas-wrap">
    <canvas
      ref="canvasRef"
      width="800"
      height="450"
      class="game-canvas"
    ></canvas>
  </div>
</template>

<style scoped>
.canvas-wrap {
  display: flex;
  justify-content: center;
  background: #080c14;
  border-radius: 14px;
  overflow: hidden;
  border: 2px solid rgba(255,255,255,0.07);
  box-shadow: 0 0 40px rgba(0,0,0,0.6);
}
.game-canvas {
  display: block;
  max-width: 100%;
  image-rendering: pixelated;
}
</style>
