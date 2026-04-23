<script setup>
import { ref } from 'vue';
import axios from 'axios';
import { User, Lock, Loader2, X } from 'lucide-vue-next';

const props = defineProps({
  apiUrl: { type: String, required: true }
});
const emit = defineEmits(['auth-success', 'close']);

const isLogin = ref(true);
const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function handleSubmit() {
  if (!username.value || !password.value) {
    error.value = 'Please fill all fields';
    return;
  }
  
  loading.value = true;
  error.value = '';
  
  const endpoint = isLogin.value ? '/api/auth/login' : '/api/auth/signup';
  
  try {
    const res = await axios.post(`${props.apiUrl}${endpoint}`, {
      username: username.value,
      password: password.value
    });
    
    emit('auth-success', res.data);
  } catch (err) {
    error.value = err.response?.data?.error || 'Authentication failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-overlay" @click.self="emit('close')">
    <div class="auth-card">
      <button class="close-btn" @click="emit('close')"><X :size="20" /></button>
      
      <h2>{{ isLogin ? 'Welcome Back' : 'Create Account' }}</h2>
      <p class="sub">{{ isLogin ? 'Login to sync your progress' : 'Join to save your scores in the cloud' }}</p>
      
      <form @submit.prevent="handleSubmit" class="auth-form">
        <div class="input-group">
          <User :size="18" class="input-icon" />
          <input v-model="username" type="text" placeholder="Username" required />
        </div>
        
        <div class="input-group">
          <Lock :size="18" class="input-icon" />
          <input v-model="password" type="password" placeholder="Password" required />
        </div>
        
        <div v-if="error" class="error-msg">{{ error }}</div>
        
        <button type="submit" class="submit-btn" :disabled="loading">
          <Loader2 v-if="loading" class="spin" :size="20" />
          <span v-else>{{ isLogin ? 'Login' : 'Sign Up' }}</span>
        </button>
      </form>
      
      <div class="toggle-text">
        {{ isLogin ? "Don't have an account?" : "Already have an account?" }}
        <button @click="isLogin = !isLogin">{{ isLogin ? 'Sign Up' : 'Login' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.auth-card {
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  width: 100%;
  max-width: 400px;
  padding: 40px;
  position: relative;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
}

h2 { font-size: 1.75rem; font-weight: 800; margin-bottom: 8px; text-align: center; }
.sub { color: #64748b; text-align: center; margin-bottom: 32px; font-size: 0.9rem; }

.auth-form { display: flex; flex-direction: column; gap: 16px; }

.input-group {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 16px;
  color: #64748b;
}

input {
  width: 100%;
  background: #080c14;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 14px 14px 14px 48px;
  color: white;
  font-family: inherit;
  transition: border-color 0.2s;
}

input:focus {
  outline: none;
  border-color: #3b82f6;
}

.error-msg {
  color: #ef4444;
  font-size: 0.85rem;
  text-align: center;
}

.submit-btn {
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 12px;
  padding: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: filter 0.2s;
}

.submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.submit-btn:not(:disabled):hover { filter: brightness(1.1); }

.toggle-text {
  margin-top: 24px;
  text-align: center;
  font-size: 0.9rem;
  color: #64748b;
}

.toggle-text button {
  background: none;
  border: none;
  color: #3b82f6;
  font-weight: 700;
  cursor: pointer;
  padding-left: 4px;
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
