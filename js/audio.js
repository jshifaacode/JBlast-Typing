const Audio = (() => {
  let _ctx = null;
  let muted = false;
  let _bgm = null;
  let _bgmLoaded = false;
  const _bgmSrc = "assets/yorunikakeru-yoasobi.mp3";

  function ctx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }

  function resume() {
    try {
      if (ctx().state === "suspended") ctx().resume();
    } catch (e) {}
  }

  function tone(freq, type, dur, gain = 0.3) {
    resume();
    if (muted) return;
    try {
      const o = ctx().createOscillator(),
        g = ctx().createGain();
      o.connect(g);
      g.connect(ctx().destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, ctx().currentTime);
      g.gain.setValueAtTime(gain, ctx().currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx().currentTime + dur);
      o.start();
      o.stop(ctx().currentTime + dur);
    } catch (e) {}
  }

  function noise(dur, gain = 0.1) {
    resume();
    if (muted) return;
    try {
      const n = ctx().sampleRate * dur;
      const buf = ctx().createBuffer(1, n, ctx().sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx().createBufferSource(),
        g = ctx().createGain();
      g.gain.setValueAtTime(gain, ctx().currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx().currentTime + dur);
      s.buffer = buf;
      s.connect(g);
      g.connect(ctx().destination);
      s.start();
    } catch (e) {}
  }

  function _initBgm() {
    if (_bgm) return;
    _bgm = new window.Audio(_bgmSrc);
    _bgm.loop = true;
    _bgm.volume = muted ? 0 : 0.45;
    _bgm.preload = "auto";
    _bgm.addEventListener(
      "canplaythrough",
      () => {
        _bgmLoaded = true;
      },
      { once: true },
    );
    _bgm.addEventListener("error", () => {
      _bgm = null;
      _bgmLoaded = false;
    });
  }

  function playBgm() {
    _initBgm();
    if (!_bgm) return;
    _bgm.volume = muted ? 0 : 0.45;
    _bgm.currentTime = 0;

    const tryPlay = () => {
      if (!_bgm) return;
      const p = _bgm.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          const onInteract = () => {
            if (_bgm) _bgm.play().catch(() => {});
            document.removeEventListener("click", onInteract);
            document.removeEventListener("touchstart", onInteract);
          };
          document.addEventListener("click", onInteract, { once: true });
          document.addEventListener("touchstart", onInteract, { once: true });
        });
      }
    };

    if (_bgmLoaded) {
      tryPlay();
    } else {
      _bgm.addEventListener("canplaythrough", tryPlay, { once: true });
      _bgm.load();
    }
  }

  function stopBgm(fade) {
    if (!_bgm) return;
    if (fade) {
      const startVol = _bgm.volume;
      let v = startVol;
      const iv = setInterval(() => {
        v -= startVol / 20;
        if (_bgm) _bgm.volume = Math.max(0, v);
        if (v <= 0) {
          clearInterval(iv);
          if (_bgm) {
            _bgm.pause();
            _bgm.currentTime = 0;
          }
        }
      }, 50);
    } else {
      _bgm.pause();
      _bgm.currentTime = 0;
    }
  }

  function pauseBgm() {
    if (_bgm && !_bgm.paused) _bgm.pause();
  }

  function resumeBgm() {
    if (_bgm && _bgm.paused) _bgm.play().catch(() => {});
  }

  return {
    keyPress() {
      tone(800 + Math.random() * 200, "square", 0.04, 0.07);
    },
    keyCorrect() {
      tone(1200, "sine", 0.06, 0.1);
    },
    keyError() {
      tone(200, "sawtooth", 0.12, 0.14);
      noise(0.08, 0.07);
    },
    wordComplete() {
      tone(800, "sine", 0.05, 0.18);
      setTimeout(() => tone(1200, "sine", 0.05, 0.14), 60);
      setTimeout(() => tone(1600, "sine", 0.05, 0.1), 120);
    },
    hit() {
      tone(400, "sawtooth", 0.08, 0.2);
      noise(0.06, 0.05);
    },
    playerHit() {
      tone(150, "sawtooth", 0.2, 0.28);
      noise(0.15, 0.1);
    },
    comboUp(c) {
      tone(600 + c * 40, "sine", 0.05, 0.18);
    },
    overdrive() {
      for (let i = 0; i < 5; i++)
        setTimeout(() => tone(400 + i * 200, "sawtooth", 0.1, 0.14), i * 40);
    },
    freeze() {
      tone(2000, "sine", 0.3, 0.18);
      tone(1800, "sine", 0.3, 0.18);
    },
    burn() {
      noise(0.2, 0.14);
      tone(200, "sawtooth", 0.2, 0.18);
    },
    victory() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => tone(f, "sine", 0.2, 0.22), i * 100),
      );
    },
    defeat() {
      [400, 300, 200, 150].forEach((f, i) =>
        setTimeout(() => tone(f, "sawtooth", 0.25, 0.28), i * 150),
      );
    },
    playBgm,
    stopBgm,
    pauseBgm,
    resumeBgm,
    setMuted(v) {
      muted = v;
      if (_bgm) _bgm.volume = v ? 0 : 0.45;
    },
    isMuted() {
      return muted;
    },
  };
})();
