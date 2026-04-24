<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { io } from 'socket.io-client';
import { GameEngine } from '../engine/GameEngine';
import TouchControls from './TouchControls.vue';

const props = defineProps({
  level:           { type: Object,  required: true  },
  multiplayer:     { type: Boolean, default: false  },
  isNetworkGame:   { type: Boolean, default: false  },
  roomId:          { type: String,  default: ''     },
  playerName:      { type: String,  default: 'Player' }
});
const emit = defineEmits(['win', 'die', 'room-full']);

const canvasRef = ref(null);
const localPlayerNum = ref(1);
let engine = null;
let socket = null;

const API_URL = import.meta.env.VITE_API_URL || 'https://mrdevgame-server-gnwr.onrender.com';

const initEngine = () => {
  if (engine) engine.stop();
  if (!canvasRef.value || !props.level?.config) return;

  if (props.isNetworkGame && !socket) {
    socket = io(API_URL);
    socket.emit('join-room', { roomId: props.roomId, playerName: props.playerName });
    
    socket.on('player-assigned', (num) => { localPlayerNum.value = num; });
    socket.on('room-full', () => { emit('room-full'); });
    socket.on('opponent-update', (data) => { if (engine) engine.updateRemotePlayer(data); });
    socket.on('opponent-die', (num) => { if (engine) engine._respawn(num === 1 ? engine.p1 : engine.p2); });
    socket.on('game-over', ({ winnerNum }) => { if (engine) engine._win(winnerNum); });
  }

  const cfg = {
    ...props.level.config,
    worldTheme: props.level.worldTheme || null
  };

  engine = new GameEngine(
    canvasRef.value, 
    cfg, 
    props.multiplayer || props.isNetworkGame, 
    localPlayerNum.value, 
    props.isNetworkGame
  );

  engine.onWin = (winnerNum) => {
    emit('win', winnerNum);
    if (props.isNetworkGame && socket) {
      socket.emit('player-win', { roomId: props.roomId, playerNum: winnerNum, playerName: props.playerName });
    }
  };

  engine.onDie = (playerNum) => {
    emit('die', playerNum);
    if (props.isNetworkGame && socket && playerNum === localPlayerNum.value) {
      socket.emit('player-die', { roomId: props.roomId, playerNum });
    }
  };

  engine.onPlayerUpdate = (data) => {
    if (props.isNetworkGame && socket) {
      socket.emit('player-update', { roomId: props.roomId, ...data });
    }
  };

  engine.start();
};

const handleTouchInput = ({ key, pressed }) => {
  if (engine) engine.setKey(key, pressed);
};

onMounted(initEngine);
onUnmounted(() => { 
  if (engine) engine.stop(); 
  if (socket) socket.disconnect();
});
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
    
    <TouchControls @input="handleTouchInput" />
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
