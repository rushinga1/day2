export class GameEngine {
  constructor(canvas, config, multiplayer = false) {
    this.canvas      = canvas;
    this.ctx         = canvas.getContext('2d');
    this.config      = config || {};
    this.multiplayer = multiplayer;

    this.gravity   = this.config.gravity ?? 0.5;
    this.speed     = this.config.speed   ?? 5;
    this.jumpForce = this.config.jump    ?? -10;
    this.theme     = this.config.worldTheme || {
      bgColor: '#0f172a', platformColor: '#334155', accentColor: '#10b981'
    };

    this.platforms = JSON.parse(JSON.stringify(this.config.platforms || []));
    this.traps     = JSON.parse(JSON.stringify(this.config.traps     || []));
    this.exit      = JSON.parse(JSON.stringify(
      this.config.exit || { x: 200, y: 30, width: 40, height: 60 }
    ));

    // ── Players ──────────────────────────────────────────────────────────────
    this.p1 = this._freshPlayer(1);
    this.p2 = multiplayer ? this._freshPlayer(2) : null;

    // ── Superpower booster ────────────────────────────────────────────────────
    // Placed roughly in the vertical middle of the level
    this.booster = this._freshBooster();

    this.keys = {};
    this.isRunning = false;
    this.onWin = null;
    this.onDie = null;

    // For drawing the boost cooldown ring (exposed so UI can read it)
    this.boosterCooldownLeft = 0;   // seconds remaining until respawn
    this.boosterMaxCooldown  = 60;

    this._handleKeyDown = (e) => {
      this.keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._handleKeyUp = (e) => { delete this.keys[e.code]; };
    window.addEventListener('keydown', this._handleKeyDown);
    window.addEventListener('keyup',   this._handleKeyUp);

    // Track time for booster cooldown (60-second real timer)
    this._lastTime = performance.now();
  }

  _freshPlayer(num) {
    const H = this.canvas.height;
    return {
      num,
      x: num === 1 ? 50 : 90,
      y: H - 90,
      width: 30, height: 30,
      vx: 0, vy: 0,
      onGround: false,
      deaths: 0,
      color: num === 1 ? '#3b82f6' : '#f97316',
      label: `P${num}`,
      // Boost state
      boosted:     false,
      boostTimer:  0,      // seconds of boost remaining
      boostSpeed:  0,
      boostJump:   0,
    };
  }

  _freshBooster() {
    // Place in the mid-height of the canvas and a random X
    const platforms = this.platforms;
    let bx = 350, by = 200;
    if (platforms.length > 2) {
      const mid = platforms[Math.floor(platforms.length / 2)];
      bx = mid.x + mid.width / 2 - 16;
      by = mid.y - 50;
    }
    return {
      x: bx, y: by,
      width: 32, height: 32,
      active: true,           // visible and collectible
      cooldown: 0,            // seconds until it respawns
      maxCooldown: 60,
      angle: 0,               // for spinning animation
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  start()  { this.isRunning = true; this._lastTime = performance.now(); this._loop(); }
  stop()   {
    this.isRunning = false;
    window.removeEventListener('keydown', this._handleKeyDown);
    window.removeEventListener('keyup',   this._handleKeyUp);
  }

  // ── Main loop ───────────────────────────────────────────────────────────────
  _loop() {
    if (!this.isRunning) return;
    const now   = performance.now();
    const delta = Math.min((now - this._lastTime) / 1000, 0.05); // seconds, capped
    this._lastTime = now;

    this._update(delta);
    this._draw();
    requestAnimationFrame(() => this._loop());
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  _update(delta) {
    // Player 1 (W/A/D)
    this._updatePlayer(this.p1, {
      left:  ['KeyA'],
      right: ['KeyD'],
      jump:  ['KeyW', 'Space'],
    }, delta);

    // Player 2 (Arrow keys) – multiplayer only
    if (this.multiplayer && this.p2) {
      this._updatePlayer(this.p2, {
        left:  ['ArrowLeft'],
        right: ['ArrowRight'],
        jump:  ['ArrowUp'],
      }, delta);
    }

    // Moving exit (troll)
    const near = Math.abs(this.p1.x - this.exit.x) < 160 ||
      (this.multiplayer && this.p2 && Math.abs(this.p2.x - this.exit.x) < 160);
    if (this.exit.type === 'troll' && near) {
      this.exit.x = Math.min(this.exit.x + 6, this.canvas.width - this.exit.width - 10);
    }

    // Booster logic
    this._updateBooster(delta);
  }

  _updatePlayer(p, keys, delta) {
    const spd  = p.boosted ? p.boostSpeed : this.speed;
    const jmp  = p.boosted ? p.boostJump  : this.jumpForce;

    // Horizontal
    if (keys.left.some(k  => this.keys[k]))  p.vx = -spd;
    else if (keys.right.some(k => this.keys[k])) p.vx = spd;
    else p.vx = 0;

    // Jump
    if (keys.jump.some(k => this.keys[k]) && p.onGround) {
      p.vy = jmp;
      p.onGround = false;
    }

    // Gravity & movement
    p.vy += this.gravity;
    p.x  += p.vx;
    p.y  += p.vy;
    p.x   = Math.max(0, Math.min(p.x, this.canvas.width - p.width));

    // Platform collisions
    p.onGround = false;
    for (const pl of this.platforms) {
      if (!this._aabb(p, pl)) continue;
      if (p.vy >= 0 && (p.y + p.height - p.vy) <= pl.y + 4) {
        p.y = pl.y - p.height;
        p.vy = 0;
        p.onGround = true;
      } else if (p.vx > 0 && (p.x + p.width - p.vx) <= pl.x + 4) {
        p.x = pl.x - p.width;
      } else if (p.vx < 0 && (p.x - p.vx) >= pl.x + pl.width - 4) {
        p.x = pl.x + pl.width;
      }
    }

    // Trap collisions
    for (const t of this.traps) {
      if (t.active && this._aabb(p, t)) {
        this._respawn(p);
        return;
      }
    }

    // Booster pickup
    if (this.booster.active && this._aabb(p, this.booster)) {
      this._applyBoost(p);
      this.booster.active   = false;
      this.booster.cooldown = this.booster.maxCooldown;
    }

    // Boost timer countdown
    if (p.boosted) {
      p.boostTimer -= delta;
      if (p.boostTimer <= 0) p.boosted = false;
    }

    // Win check
    if (this._aabb(p, this.exit)) {
      this._win(p.num);
      return;
    }

    // Fall off bottom
    if (p.y > this.canvas.height + 80) {
      this._respawn(p);
    }
  }

  _applyBoost(p) {
    p.boosted    = true;
    p.boostTimer = 10;              // 10 seconds of power
    p.boostSpeed = this.speed * 2;  // double speed
    p.boostJump  = this.jumpForce * 1.6; // 60% higher jump
  }

  _updateBooster(delta) {
    this.booster.angle += delta * 2; // spin animation
    if (!this.booster.active) {
      this.booster.cooldown -= delta;
      this.boosterCooldownLeft = Math.max(0, this.booster.cooldown);
      if (this.booster.cooldown <= 0) {
        this.booster.active = true;
        this.boosterCooldownLeft = 0;
      }
    } else {
      this.boosterCooldownLeft = 0;
    }
  }

  // ── Draw ────────────────────────────────────────────────────────────────────
  _draw() {
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;

    // Background
    ctx.fillStyle = this.theme.bgColor || '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Platforms
    for (const pl of this.platforms) {
      ctx.fillStyle = this.theme.platformColor || '#334155';
      ctx.beginPath();
      ctx.roundRect(pl.x, pl.y, pl.width, pl.height, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(pl.x + 4, pl.y + 2, pl.width - 8, 3);
    }

    // Traps
    for (const t of this.traps) {
      if (t.visible === false) continue;
      ctx.fillStyle = t.color || '#ef4444';
      ctx.beginPath();
      ctx.roundRect(t.x, t.y, t.width, t.height, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(t.x + 4, t.y + 2, t.width - 8, 3);
    }

    // Exit door
    const ex = this.exit;
    ctx.shadowColor = this.theme.accentColor || '#10b981';
    ctx.shadowBlur  = 18;
    ctx.fillStyle   = this.theme.accentColor || '#10b981';
    ctx.beginPath();
    ctx.roundRect(ex.x, ex.y, ex.width, ex.height, [8, 8, 0, 0]);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#f59e0b';
    ctx.beginPath();
    ctx.arc(ex.x + ex.width - 8, ex.y + ex.height / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // ── Superpower Booster ──────────────────────────────────────────────────
    this._drawBooster(ctx);

    // Players
    this._drawPlayer(ctx, this.p1);
    if (this.multiplayer && this.p2) this._drawPlayer(ctx, this.p2);

    // Boost timer bars (top of screen)
    this._drawBoostBars(ctx, W);

    // HUD player death counts (multiplayer)
    if (this.multiplayer) {
      this._drawPlayerHUD(ctx, this.p1, 10, 10);
      this._drawPlayerHUD(ctx, this.p2, W - 130, 10);
    }
  }

  _drawBooster(ctx) {
    const b = this.booster;

    if (b.active) {
      // Glowing spinning star ⚡
      ctx.save();
      ctx.translate(b.x + b.width / 2, b.y + b.height / 2);
      ctx.rotate(b.angle);

      // Outer glow
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur  = 24;

      // Star shape
      ctx.fillStyle = '#f59e0b';
      this._drawStar(ctx, 0, 0, 5, 16, 8);
      ctx.fill();

      // Lightning symbol
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#fff';
      ctx.font       = 'bold 14px sans-serif';
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', 0, 0);

      ctx.restore();
    } else {
      // Draw cooldown ring (greyed out star with timer ring)
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.translate(b.x + b.width / 2, b.y + b.height / 2);
      ctx.fillStyle = '#94a3b8';
      this._drawStar(ctx, 0, 0, 5, 16, 8);
      ctx.fill();
      ctx.restore();

      // Cooldown ring progress
      const progress = 1 - (b.cooldown / b.maxCooldown);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth   = 3;
      ctx.stroke();

      // Countdown text
      ctx.fillStyle    = '#f59e0b';
      ctx.font         = 'bold 10px Outfit, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.ceil(b.cooldown) + 's', cx, cy + 32);
    }
  }

  _drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  }

  _drawPlayer(ctx, p) {
    const boostedGlow = p.boosted ? '#f59e0b' : p.color;

    ctx.shadowColor = boostedGlow;
    ctx.shadowBlur  = p.boosted ? 24 : 12;
    ctx.fillStyle   = p.boosted ? '#fbbf24' : p.color;
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.width, p.height, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Boost aura ring
    if (p.boosted) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth   = 2;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(Date.now() / 150);
      ctx.beginPath();
      ctx.roundRect(p.x - 4, p.y - 4, p.width + 8, p.height + 8, 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Eyes
    const eyeY = p.y + 9;
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(p.x + 8,  eyeY, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x + 21, eyeY, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(p.x + 9,  eyeY, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x + 22, eyeY, 1.8, 0, Math.PI * 2); ctx.fill();

    // Label tag
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(p.x + 3, p.y + p.height - 12, 24, 11, 4);
    ctx.fill();
    ctx.fillStyle    = 'white';
    ctx.font         = 'bold 8px Outfit, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(p.label, p.x + 15, p.y + p.height - 3);
    ctx.textAlign    = 'left';
  }

  _drawBoostBars(ctx, W) {
    const drawBar = (p, barX) => {
      if (!p.boosted) return;
      const ratio   = p.boostTimer / 10;
      const barW    = 100;
      const barH    = 8;
      const barY    = this.canvas.height - 20;

      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 4); ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.roundRect(barX, barY, barW * ratio, barH, 4); ctx.fill();

      ctx.fillStyle    = '#fef3c7';
      ctx.font         = '10px Outfit, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`⚡ ${p.label} BOOSTED ${p.boostTimer.toFixed(1)}s`, barX + barW / 2, barY - 4);
    };

    drawBar(this.p1, 10);
    if (this.multiplayer && this.p2) drawBar(this.p2, W - 120);
  }

  _drawPlayerHUD(ctx, p, x, y) {
    const W = 110;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(x, y, W, 36, 8); ctx.fill();

    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(x + 16, y + 18, 7, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle    = 'white';
    ctx.font         = 'bold 12px Outfit, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(p.label, x + 28, y + 14);

    ctx.fillStyle = '#ef4444';
    ctx.font      = '10px Outfit, sans-serif';
    ctx.fillText(`${p.deaths} death${p.deaths !== 1 ? 's' : ''}`, x + 28, y + 28);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  _aabb(a, b) {
    return a.x < b.x + b.width  &&
           a.x + a.width  > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
  }

  _respawn(p) {
    p.deaths++;
    const H = this.canvas.height;
    p.x      = p.num === 1 ? 50 : 90;
    p.y      = H - 90;
    p.vx     = 0;
    p.vy     = 0;
    p.boosted = false;
    this.exit = JSON.parse(JSON.stringify(
      this.config.exit || { x: 200, y: 30, width: 40, height: 60 }
    ));
    if (this.onDie) this.onDie(p.num);
  }

  _win(playerNum) {
    this.isRunning = false;
    if (this.onWin) this.onWin(playerNum);
  }
}
