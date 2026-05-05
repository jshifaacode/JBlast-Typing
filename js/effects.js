var Effects = (function () {
  var canvas = document.getElementById("bg-canvas");
  var ctx = canvas.getContext("2d");
  var particles = [],
    stars = [],
    t = 0;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    stars = [];
    for (var i = 0; i < 70; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.3 + 0.3,
        spd: Math.random() * 0.2 + 0.04,
        b: Math.random() * Math.PI * 2,
      });
    }
  }
  window.addEventListener("resize", resize);
  resize();

  function spawnParticle(x, y, color) {
    if (!color) color = "#00f5ff";
    for (var i = 0; i < 8; i++) {
      var a = ((Math.PI * 2) / 8) * i + Math.random() * 0.5,
        s = Math.random() * 3 + 1;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        decay: Math.random() * 0.04 + 0.02,
        size: Math.random() * 4 + 2,
        color: color,
      });
    }
  }

  function spawnBurst(x, y, color, count) {
    if (!count) count = 20;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2,
        s = Math.random() * 6 + 2;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        decay: Math.random() * 0.02 + 0.015,
        size: Math.random() * 6 + 2,
        color: color,
      });
    }
  }

  (function loop() {
    t += 0.003;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, "rgba(0,245,255," + (0.01 + Math.sin(t) * 0.006) + ")");
    g.addColorStop(
      0.5,
      "rgba(191,0,255," + (0.007 + Math.cos(t * 0.8) * 0.004) + ")",
    );
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.b += 0.015;
      s.y -= s.spd;
      if (s.y < 0) {
        s.y = canvas.height;
        s.x = Math.random() * canvas.width;
      }
      var alpha = 0.12 + Math.abs(Math.sin(s.b)) * 0.4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(160,200,255," + alpha + ")";
      ctx.fill();
    }
    particles = particles.filter(function (p) {
      return p.life > 0;
    });
    for (var j = 0; j < particles.length; j++) {
      var p = particles[j];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.life -= p.decay;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(loop);
  })();

  function screenShake(intensity, dur) {
    if (!intensity) intensity = 8;
    if (!dur) dur = 300;
    var app = document.getElementById("app"),
      start = Date.now();
    (function shake() {
      var el = Date.now() - start;
      if (el >= dur) {
        app.style.transform = "";
        return;
      }
      var d = 1 - el / dur;
      app.style.transform =
        "translate(" +
        (Math.random() - 0.5) * intensity * 2 * d +
        "px," +
        (Math.random() - 0.5) * intensity * d +
        "px)";
      requestAnimationFrame(shake);
    })();
  }

  function damageFlash() {
    var o = document.getElementById("damage-overlay");
    if (!o) return;
    o.classList.remove("flash");
    void o.offsetWidth;
    o.classList.add("flash");
    screenShake(6, 200);
  }

  function showDamageNumber(el, amount, color) {
    if (!color) color = "#ffe000";
    var num = document.createElement("div");
    num.className = "enemy-damage-number";
    num.textContent = "-" + amount;
    num.style.color = color;
    num.style.textShadow = "0 0 8px " + color;
    el.appendChild(num);
    setTimeout(function () {
      if (num.parentElement) num.remove();
    }, 850);
    try {
      var r = el.getBoundingClientRect();
      spawnParticle(r.left + r.width / 2, r.top + r.height / 2, color);
    } catch (x) {}
  }

  function killEffect(el) {
    try {
      var r = el.getBoundingClientRect();
      spawnBurst(r.left + r.width / 2, r.top + r.height / 2, "#ff2244", 30);
      spawnBurst(r.left + r.width / 2, r.top + r.height / 2, "#ffe000", 20);
    } catch (x) {}
    screenShake(12, 300);
  }

  function comboEffect(combo) {
    var cols = ["#00f5ff", "#00ff88", "#ffe000", "#ff0080", "#9d00ff"];
    var color = cols[Math.min(combo - 1, cols.length - 1)];
    var el = document.querySelector(".target-word");
    if (el) {
      try {
        var r = el.getBoundingClientRect();
        spawnParticle(r.left + r.width / 2, r.top + r.height / 2, color);
      } catch (x) {}
    }
  }

  function typeEffect(el, skin) {
    if (!el) return;
    try {
      var r = el.getBoundingClientRect();
      var cols = {
        fire: "#ff6600",
        lightning: "#ffe000",
        glitch: "#9d00ff",
        ice: "#00ccff",
        default: "#00f5ff",
      };
      particles.push({
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 2 - 1,
        life: 0.8,
        decay: 0.06,
        size: Math.random() * 3 + 1,
        color: cols[skin] || cols.default,
      });
    } catch (x) {}
  }

  function showToast(msg, type, dur) {
    if (!dur) dur = 2500;
    var c = document.getElementById("toast-container");
    if (!c) return;
    var el = document.createElement("div");
    el.className = "toast " + (type || "info");
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      el.style.transition = "opacity .3s";
      setTimeout(function () {
        if (el.parentElement) el.remove();
      }, 300);
    }, dur);
  }

  return {
    spawnParticle: spawnParticle,
    spawnBurst: spawnBurst,
    screenShake: screenShake,
    damageFlash: damageFlash,
    showDamageNumber: showDamageNumber,
    killEffect: killEffect,
    comboEffect: comboEffect,
    typeEffect: typeEffect,
    showToast: showToast,
  };
})();
