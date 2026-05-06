const Audio = (() => {
  let _ctx = null;
  let muted = false;
  let _bgm = null;
  let _bgmReady = false;
  let _bgmPlaying = false;
  let _pendingPlay = false;
  let _unlocked = false;
  const BGM_SRC = "assets/yorunikakeru-yoasobi.mp3";

  function getCtx() {
    if (!_ctx) {
      try {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) {}
    }
    return _ctx;
  }

  function resume() {
    try {
      const c = getCtx();
      if (c && c.state === "suspended") c.resume();
    } catch(e) {}
  }

  function tone(freq, type, dur, gain) {
    if (muted) return;
    if (gain === undefined) gain = 0.3;
    resume();
    try {
      const c = getCtx();
      if (!c) return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start();
      o.stop(c.currentTime + dur);
    } catch(e) {}
  }

  function noise(dur, gain) {
    if (muted) return;
    if (gain === undefined) gain = 0.1;
    resume();
    try {
      const c = getCtx();
      if (!c) return;
      const n = c.sampleRate * dur;
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource();
      const g = c.createGain();
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      s.buffer = buf;
      s.connect(g);
      g.connect(c.destination);
      s.start();
    } catch(e) {}
  }

  function _makeBgm() {
    if (_bgm) return;
    try {
      _bgm = new window.Audio();
      _bgm.loop = true;
      _bgm.volume = muted ? 0 : 0.42;
      _bgm.preload = "auto";
      _bgm.crossOrigin = "anonymous";
      _bgm.addEventListener("canplaythrough", function onReady() {
        _bgmReady = true;
        _bgm.removeEventListener("canplaythrough", onReady);
        if (_pendingPlay && !_bgmPlaying) _doPlay();
      });
      _bgm.addEventListener("error", function() {
        _bgm = null;
        _bgmReady = false;
        _bgmPlaying = false;
        _pendingPlay = false;
      });
      _bgm.src = BGM_SRC;
      _bgm.load();
    } catch(e) {
      _bgm = null;
    }
  }

  function _doPlay() {
    if (!_bgm || _bgmPlaying) return;
    _bgm.volume = muted ? 0 : 0.42;
    try {
      const p = _bgm.play();
      if (p && typeof p.then === "function") {
        p.then(function() {
          _bgmPlaying = true;
          _pendingPlay = false;
        }).catch(function() {
          _bgmPlaying = false;
        });
      } else {
        _bgmPlaying = true;
        _pendingPlay = false;
      }
    } catch(e) {
      _bgmPlaying = false;
    }
  }

  function unlock() {
    if (_unlocked) return;
    _unlocked = true;
    resume();
    if (_pendingPlay && _bgm && !_bgmPlaying) {
      if (_bgmReady) {
        _doPlay();
      }
    }
  }

  function playBgm() {
    if (!_bgm) _makeBgm();
    if (!_bgm) return;
    _bgmPlaying = false;
    _pendingPlay = true;
    try { _bgm.currentTime = 0; } catch(e) {}
    _bgm.volume = muted ? 0 : 0.42;
    resume();
    if (_bgmReady && _unlocked) {
      _doPlay();
    }
  }

  function stopBgm(fade) {
    _pendingPlay = false;
    if (!_bgm) return;
    _bgmPlaying = false;
    if (fade) {
      let v = _bgm.volume;
      const step = v / 18;
      const iv = setInterval(function() {
        if (!_bgm) { clearInterval(iv); return; }
        v -= step;
        _bgm.volume = Math.max(0, v);
        if (v <= 0) {
          clearInterval(iv);
          try { _bgm.pause(); _bgm.currentTime = 0; } catch(e) {}
        }
      }, 55);
    } else {
      try { _bgm.pause(); _bgm.currentTime = 0; } catch(e) {}
    }
  }

  function pauseBgm() {
    if (_bgm && !_bgm.paused) {
      try { _bgm.pause(); } catch(e) {}
    }
  }

  function resumeBgm() {
    if (_bgm && _bgm.paused && _bgmPlaying && _unlocked) {
      try { _bgm.play().catch(function() {}); } catch(e) {}
    }
  }

  function tryPlayPending() {
    unlock();
    if (_pendingPlay && _bgm && !_bgmPlaying && _bgmReady) _doPlay();
  }

  _makeBgm();

  return {
    unlock: unlock,
    keyPress: function() { tone(800 + Math.random() * 200, "square", 0.04, 0.07); },
    keyCorrect: function() { tone(1200, "sine", 0.06, 0.1); },
    keyError: function() { tone(200, "sawtooth", 0.12, 0.14); noise(0.08, 0.07); },
    wordComplete: function() {
      tone(800, "sine", 0.05, 0.18);
      setTimeout(function() { tone(1200, "sine", 0.05, 0.14); }, 60);
      setTimeout(function() { tone(1600, "sine", 0.05, 0.1); }, 120);
    },
    hit: function() { tone(400, "sawtooth", 0.08, 0.2); noise(0.06, 0.05); },
    playerHit: function() { tone(150, "sawtooth", 0.2, 0.28); noise(0.15, 0.1); },
    comboUp: function(c) { tone(600 + c * 40, "sine", 0.05, 0.18); },
    overdrive: function() {
      for (var i = 0; i < 5; i++) {
        (function(i) { setTimeout(function() { tone(400 + i * 200, "sawtooth", 0.1, 0.14); }, i * 40); })(i);
      }
    },
    freeze: function() { tone(2000, "sine", 0.3, 0.18); tone(1800, "sine", 0.3, 0.18); },
    burn: function() { noise(0.2, 0.14); tone(200, "sawtooth", 0.2, 0.18); },
    victory: function() {
      [523,659,784,1047].forEach(function(f,i) { setTimeout(function() { tone(f,"sine",0.2,0.22); }, i*100); });
    },
    defeat: function() {
      [400,300,200,150].forEach(function(f,i) { setTimeout(function() { tone(f,"sawtooth",0.25,0.28); }, i*150); });
    },
    playBgm: playBgm,
    stopBgm: stopBgm,
    pauseBgm: pauseBgm,
    resumeBgm: resumeBgm,
    tryPlayPending: tryPlayPending,
    setMuted: function(v) {
      muted = v;
      if (_bgm) _bgm.volume = v ? 0 : 0.42;
    },
    isMuted: function() { return muted; },
    isPlaying: function() { return _bgmPlaying; },
  };
})();
