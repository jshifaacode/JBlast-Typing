const Effects = (() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let gridLines = [];
  let animId;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function initGrid() {
    gridLines = [];
    const spacing = 60;
    for (let x = 0; x < canvas.width + spacing; x += spacing) {
      gridLines.push({ type: 'v', x, opacity: Math.random() * 0.04 + 0.01 });
    }
    for (let y = 0; y < canvas.height + spacing; y += spacing) {
      gridLines.push({ type: 'h', y, opacity: Math.random() * 0.04 + 0.01 });
    }
  }
  initGrid();
  window.addEventListener('resize', initGrid);

  function spawnParticle(x, y, color = '#00f0ff') {
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 / 8) * i + Math.random() * 0.5;
      const speed = Math.random() * 3 + 1;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, decay: Math.random() * 0.04 + 0.02,
        size: Math.random() * 4 + 2,
        color
      });
    }
  }

  function spawnBurst(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, decay: Math.random() * 0.02 + 0.015,
        size: Math.random() * 6 + 2,
        color
      });
    }
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const line of gridLines) {
      ctx.strokeStyle = `rgba(0,240,255,${line.opacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (line.type === 'v') {
        ctx.moveTo(line.x, 0);
        ctx.lineTo(line.x, canvas.height);
      } else {
        ctx.moveTo(0, line.y);
        ctx.lineTo(canvas.width, line.y);
      }
      ctx.stroke();
    }

    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.life -= p.decay;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    animId = requestAnimationFrame(loop);
  }

  function screenShake(intensity = 8, duration = 300) {
    const app = document.getElementById('app');
    const start = Date.now();
    const shake = () => {
      const elapsed = Date.now() - start;
      if (elapsed >= duration) { app.style.transform = ''; return; }
      const decay = 1 - elapsed / duration;
      const x = (Math.random() - 0.5) * intensity * 2 * decay;
      const y = (Math.random() - 0.5) * intensity * decay;
      app.style.transform = `translate(${x}px, ${y}px)`;
      requestAnimationFrame(shake);
    };
    shake();
  }

  function damageFlash() {
    const overlay = document.getElementById('damage-overlay');
    overlay.classList.add('flash');
    setTimeout(() => overlay.classList.remove('flash'), 200);
    screenShake(6, 200);
  }

  function showDamageNumber(el, amount, color = '#ffe000') {
    const num = document.createElement('div');
    num.className = 'enemy-damage-number';
    num.textContent = `-${amount}`;
    num.style.color = color;
    num.style.textShadow = `0 0 10px ${color}`;
    el.appendChild(num);
    setTimeout(() => num.remove(), 800);

    const rect = el.getBoundingClientRect();
    spawnParticle(rect.left + rect.width / 2, rect.top + rect.height / 2, color);
  }

  function killEffect(el) {
    const rect = el.getBoundingClientRect();
    spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ff2244', 30);
    spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ffe000', 20);
    screenShake(12, 300);
  }

  function comboEffect(combo) {
    const colors = ['#00f0ff', '#00ff88', '#ffe000', '#ff0080', '#9d00ff'];
    const color = colors[Math.min(combo - 1, colors.length - 1)];
    const el = document.querySelector('.target-word');
    if (el) {
      const rect = el.getBoundingClientRect();
      spawnParticle(rect.left + rect.width / 2, rect.top + rect.height / 2, color);
    }
  }

  function typeEffect(el, skin) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const colors = {
      fire: '#ff6600',
      lightning: '#ffe000',
      glitch: '#9d00ff',
      ice: '#00ccff',
      default: '#00f0ff'
    };
    const color = colors[skin] || colors.default;
    particles.push({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      vx: (Math.random() - 0.5) * 2,
      vy: -Math.random() * 2 - 1,
      life: 0.8, decay: 0.06,
      size: Math.random() * 3 + 1,
      color
    });
  }

  function showToast(msg, type = 'info', duration = 2500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  loop();

  return { spawnParticle, spawnBurst, screenShake, damageFlash, showDamageNumber, killEffect, comboEffect, typeEffect, showToast };
})();
